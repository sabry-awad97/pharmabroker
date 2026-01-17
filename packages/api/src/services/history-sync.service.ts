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
 * - Metrics tracking for monitoring
 */

import prisma from '@pharmabroker/db';
import type { HistorySyncStatus } from '@pharmabroker/schemas/whatsapp';
import { logger } from '@pharmabroker/logger';
import { recordHistorySync } from '@pharmabroker/metrics';
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
  // Track sync metadata for metrics
  private syncMetadata = new Map<
    string,
    { syncType: SyncStrategy; startTime: number }
  >();

  private logger = logger.child('HistorySyncService');
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

      this.logger.info('Updated connection timestamp', { sessionId });
    } else {
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { lastDisconnectedAt: now },
      });

      this.logger.info('Updated disconnection timestamp', { sessionId });
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
    this.logger.info('Starting full history sync', { sessionId });

    // Track sync start time for metrics
    this.syncMetadata.set(sessionId, {
      syncType: 'full_history',
      startTime: Date.now(),
    });

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
    this.logger.info('Starting incremental sync', {
      sessionId,
      since: since.toISOString(),
    });

    // Track sync start time for metrics
    this.syncMetadata.set(sessionId, {
      syncType: 'incremental',
      startTime: Date.now(),
    });

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
    this.logger.info('Skipping history sync', { sessionId });

    await this.updateSyncStatus(sessionId, 'skipped', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.skipped',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });

    // Record metrics for skipped sync
    recordHistorySync(sessionId, 'skip', 'skipped', 0, 0);
  }

  /**
   * Complete sync
   */
  async completeSync(sessionId: string, stats: SyncStats): Promise<void> {
    this.logger.info('Sync completed', {
      sessionId,
      stored: stats.stored,
      dropped: stats.dropped,
    });

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

    // Record metrics for successful sync
    const metadata = this.syncMetadata.get(sessionId);
    if (metadata) {
      const duration = Date.now() - metadata.startTime;
      recordHistorySync(
        sessionId,
        metadata.syncType,
        'success',
        duration,
        stats.stored,
      );
      this.syncMetadata.delete(sessionId);
    }
  }

  /**
   * Fail sync
   */
  async failSync(sessionId: string, error: string): Promise<void> {
    this.logger.error('Sync failed', { sessionId, error });

    await this.updateSyncStatus(sessionId, 'failed', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.failed',
      session_id: sessionId,
      data: { error },
      timestamp: new Date().toISOString(),
    });

    // Record metrics for failed sync
    const metadata = this.syncMetadata.get(sessionId);
    if (metadata) {
      const duration = Date.now() - metadata.startTime;
      recordHistorySync(sessionId, metadata.syncType, 'failure', duration, 0);
      this.syncMetadata.delete(sessionId);
    }
  }

  /**
   * Cancel sync
   */
  async cancelSync(sessionId: string): Promise<void> {
    this.logger.info('Cancelling sync', { sessionId });

    await this.updateSyncStatus(sessionId, 'cancelled', {
      completedAt: new Date(),
    });

    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.cancelled',
      session_id: sessionId,
      data: {},
      timestamp: new Date().toISOString(),
    });

    // Record metrics for cancelled sync
    const metadata = this.syncMetadata.get(sessionId);
    if (metadata) {
      const duration = Date.now() - metadata.startTime;
      recordHistorySync(sessionId, metadata.syncType, 'cancelled', duration, 0);
      this.syncMetadata.delete(sessionId);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const historySyncService = new HistorySyncService();
export { HistorySyncService };
