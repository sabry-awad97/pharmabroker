/**
 * History Sync Service
 *
 * Manages history synchronization logic for WhatsApp sessions.
 * Determines sync strategy (full/incremental/skip) and tracks sync progress.
 *
 * Features:
 * - Smart sync decision based on connection history
 * - Connection timestamp tracking
 * - Sync status and progress tracking
 * - Event publishing for frontend updates
 */

import prisma from '@pharmabroker/db';
import type { HistorySyncStatus } from '@pharmabroker/schemas/whatsapp';
import { whatsappEventPublisher } from '../routers/whatsapp.router';

// ============================================================================
// Types
// ============================================================================

interface Session {
  id: string;
  enableHistorySync: boolean;
  firstConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
}

type SyncStrategy = 'full_history' | 'incremental' | 'skip';

interface SyncStats {
  stored: number;
  dropped: number;
}

// ============================================================================
// History Sync Service
// ============================================================================

class HistorySyncService {
  /**
   * Determine sync strategy based on session state
   *
   * Logic:
   * - First connection + history enabled → full_history
   * - First connection + history disabled → skip
   * - Reconnection → incremental (always)
   */
  determineSyncStrategy(session: Session): SyncStrategy {
    // First connection ever
    if (!session.firstConnectedAt) {
      return session.enableHistorySync ? 'full_history' : 'skip';
    }

    // Reconnection - always sync missed messages
    if (session.lastDisconnectedAt) {
      return 'incremental';
    }

    return 'skip';
  }

  /**
   * Update connection timestamps
   */
  async updateConnectionTimestamps(
    sessionId: string,
    event: 'connected' | 'disconnected',
  ): Promise<void> {
    const now = new Date();

    if (event === 'connected') {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { firstConnectedAt: true },
      });

      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: {
          lastConnectedAt: now,
          // Set firstConnectedAt only if null
          ...(session?.firstConnectedAt === null && {
            firstConnectedAt: now,
          }),
        },
      });

      console.log(
        `[HistorySync] Updated connection timestamp for ${sessionId}`,
      );
    } else {
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { lastDisconnectedAt: now },
      });

      console.log(
        `[HistorySync] Updated disconnection timestamp for ${sessionId}`,
      );
    }
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(
    sessionId: string,
    status: HistorySyncStatus,
    data?: {
      progress?: number;
      total?: number;
      startedAt?: Date;
      completedAt?: Date;
    },
  ): Promise<void> {
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        historySyncStatus: status,
        ...(data?.progress !== undefined && {
          historySyncProgress: data.progress,
        }),
        ...(data?.total !== undefined && {
          historySyncTotal: data.total,
        }),
        ...(data?.startedAt && {
          historySyncStartedAt: data.startedAt,
        }),
        ...(data?.completedAt && {
          historySyncCompletedAt: data.completedAt,
        }),
      },
    });
  }

  /**
   * Trigger full history sync
   */
  async triggerFullHistorySync(sessionId: string): Promise<void> {
    console.log(`[HistorySync] Starting full history sync for ${sessionId}`);

    await this.updateSyncStatus(sessionId, 'in_progress', {
      progress: 0,
      startedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.started',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });

    // Note: Go service will emit history messages via WebSocket
    // Messages will be queued and processed after group sync
  }

  /**
   * Trigger incremental sync
   */
  async triggerIncrementalSync(sessionId: string, since: Date): Promise<void> {
    console.log(
      `[HistorySync] Starting incremental sync for ${sessionId} since ${since.toISOString()}`,
    );

    await this.updateSyncStatus(sessionId, 'in_progress', {
      progress: 0,
      startedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.started',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Skip history sync
   */
  async skipHistorySync(sessionId: string): Promise<void> {
    console.log(`[HistorySync] Skipping history sync for ${sessionId}`);

    await this.updateSyncStatus(sessionId, 'skipped', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.skipped',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Complete sync
   */
  async completeSync(sessionId: string, stats: SyncStats): Promise<void> {
    console.log(
      `[HistorySync] Sync completed for ${sessionId}: ${stats.stored} stored, ${stats.dropped} dropped`,
    );

    await this.updateSyncStatus(sessionId, 'completed', {
      progress: stats.stored,
      total: stats.stored + stats.dropped,
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.completed',
      session_id: sessionId,
      data: {
        messagesProcessed: stats.stored,
        messagesDropped: stats.dropped,
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Fail sync
   */
  async failSync(sessionId: string, error: string): Promise<void> {
    console.error(`[HistorySync] Sync failed for ${sessionId}: ${error}`);

    await this.updateSyncStatus(sessionId, 'failed', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.failed',
      session_id: sessionId,
      data: { error },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Cancel sync
   */
  async cancelSync(sessionId: string): Promise<void> {
    console.log(`[HistorySync] Cancelling sync for ${sessionId}`);

    await this.updateSyncStatus(sessionId, 'cancelled', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.cancelled',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const historySyncService = new HistorySyncService();
export { HistorySyncService };
