/**
 * Connection Status Indicator Component
 *
 * Displays the real-time connection status to users.
 * Shows nothing when connected, a pulsing indicator when connecting,
 * and a disconnected message with retry button on error.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useRealtimeStatus } from '@/providers/realtime-provider';

import { Button } from './ui/button';

// ============================================================================
// Types
// ============================================================================

export interface ConnectionStatusIndicatorProps {
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Visual indicator for real-time connection status.
 *
 * Requirements:
 * - 4.1: Hidden when status is 'connected'
 * - 4.2: Shows "Connecting..." with pulse animation when 'connecting'
 * - 4.3: Shows "Disconnected" with retry button when 'error'
 * - 4.4: Retry button invokes reconnect function
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <RealtimeProvider>
 *       <MyApp />
 *       <ConnectionStatusIndicator />
 *     </RealtimeProvider>
 *   );
 * }
 * ```
 */
export function ConnectionStatusIndicator({
  className,
}: ConnectionStatusIndicatorProps) {
  const { status, reconnect } = useRealtimeStatus();

  // Requirement 4.1: Return null when status is 'connected'
  if (status === 'connected') {
    return null;
  }

  // Requirement 4.1: Also return null when status is 'idle' (not yet started)
  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 z-50',
        'flex items-center gap-2',
        'bg-background rounded-md border px-3 py-2 shadow-lg',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {/* Requirement 4.2: Display "Connecting..." with pulse animation */}
      {status === 'connecting' && (
        <>
          <Wifi className="text-muted-foreground size-4 animate-pulse" />
          <span className="text-muted-foreground text-sm">Connecting...</span>
        </>
      )}

      {/* Requirement 4.3: Display "Disconnected" with retry button */}
      {status === 'error' && (
        <>
          <WifiOff className="text-destructive size-4" />
          <span className="text-destructive text-sm">Disconnected</span>
          {/* Requirement 4.4: Retry button invokes reconnect function */}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={reconnect}
            aria-label="Retry connection"
          >
            <RefreshCw className="size-3" />
          </Button>
        </>
      )}
    </div>
  );
}
