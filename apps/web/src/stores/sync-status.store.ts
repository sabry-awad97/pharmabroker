/**
 * Sync Status Store
 *
 * Global store for tracking sync status across all sessions.
 * This allows sync progress to be displayed regardless of which page the user is on.
 *
 * Feature: auto-sync-groups-messages
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

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

export interface SessionSyncStatus {
  status: SyncStatusState;
  progress: SyncProgress | null;
  error: string | null;
  lastSyncAt: Date | null;
  groupsSynced: number;
  messagesProcessed: number;
  messagesDropped: number;
}

interface SyncStatusStore {
  // Per-session sync status
  sessionSyncStatus: Map<string, SessionSyncStatus>;

  // Actions
  setSyncStarted: (sessionId: string, phase: SyncPhase) => void;
  setSyncProgress: (sessionId: string, progress: Partial<SyncProgress>) => void;
  setSyncCompleted: (
    sessionId: string,
    data: {
      groupsSynced?: number;
      messagesProcessed?: number;
      messagesDropped?: number;
    },
  ) => void;
  setSyncFailed: (sessionId: string, error: string) => void;
  resetSyncStatus: (sessionId: string) => void;
  getSyncStatus: (sessionId: string) => SessionSyncStatus;
}

// ============================================================================
// Default Status
// ============================================================================

const defaultSyncStatus: SessionSyncStatus = {
  status: 'idle',
  progress: null,
  error: null,
  lastSyncAt: null,
  groupsSynced: 0,
  messagesProcessed: 0,
  messagesDropped: 0,
};

// ============================================================================
// Store
// ============================================================================

export const useSyncStatusStore = create<SyncStatusStore>((set, get) => ({
  sessionSyncStatus: new Map(),

  setSyncStarted: (sessionId, phase) => {
    set(state => {
      const newMap = new Map(state.sessionSyncStatus);
      newMap.set(sessionId, {
        status: 'syncing',
        progress: { phase, current: 0 },
        error: null,
        lastSyncAt: null,
        groupsSynced: 0,
        messagesProcessed: 0,
        messagesDropped: 0,
      });
      return { sessionSyncStatus: newMap };
    });
  },

  setSyncProgress: (sessionId, progressUpdate) => {
    set(state => {
      const newMap = new Map(state.sessionSyncStatus);
      const current = newMap.get(sessionId) ?? { ...defaultSyncStatus };
      const currentProgress = current.progress ?? {
        phase: 'groups',
        current: 0,
      };

      newMap.set(sessionId, {
        ...current,
        status: 'syncing',
        progress: {
          phase: progressUpdate.phase ?? currentProgress.phase,
          current: progressUpdate.current ?? currentProgress.current,
          total: progressUpdate.total ?? currentProgress.total,
          groupsSynced:
            progressUpdate.groupsSynced ?? currentProgress.groupsSynced,
          messagesProcessed:
            progressUpdate.messagesProcessed ??
            currentProgress.messagesProcessed,
        },
        groupsSynced: progressUpdate.groupsSynced ?? current.groupsSynced,
        messagesProcessed:
          progressUpdate.messagesProcessed ?? current.messagesProcessed,
      });
      return { sessionSyncStatus: newMap };
    });
  },

  setSyncCompleted: (sessionId, data) => {
    set(state => {
      const newMap = new Map(state.sessionSyncStatus);
      const current = newMap.get(sessionId) ?? { ...defaultSyncStatus };

      newMap.set(sessionId, {
        ...current,
        status: 'completed',
        progress: null,
        error: null,
        lastSyncAt: new Date(),
        groupsSynced: data.groupsSynced ?? current.groupsSynced,
        messagesProcessed: data.messagesProcessed ?? current.messagesProcessed,
        messagesDropped: data.messagesDropped ?? current.messagesDropped,
      });
      return { sessionSyncStatus: newMap };
    });

    // Auto-reset to idle after 5 seconds
    setTimeout(() => {
      set(state => {
        const newMap = new Map(state.sessionSyncStatus);
        const current = newMap.get(sessionId);
        if (current?.status === 'completed') {
          newMap.set(sessionId, { ...current, status: 'idle' });
          return { sessionSyncStatus: newMap };
        }
        return state;
      });
    }, 5000);
  },

  setSyncFailed: (sessionId, error) => {
    set(state => {
      const newMap = new Map(state.sessionSyncStatus);
      const current = newMap.get(sessionId) ?? { ...defaultSyncStatus };

      newMap.set(sessionId, {
        ...current,
        status: 'failed',
        progress: null,
        error,
      });
      return { sessionSyncStatus: newMap };
    });
  },

  resetSyncStatus: sessionId => {
    set(state => {
      const newMap = new Map(state.sessionSyncStatus);
      newMap.set(sessionId, { ...defaultSyncStatus });
      return { sessionSyncStatus: newMap };
    });
  },

  getSyncStatus: sessionId => {
    return get().sessionSyncStatus.get(sessionId) ?? { ...defaultSyncStatus };
  },
}));

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * Get sync status for a specific session
 */
export function useSessionSyncStatus(
  sessionId: string | undefined,
): SessionSyncStatus {
  return useSyncStatusStore(
    useShallow(state =>
      sessionId
        ? (state.sessionSyncStatus.get(sessionId) ?? defaultSyncStatus)
        : defaultSyncStatus,
    ),
  );
}

/**
 * Get sync status actions
 */
export function useSyncStatusActions() {
  return useSyncStatusStore(
    useShallow(state => ({
      setSyncStarted: state.setSyncStarted,
      setSyncProgress: state.setSyncProgress,
      setSyncCompleted: state.setSyncCompleted,
      setSyncFailed: state.setSyncFailed,
      resetSyncStatus: state.resetSyncStatus,
    })),
  );
}

/**
 * Check if any session is currently syncing
 */
export function useAnySyncing(): boolean {
  return useSyncStatusStore(state => {
    for (const status of state.sessionSyncStatus.values()) {
      if (status.status === 'syncing') return true;
    }
    return false;
  });
}
