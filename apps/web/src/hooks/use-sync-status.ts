/**
 * Sync Status Hook
 *
 * Subscribes to WebSocket sync status events for real-time sync progress tracking.
 * Tracks sync state per session (idle, syncing, completed, failed).
 *
 * Feature: auto-sync-groups-messages
 * Requirements: 4.1, 4.4
 */

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  WhatsAppEvent,
  SyncStartedEvent,
  SyncProgressEvent,
  SyncCompletedEvent,
  SyncFailedEvent,
} from '@pharmabroker/schemas/whatsapp';
import { useRealtimeSync } from './use-realtime-sync';
import { whatsappGroupsKeys } from './whatsapp-groups';

// ============================================================================
// Types
// ============================================================================

export type SyncPhase = 'groups' | 'messages';

export type SyncStatusState = 'idle' | 'syncing' | 'completed' | 'failed';

export interface SyncProgress {
  phase: SyncPhase;
  current: number;
  total?: number;
  groupsSynced?: number;
  messagesProcessed?: number;
  messagesDropped?: number;
}

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
 * Hook to track sync status for a session via WebSocket events
 * @param sessionId The session ID to track sync status for
 * @returns Sync status, progress, and error information
 */
export function useSyncStatus(sessionId: string | undefined): SyncStatusResult {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<SyncStatusState>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [groupsSynced, setGroupsSynced] = useState(0);
  const [messagesProcessed, setMessagesProcessed] = useState(0);
  const [messagesDropped, setMessagesDropped] = useState(0);

  // Handle sync events
  const handleSyncEvent = useCallback(
    (event: WhatsAppEvent) => {
      // Only process events for our session
      if (event.session_id !== sessionId) return;

      switch (event.type) {
        case 'sync.started': {
          const data = (event as SyncStartedEvent).data;
          setStatus('syncing');
          setProgress({
            phase: data?.phase ?? 'groups',
            current: 0,
          });
          setError(null);
          setGroupsSynced(0);
          setMessagesProcessed(0);
          setMessagesDropped(0);
          break;
        }

        case 'sync.progress': {
          const data = (event as SyncProgressEvent).data;
          setProgress(prev => ({
            phase: data?.phase ?? prev?.phase ?? 'groups',
            current: data?.current ?? prev?.current ?? 0,
            total: data?.total ?? prev?.total,
            groupsSynced: data?.groupsSynced ?? prev?.groupsSynced,
            messagesProcessed:
              data?.messagesProcessed ?? prev?.messagesProcessed,
          }));
          if (data?.groupsSynced !== undefined) {
            setGroupsSynced(data.groupsSynced);
          }
          if (data?.messagesProcessed !== undefined) {
            setMessagesProcessed(data.messagesProcessed);
          }
          break;
        }

        case 'sync.completed': {
          const data = (event as SyncCompletedEvent).data;
          setStatus('completed');
          setProgress(null);
          setLastSyncAt(new Date());
          if (data?.groupsSynced !== undefined) {
            setGroupsSynced(data.groupsSynced);
          }
          if (data?.messagesProcessed !== undefined) {
            setMessagesProcessed(data.messagesProcessed);
          }
          if (data?.messagesDropped !== undefined) {
            setMessagesDropped(data.messagesDropped);
          }

          // Invalidate groups queries to refresh the list
          queryClient.invalidateQueries({
            queryKey: whatsappGroupsKeys.lists(),
          });
          queryClient.invalidateQueries({
            queryKey: whatsappGroupsKeys.counts(sessionId),
          });

          // Auto-reset to idle after 5 seconds
          setTimeout(() => {
            setStatus('idle');
          }, 5000);
          break;
        }

        case 'sync.failed': {
          const data = (event as SyncFailedEvent).data;
          setStatus('failed');
          setProgress(null);
          setError(data?.error ?? 'Sync failed');
          break;
        }
      }
    },
    [sessionId, queryClient],
  );

  // Subscribe to realtime events
  useRealtimeSync({
    sessionId,
    onEvent: handleSyncEvent,
    enabled: !!sessionId,
  });

  // Reset state when session changes
  useEffect(() => {
    setStatus('idle');
    setProgress(null);
    setError(null);
    setGroupsSynced(0);
    setMessagesProcessed(0);
    setMessagesDropped(0);
  }, [sessionId]);

  return {
    status,
    progress,
    error,
    lastSyncAt,
    groupsSynced,
    messagesProcessed,
    messagesDropped,
  };
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
