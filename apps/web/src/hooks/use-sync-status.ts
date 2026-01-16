/**
 * Sync Status Hook
 *
 * Provides sync status for a session from the global sync status store.
 * The store is populated by the RealtimeProvider which handles sync events globally.
 *
 * Feature: auto-sync-groups-messages
 * Requirements: 4.1, 4.4
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useSessionSyncStatus,
  type SyncStatusState,
  type SyncProgress,
} from '../stores/sync-status.store';
import { whatsappGroupsKeys } from './whatsapp-groups';

// ============================================================================
// Types (re-exported from store)
// ============================================================================

export type {
  SyncPhase,
  SyncStatusState,
  SyncProgress,
} from '../stores/sync-status.store';

export interface SyncStatusResult {
  status: SyncStatusState;
  progress: SyncProgress | null;
  error: string | null;
  lastSyncAt: Date | null;
  groupsSynced: number;
  messagesProcessed: number;
  messagesDropped: number;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to get sync status for a session from the global store.
 * The RealtimeProvider handles sync events and updates the store.
 *
 * @param sessionId The session ID to track sync status for
 * @returns Sync status, progress, and error information
 */
export function useSyncStatus(sessionId: string | undefined): SyncStatusResult {
  const queryClient = useQueryClient();
  const syncStatus = useSessionSyncStatus(sessionId);

  // Invalidate groups queries when sync completes
  useEffect(() => {
    if (syncStatus.status === 'completed' && sessionId) {
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.counts(sessionId),
      });
    }
  }, [syncStatus.status, sessionId, queryClient]);

  return syncStatus;
}

/**
 * Check if sync is currently in progress
 */
export function isSyncing(status: SyncStatusState): boolean {
  return status === 'syncing';
}

/**
 * Check if sync completed successfully
 */
export function isSyncCompleted(status: SyncStatusState): boolean {
  return status === 'completed';
}

/**
 * Check if sync failed
 */
export function isSyncFailed(status: SyncStatusState): boolean {
  return status === 'failed';
}
