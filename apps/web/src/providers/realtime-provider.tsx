/**
 * Real-Time Provider
 *
 * React context provider that manages the SSE connection state
 * and provides real-time synchronization capabilities to the app.
 * Also handles global sync status tracking for all sessions.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 3.1, 3.2, 3.3, 6.1, 6.2, 6.3
 */

import * as React from 'react';

import type { WhatsAppEvent } from '@pharmabroker/schemas/whatsapp';

import { useRealtimeSync } from '../hooks/use-realtime-sync';
import { useSyncStatusActions } from '../stores/sync-status.store';

// ============================================================================
// Types
// ============================================================================

export interface RealtimeContextValue {
  /** Current connection status */
  status: 'idle' | 'connecting' | 'connected' | 'error';
  /** Whether the connection is established (Requirement 3.2) */
  isConnected: boolean;
  /** Manually retry the connection (Requirement 3.3) */
  reconnect: () => void;
}

export interface RealtimeProviderProps {
  children: React.ReactNode;
  /** Enable/disable auto-connect (Requirement 6.3) */
  enabled?: boolean;
}

// ============================================================================
// Context
// ============================================================================

/**
 * React context for real-time connection state.
 * Requirement 3.1: Expose current connection status
 */
const RealtimeContext = React.createContext<RealtimeContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

/**
 * Provider component that manages the real-time SSE connection.
 *
 * Requirements:
 * - 3.1: Exposes current connection status
 * - 3.2: Exposes isConnected boolean flag
 * - 3.3: Exposes reconnect function
 * - 6.1: Auto-connects on mount
 * - 6.2: Disconnects on unmount (handled by useRealtimeSync)
 * - 6.3: Respects enabled option
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       <RealtimeProvider>
 *         <MyApp />
 *       </RealtimeProvider>
 *     </QueryClientProvider>
 *   );
 * }
 * ```
 */
export function RealtimeProvider({
  children,
  enabled = true,
}: RealtimeProviderProps) {
  // Get sync status actions for global sync tracking
  const { setSyncStarted, setSyncProgress, setSyncCompleted, setSyncFailed } =
    useSyncStatusActions();

  // Handle sync events globally
  const handleSyncEvent = React.useCallback(
    (event: WhatsAppEvent) => {
      const sessionId = event.session_id;
      if (!sessionId) return;

      // Log sync events for debugging
      if (event.type.startsWith('sync.')) {
        console.log(
          '[RealtimeProvider] Received sync event:',
          event.type,
          event,
        );
      }

      switch (event.type) {
        case 'sync.started': {
          const data = (event as { data?: { phase?: 'groups' | 'messages' } })
            .data;
          setSyncStarted(sessionId, data?.phase ?? 'groups');
          break;
        }

        case 'sync.progress': {
          const data = (
            event as {
              data?: {
                phase?: 'groups' | 'messages';
                current?: number;
                total?: number;
                groupsSynced?: number;
                messagesProcessed?: number;
              };
            }
          ).data;
          if (data) {
            setSyncProgress(sessionId, {
              phase: data.phase,
              current: data.current,
              total: data.total,
              groupsSynced: data.groupsSynced,
              messagesProcessed: data.messagesProcessed,
            });
          }
          break;
        }

        case 'sync.completed': {
          const data = (
            event as {
              data?: {
                groupsSynced?: number;
                messagesProcessed?: number;
                messagesDropped?: number;
              };
            }
          ).data;
          setSyncCompleted(sessionId, {
            groupsSynced: data?.groupsSynced,
            messagesProcessed: data?.messagesProcessed,
            messagesDropped: data?.messagesDropped,
          });
          break;
        }

        case 'sync.failed': {
          const data = (event as { data?: { error?: string } }).data;
          setSyncFailed(sessionId, data?.error ?? 'Sync failed');
          break;
        }
      }
    },
    [setSyncStarted, setSyncProgress, setSyncCompleted, setSyncFailed],
  );

  // Use the realtime sync hook with auto-connect based on enabled prop
  const { status, isConnected, reconnect } = useRealtimeSync({
    enabled,
    onEvent: handleSyncEvent,
  });

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = React.useMemo<RealtimeContextValue>(
    () => ({
      status,
      isConnected,
      reconnect,
    }),
    [status, isConnected, reconnect],
  );

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access the real-time connection status.
 *
 * Must be used within a RealtimeProvider.
 * Throws an error if used outside the provider.
 *
 * @returns The real-time context value
 * @throws Error if used outside RealtimeProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, isConnected, reconnect } = useRealtimeStatus();
 *
 *   if (!isConnected) {
 *     return <button onClick={reconnect}>Reconnect</button>;
 *   }
 *
 *   return <div>Connected!</div>;
 * }
 * ```
 */
export function useRealtimeStatus(): RealtimeContextValue {
  const context = React.useContext(RealtimeContext);

  if (context === null) {
    throw new Error(
      'useRealtimeStatus must be used within a RealtimeProvider. ' +
        'Wrap your component tree with <RealtimeProvider>.',
    );
  }

  return context;
}

// ============================================================================
// Exports
// ============================================================================

export { RealtimeContext };
