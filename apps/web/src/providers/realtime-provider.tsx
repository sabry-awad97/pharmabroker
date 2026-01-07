/**
 * Real-Time Provider
 *
 * React context provider that manages the SSE connection state
 * and provides real-time synchronization capabilities to the app.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 3.1, 3.2, 3.3, 6.1, 6.2, 6.3
 */

import * as React from 'react';

import { useRealtimeSync } from '../hooks/use-realtime-sync';

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
  // Use the realtime sync hook with auto-connect based on enabled prop
  const { status, isConnected, reconnect } = useRealtimeSync({
    enabled,
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
