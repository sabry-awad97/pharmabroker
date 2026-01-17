/**
 * Real-Time Synchronization Hook
 *
 * Subscribes to WhatsApp events via SSE and automatically invalidates
 * relevant TanStack Query caches to keep the UI in sync.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import type { WhatsAppEvent } from '@pharmabroker/schemas/whatsapp';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { createBatchInvalidator } from '../utils/batch-invalidate';
import { useWhatsappEvents, whatsappKeys } from './whatsapp';
import { messageKeys } from './whatsapp-messages';

// ============================================================================
// Types
// ============================================================================

export interface UseRealtimeSyncOptions {
  /** Filter events to a specific session */
  sessionId?: string;
  /** Callback for each received event */
  onEvent?: (event: WhatsAppEvent) => void;
  /** Enable/disable the subscription (default: true) */
  enabled?: boolean;
  /** Debounce delay for batch invalidation in ms (default: 100) */
  debounceMs?: number;
}

export interface UseRealtimeSyncReturn {
  /** Current connection status */
  status: 'idle' | 'connecting' | 'connected' | 'error';
  /** Whether the connection is established */
  isConnected: boolean;
  /** Array of received events */
  events: WhatsAppEvent[];
  /** Manually connect to the event stream */
  connect: () => void;
  /** Disconnect from the event stream */
  disconnect: () => void;
  /** Reconnect to the event stream */
  reconnect: () => void;
}

// ============================================================================
// Event Deduplication
// ============================================================================

/**
 * Cache for tracking processed message events to prevent duplicate handling
 */
const processedMessageEvents = new Map<string, number>();
const MESSAGE_EVENT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Check if a message event has been processed recently
 */
function isMessageEventDuplicate(event: WhatsAppEvent): boolean {
  if (event.type !== 'message.received') {
    return false; // Only deduplicate message events
  }

  const data = event.data as { messageId?: string } | undefined;
  const messageId = data?.messageId;
  const sessionId = 'session_id' in event ? event.session_id : undefined;

  if (!messageId || !sessionId) {
    return false; // Can't deduplicate without IDs
  }

  const dedupKey = `${sessionId}:${messageId}`;
  const now = Date.now();
  const lastProcessed = processedMessageEvents.get(dedupKey);

  if (lastProcessed && now - lastProcessed < MESSAGE_EVENT_TTL) {
    console.log(
      `[useRealtimeSync] Skipping duplicate message event: ${messageId}`,
    );
    return true;
  }

  // Mark as processed
  processedMessageEvents.set(dedupKey, now);

  // Cleanup old entries periodically
  if (processedMessageEvents.size % 50 === 0) {
    cleanupMessageEventCache();
  }

  return false;
}

/**
 * Cleanup expired entries from message event cache
 */
function cleanupMessageEventCache(): void {
  const now = Date.now();
  const toDelete: string[] = [];

  for (const [key, timestamp] of processedMessageEvents.entries()) {
    if (now - timestamp > MESSAGE_EVENT_TTL) {
      toDelete.push(key);
    }
  }

  for (const key of toDelete) {
    processedMessageEvents.delete(key);
  }

  if (toDelete.length > 0) {
    console.log(
      `[useRealtimeSync] Cleaned up ${toDelete.length} expired message event entries`,
    );
  }
}

// ============================================================================
// Event Invalidation Map
// ============================================================================

/**
 * Maps WhatsApp event types to query keys that should be invalidated.
 *
 * Each event type maps to a function that returns an array of query keys
 * to invalidate. The function receives the optional session_id from the event.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */
export const EVENT_INVALIDATION_MAP: Record<
  string,
  (sessionId?: string) => readonly unknown[][]
> = {
  // Requirement 1.1: connection.connected invalidates sessions list and detail
  'connection.connected': sessionId => [
    [...whatsappKeys.sessions.list()],
    ...(sessionId ? [[...whatsappKeys.sessions.detail(sessionId)]] : []),
  ],

  // Requirement 1.2: connection.disconnected invalidates sessions list and detail
  'connection.disconnected': sessionId => [
    [...whatsappKeys.sessions.list()],
    ...(sessionId ? [[...whatsappKeys.sessions.detail(sessionId)]] : []),
  ],

  // Requirement 1.3: session.authenticated invalidates sessions list and detail
  'session.authenticated': sessionId => [
    [...whatsappKeys.sessions.list()],
    ...(sessionId ? [[...whatsappKeys.sessions.detail(sessionId)]] : []),
  ],

  // Requirement 1.4: connection.logged_out invalidates sessions list and detail
  'connection.logged_out': sessionId => [
    [...whatsappKeys.sessions.list()],
    ...(sessionId ? [[...whatsappKeys.sessions.detail(sessionId)]] : []),
  ],

  // Message received: invalidate messages list for the session
  'message.received': sessionId => [
    ...(sessionId
      ? [[...messageKeys.list({ sessionId, limit: 50, cursor: undefined })]]
      : []),
  ],
};

/**
 * Get query keys to invalidate for a given event.
 *
 * @param eventType - The WhatsApp event type
 * @param sessionId - Optional session ID from the event
 * @returns Array of query keys to invalidate
 */
export function getInvalidationKeys(
  eventType: string,
  sessionId?: string,
): readonly unknown[][] {
  const mapper = EVENT_INVALIDATION_MAP[eventType];
  if (!mapper) {
    return [];
  }
  return mapper(sessionId);
}

/**
 * Extract session_id from a WhatsApp event if present.
 *
 * @param event - The WhatsApp event
 * @returns The session_id or undefined
 */
export function extractSessionId(event: WhatsAppEvent): string | undefined {
  if ('session_id' in event && typeof event.session_id === 'string') {
    return event.session_id;
  }
  return undefined;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for real-time synchronization with WhatsApp events.
 *
 * Subscribes to the SSE event stream and automatically invalidates
 * relevant TanStack Query caches when events arrive.
 *
 * @param options - Configuration options
 * @returns Connection state and control functions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { status, isConnected, reconnect } = useRealtimeSync({
 *     onEvent: (event) => console.log('Event:', event),
 *   });
 *
 *   return <div>Status: {status}</div>;
 * }
 * ```
 */
export function useRealtimeSync(
  options: UseRealtimeSyncOptions = {},
): UseRealtimeSyncReturn {
  const { sessionId, onEvent, enabled = true, debounceMs } = options;

  const queryClient = useQueryClient();

  // Create batch invalidator (memoized to avoid recreating on each render)
  const batchInvalidator = useMemo(
    () => createBatchInvalidator(queryClient, debounceMs),
    [queryClient, debounceMs],
  );

  // Store onEvent callback in ref to avoid recreating handleEvent
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  // Handle incoming events
  const handleEvent = useCallback(
    (event: WhatsAppEvent) => {
      // Deduplicate message events
      if (isMessageEventDuplicate(event)) {
        return; // Skip duplicate
      }

      // Call user's onEvent callback
      onEventRef.current?.(event);

      // Get the session_id from the event (Requirement 1.5)
      const eventSessionId = extractSessionId(event);

      // Get query keys to invalidate based on event type
      const keysToInvalidate = getInvalidationKeys(event.type, eventSessionId);

      // Queue all keys for batch invalidation
      for (const queryKey of keysToInvalidate) {
        batchInvalidator.invalidate(queryKey);
      }
    },
    [batchInvalidator],
  );

  // Use the existing useWhatsappEvents hook
  const { status, events, connect, disconnect, isConnected } =
    useWhatsappEvents({
      sessionId,
      onEvent: handleEvent,
      autoConnect: enabled,
    });

  // Cleanup batch invalidator on unmount
  useEffect(() => {
    return () => {
      batchInvalidator.cancel();
    };
  }, [batchInvalidator]);

  // Reconnect function
  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  return {
    status,
    isConnected,
    events,
    connect,
    disconnect,
    reconnect,
  };
}
