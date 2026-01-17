/**
 * Async Group Sync Service
 *
 * Provides non-blocking group synchronization with progress events.
 * Returns immediately with a syncId, runs sync in background,
 * and emits progress/completion events via WebSocket.
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { whatsappGroupsService } from './whatsapp-groups.service';
import { whatsappEventPublisher } from '../routers/whatsapp.router';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type SyncStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'timeout';

export interface SyncState {
  syncId: string;
  sessionId: string;
  status: SyncStatus;
  startedAt: Date;
  completedAt?: Date;
  progress: number; // 0-100
  groupsProcessed: number;
  totalGroups: number;
  error?: string;
}

export interface AsyncSyncResponse {
  syncId: string;
  status: 'in_progress';
}

export interface SyncProgressEvent {
  type: 'group_sync.progress';
  syncId: string;
  sessionId: string;
  progress: number;
  groupsProcessed: number;
  totalGroups: number;
}

export interface SyncCompleteEvent {
  type: 'group_sync.complete';
  syncId: string;
  sessionId: string;
  success: boolean;
  groupCount: number;
  durationMs: number;
  errors?: string[];
}

export interface SyncTimeoutEvent {
  type: 'group_sync.timeout';
  syncId: string;
  sessionId: string;
  timeoutMs: number;
}

// ============================================================================
// Configuration
// ============================================================================

const SYNC_CONFIG = {
  /** Timeout for sync operations (ms) */
  TIMEOUT_MS: 60_000,
  /** How often to emit progress events (ms) */
  PROGRESS_INTERVAL_MS: 2_000,
  /** Maximum sync states to keep in memory */
  MAX_SYNC_STATES: 100,
} as const;

// ============================================================================
// Async Group Sync Service
// ============================================================================

export class AsyncGroupSyncService {
  /** In-memory sync state storage */
  private syncStates: Map<string, SyncState> = new Map();

  /** Active sync operations by session (to prevent duplicates) */
  private activeSyncs: Map<string, string> = new Map(); // sessionId -> syncId

  /**
   * Start an async group sync operation.
   * Returns immediately with syncId, runs sync in background.
   */
  async startSync(sessionId: string): Promise<AsyncSyncResponse> {
    // Check if there's already an active sync for this session
    const existingSyncId = this.activeSyncs.get(sessionId);
    if (existingSyncId) {
      const existingState = this.syncStates.get(existingSyncId);
      if (existingState && existingState.status === 'in_progress') {
        // Return existing sync instead of starting a new one
        return {
          syncId: existingSyncId,
          status: 'in_progress',
        };
      }
    }

    // Generate new sync ID
    const syncId = randomUUID();

    // Initialize sync state
    const state: SyncState = {
      syncId,
      sessionId,
      status: 'in_progress',
      startedAt: new Date(),
      progress: 0,
      groupsProcessed: 0,
      totalGroups: 0,
    };

    this.syncStates.set(syncId, state);
    this.activeSyncs.set(sessionId, syncId);

    // Cleanup old states if we have too many
    this.cleanupOldStates();

    // Start the sync in background (don't await)
    this.runSyncWithTimeout(syncId, sessionId).catch(error => {
      console.error(
        `[AsyncGroupSync] Unexpected error in background sync ${syncId}:`,
        error,
      );
    });

    return {
      syncId,
      status: 'in_progress',
    };
  }

  /**
   * Get the current status of a sync operation.
   */
  getSyncStatus(syncId: string): SyncState | null {
    return this.syncStates.get(syncId) ?? null;
  }

  /**
   * Get sync status by session ID (returns most recent sync).
   */
  getSyncStatusBySession(sessionId: string): SyncState | null {
    const syncId = this.activeSyncs.get(sessionId);
    if (!syncId) return null;
    return this.syncStates.get(syncId) ?? null;
  }

  /**
   * Run the sync operation with timeout handling.
   */
  private async runSyncWithTimeout(
    syncId: string,
    sessionId: string,
  ): Promise<void> {
    const state = this.syncStates.get(syncId);
    if (!state) return;

    // Create timeout promise
    const timeoutPromise = new Promise<'timeout'>(resolve => {
      setTimeout(() => resolve('timeout'), SYNC_CONFIG.TIMEOUT_MS);
    });

    // Create sync promise
    const syncPromise = this.runSync(syncId, sessionId);

    // Race between sync and timeout
    const result = await Promise.race([syncPromise, timeoutPromise]);

    if (result === 'timeout') {
      this.handleTimeout(syncId, sessionId);
    }
  }

  /**
   * Run the actual sync operation.
   */
  private async runSync(
    syncId: string,
    sessionId: string,
  ): Promise<'completed'> {
    const state = this.syncStates.get(syncId);
    if (!state) return 'completed';

    try {
      // Emit initial progress event
      this.emitProgressEvent(state);

      // Run the actual sync
      const result = await whatsappGroupsService.syncGroupsInternal(sessionId);

      // Update state with completion
      state.status = 'completed';
      state.completedAt = new Date();
      state.progress = 100;
      state.groupsProcessed = result.synced;
      state.totalGroups = result.synced;

      // Emit completion event
      this.emitCompleteEvent(state, result.errors);

      // Clear active sync
      this.activeSyncs.delete(sessionId);

      return 'completed';
    } catch (error) {
      // Update state with failure
      state.status = 'failed';
      state.completedAt = new Date();
      state.error = error instanceof Error ? error.message : 'Unknown error';

      // Emit failure event
      this.emitCompleteEvent(state, [state.error]);

      // Clear active sync
      this.activeSyncs.delete(sessionId);

      return 'completed';
    }
  }

  /**
   * Handle sync timeout.
   */
  private handleTimeout(syncId: string, sessionId: string): void {
    const state = this.syncStates.get(syncId);
    if (!state) return;

    // Only update if still in progress
    if (state.status !== 'in_progress') return;

    state.status = 'timeout';
    state.completedAt = new Date();
    state.error = `Sync timed out after ${SYNC_CONFIG.TIMEOUT_MS}ms`;

    // Emit timeout event
    this.emitTimeoutEvent(state);

    // Clear active sync
    this.activeSyncs.delete(sessionId);
  }

  /**
   * Emit progress event to frontend clients.
   */
  private emitProgressEvent(state: SyncState): void {
    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.progress' as any,
      session_id: state.sessionId,
      timestamp: new Date().toISOString(),
      data: {
        phase: 'groups' as const,
        current: state.groupsProcessed,
        total: state.totalGroups,
        groupsSynced: state.groupsProcessed,
      },
    });
  }

  /**
   * Emit completion event to frontend clients.
   */
  private emitCompleteEvent(state: SyncState, errors?: string[]): void {
    whatsappEventPublisher.publish('whatsapp-event', {
      type:
        state.status === 'completed'
          ? ('sync.completed' as any)
          : ('sync.failed' as any),
      session_id: state.sessionId,
      timestamp: new Date().toISOString(),
      data:
        state.status === 'completed'
          ? {
              groupsSynced: state.groupsProcessed,
            }
          : {
              error: errors?.join(', '),
            },
    });
  }

  /**
   * Emit timeout event to frontend clients.
   */
  private emitTimeoutEvent(state: SyncState): void {
    whatsappEventPublisher.publish('whatsapp-event', {
      type: 'sync.failed' as any,
      session_id: state.sessionId,
      timestamp: new Date().toISOString(),
      data: {
        error: `Sync operation timed out after ${SYNC_CONFIG.TIMEOUT_MS}ms`,
      },
    });
  }

  /**
   * Cleanup old sync states to prevent memory leaks.
   */
  private cleanupOldStates(): void {
    if (this.syncStates.size <= SYNC_CONFIG.MAX_SYNC_STATES) return;

    // Get all states sorted by startedAt (oldest first)
    const states = Array.from(this.syncStates.entries())
      .map(([id, state]) => ({ id, state }))
      .sort(
        (a, b) => a.state.startedAt.getTime() - b.state.startedAt.getTime(),
      );

    // Remove oldest completed/failed states until we're under the limit
    const toRemove = states.length - SYNC_CONFIG.MAX_SYNC_STATES;
    let removed = 0;

    for (const { id, state } of states) {
      if (removed >= toRemove) break;
      if (state.status !== 'in_progress') {
        this.syncStates.delete(id);
        removed++;
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let asyncGroupSyncInstance: AsyncGroupSyncService | null = null;

/**
 * Get or create the AsyncGroupSyncService singleton.
 */
export function getAsyncGroupSyncService(): AsyncGroupSyncService {
  if (!asyncGroupSyncInstance) {
    asyncGroupSyncInstance = new AsyncGroupSyncService();
  }
  return asyncGroupSyncInstance;
}

export const asyncGroupSyncService = getAsyncGroupSyncService();
