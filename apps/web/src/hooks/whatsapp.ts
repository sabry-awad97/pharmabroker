/**
 * WhatsApp TanStack Query Hooks
 *
 * Professional hooks for all WhatsApp router procedures.
 * Provides type-safe queries, mutations, and streaming subscriptions.
 */

import type {
  Session,
  SessionID,
  WhatsAppEvent,
} from '@pharmabroker/schemas/whatsapp';

import { isDefinedError } from '@orpc/client';
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { orpc, queryClient } from '../utils/orpc';

// ============================================================================
// Query Keys
// ============================================================================

export const whatsappKeys = {
  all: () => orpc.whatsapp.key(),
  sessions: {
    all: () => orpc.whatsapp.listSessions.key(),
    list: () => orpc.whatsapp.listSessions.queryKey(),
    detail: (id: string) =>
      orpc.whatsapp.getSession.queryKey({ input: { id } }),
  },
  health: {
    status: () => orpc.whatsapp.health.queryKey(),
    ready: () => orpc.whatsapp.ready.queryKey(),
  },
} as const;

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Fetch all WhatsApp sessions
 */
export function useWhatsappSessions() {
  return useQuery(
    orpc.whatsapp.listSessions.queryOptions({
      staleTime: 30 * 1000,
      refetchInterval: 60 * 1000,
    }),
  );
}

/**
 * Fetch all WhatsApp sessions with Suspense
 */
export function useWhatsappSessionsSuspense() {
  return useSuspenseQuery(
    orpc.whatsapp.listSessions.queryOptions({
      staleTime: 30 * 1000,
    }),
  );
}

/**
 * Fetch a single WhatsApp session by ID
 */
export function useWhatsappSession(id: string | undefined) {
  return useQuery({
    ...orpc.whatsapp.getSession.queryOptions({
      input: { id: id! },
    }),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single WhatsApp session with Suspense
 */
export function useWhatsappSessionSuspense(id: string) {
  return useSuspenseQuery(
    orpc.whatsapp.getSession.queryOptions({
      input: { id },
      staleTime: 30 * 1000,
    }),
  );
}

/**
 * Create a new WhatsApp session
 */
export function useCreateWhatsappSession() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.whatsapp.createSession.mutationOptions({
      onSuccess: newSession => {
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.all(),
        });
        queryClient.setQueryData(
          whatsappKeys.sessions.detail(newSession.id),
          newSession,
        );
      },
    }),
  );
}

/**
 * Delete a WhatsApp session
 */
export function useDeleteWhatsappSession() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.whatsapp.deleteSession.mutationOptions({
      onSuccess: (_, variables) => {
        queryClient.removeQueries({
          queryKey: whatsappKeys.sessions.detail(variables.id),
        });
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.all(),
        });
      },
    }),
  );
}

/**
 * Reconnect a WhatsApp session
 *
 * Enhanced with optimistic updates for immediate UI feedback.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 2.2, 2.3, 2.4
 */
export function useReconnectWhatsappSession() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.whatsapp.reconnectSession.mutationOptions({
      // Requirement 2.2: Optimistically update status to 'connecting' before server responds
      onMutate: async variables => {
        // Cancel any outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({
          queryKey: whatsappKeys.sessions.detail(variables.id),
        });
        await queryClient.cancelQueries({
          queryKey: whatsappKeys.sessions.list(),
        });

        // Snapshot the previous values for rollback
        const previousSession = queryClient.getQueryData<Session>(
          whatsappKeys.sessions.detail(variables.id),
        );
        const previousSessions = queryClient.getQueryData<Session[]>(
          whatsappKeys.sessions.list(),
        );

        // Optimistically update session detail to 'connecting' status
        if (previousSession) {
          queryClient.setQueryData<Session>(
            whatsappKeys.sessions.detail(variables.id),
            {
              ...previousSession,
              status: 'connecting',
            },
          );
        }

        // Optimistically update sessions list
        if (previousSessions) {
          queryClient.setQueryData<Session[]>(
            whatsappKeys.sessions.list(),
            previousSessions.map(session =>
              session.id === variables.id
                ? { ...session, status: 'connecting' as const }
                : session,
            ),
          );
        }

        // Return context with previous values for rollback
        return { previousSession, previousSessions };
      },

      // Requirement 2.3: Rollback on mutation failure
      onError: (_error, variables, context) => {
        // Restore previous session detail
        if (context?.previousSession) {
          queryClient.setQueryData(
            whatsappKeys.sessions.detail(variables.id),
            context.previousSession,
          );
        }

        // Restore previous sessions list
        if (context?.previousSessions) {
          queryClient.setQueryData(
            whatsappKeys.sessions.list(),
            context.previousSessions,
          );
        }
      },

      // Requirement 2.4: Invalidate queries on settle (success or failure)
      onSettled: (_, __, variables) => {
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.detail(variables.id),
        });
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.all(),
        });
      },
    }),
  );
}

/**
 * Disconnect a WhatsApp session
 *
 * Enhanced with optimistic updates for immediate UI feedback.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 2.1, 2.3, 2.4
 */
export function useDisconnectWhatsappSession() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.whatsapp.disconnectSession.mutationOptions({
      // Requirement 2.1: Optimistically update status to 'disconnecting' before server responds
      onMutate: async variables => {
        // Cancel any outgoing refetches to avoid overwriting optimistic update
        await queryClient.cancelQueries({
          queryKey: whatsappKeys.sessions.detail(variables.id),
        });
        await queryClient.cancelQueries({
          queryKey: whatsappKeys.sessions.list(),
        });

        // Snapshot the previous values for rollback
        const previousSession = queryClient.getQueryData<Session>(
          whatsappKeys.sessions.detail(variables.id),
        );
        const previousSessions = queryClient.getQueryData<Session[]>(
          whatsappKeys.sessions.list(),
        );

        // Optimistically update session detail to 'disconnecting' status
        if (previousSession) {
          queryClient.setQueryData<Session>(
            whatsappKeys.sessions.detail(variables.id),
            {
              ...previousSession,
              status: 'disconnected', // Use 'disconnected' as closest status
            },
          );
        }

        // Optimistically update sessions list
        if (previousSessions) {
          queryClient.setQueryData<Session[]>(
            whatsappKeys.sessions.list(),
            previousSessions.map(session =>
              session.id === variables.id
                ? { ...session, status: 'disconnected' as const }
                : session,
            ),
          );
        }

        // Return context with previous values for rollback
        return { previousSession, previousSessions };
      },

      // Requirement 2.3: Rollback on mutation failure
      onError: (_error, variables, context) => {
        // Restore previous session detail
        if (context?.previousSession) {
          queryClient.setQueryData(
            whatsappKeys.sessions.detail(variables.id),
            context.previousSession,
          );
        }

        // Restore previous sessions list
        if (context?.previousSessions) {
          queryClient.setQueryData(
            whatsappKeys.sessions.list(),
            context.previousSessions,
          );
        }
      },

      // Requirement 2.4: Invalidate queries on settle (success or failure)
      onSettled: (_, __, variables) => {
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.detail(variables.id),
        });
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.all(),
        });
      },
    }),
  );
}

/**
 * Update a WhatsApp session (name, auto_connect)
 */
export function useUpdateWhatsappSession() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.whatsapp.updateSession.mutationOptions({
      onSuccess: updatedSession => {
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.detail(updatedSession.id),
        });
        queryClient.invalidateQueries({
          queryKey: whatsappKeys.sessions.all(),
        });
      },
    }),
  );
}

// ============================================================================
// Messaging Hooks
// ============================================================================

/**
 * Send a WhatsApp message
 */
export function useSendWhatsappMessage() {
  return useMutation(orpc.whatsapp.sendMessage.mutationOptions());
}

/**
 * Send a WhatsApp message with callbacks
 */
export function useSendWhatsappMessageWithCallbacks(options?: {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}) {
  return useMutation(
    orpc.whatsapp.sendMessage.mutationOptions({
      onSuccess: options?.onSuccess,
      onError: options?.onError,
    }),
  );
}

// ============================================================================
// QR Streaming Hooks
// ============================================================================

export type QRStreamState = {
  status:
    | 'idle'
    | 'connecting'
    | 'streaming'
    | 'authenticated'
    | 'error'
    | 'timeout';
  qrCode: string | null;
  error: Error | null;
};

/**
 * Stream QR codes for WhatsApp authentication
 */
export function useWhatsappQRStream(sessionId: string | undefined) {
  const [state, setState] = useState<QRStreamState>({
    status: 'idle',
    qrCode: null,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async () => {
    if (!sessionId) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState({ status: 'connecting', qrCode: null, error: null });

    try {
      const iterator = await orpc.whatsapp.streamQR.call(
        { session_id: sessionId },
        { signal: abortControllerRef.current.signal },
      );

      setState(prev => ({ ...prev, status: 'streaming' }));

      for await (const event of iterator) {
        if (event.type === 'qr') {
          setState(prev => ({ ...prev, qrCode: event.data }));
        } else if (event.type === 'authenticated') {
          setState({ status: 'authenticated', qrCode: null, error: null });
          queryClient.invalidateQueries({
            queryKey: whatsappKeys.sessions.detail(sessionId),
          });
          queryClient.invalidateQueries({
            queryKey: whatsappKeys.sessions.all(),
          });
          break;
        } else if (event.type === 'timeout') {
          setState({ status: 'timeout', qrCode: null, error: null });
          break;
        } else if (event.type === 'error') {
          setState({
            status: 'error',
            qrCode: null,
            error: new Error(event.message),
          });
          break;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setState({
          status: 'error',
          qrCode: null,
          error: error instanceof Error ? error : new Error('Unknown error'),
        });
      }
    }
  }, [sessionId]);

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({ status: 'idle', qrCode: null, error: null });
  }, []);

  const retry = useCallback(() => {
    startStream();
  }, [startStream]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  return {
    ...state,
    startStream,
    stopStream,
    retry,
    isStreaming: state.status === 'streaming' || state.status === 'connecting',
  };
}

// ============================================================================
// Event Subscription Hooks
// ============================================================================

export type EventSubscriptionState = {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  events: WhatsAppEvent[];
  error: Error | null;
};

/**
 * Subscribe to WhatsApp events (messages, connection status, etc.)
 */
export function useWhatsappEvents(options?: {
  sessionId?: string;
  maxEvents?: number;
  onEvent?: (event: WhatsAppEvent) => void;
  autoConnect?: boolean;
}) {
  const {
    sessionId,
    maxEvents = 100,
    onEvent,
    autoConnect = false,
  } = options ?? {};

  const [state, setState] = useState<EventSubscriptionState>({
    status: 'idle',
    events: [],
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(async () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setState({ status: 'connecting', events: [], error: null });

    try {
      const input = sessionId ? { session_id: sessionId as SessionID } : {};
      const iterator = await orpc.whatsapp.subscribeEvents.call(input, {
        signal: abortControllerRef.current.signal,
      });

      setState(prev => ({ ...prev, status: 'connected' }));

      for await (const event of iterator) {
        onEventRef.current?.(event);
        setState(prev => ({
          ...prev,
          events: [...prev.events.slice(-(maxEvents - 1)), event],
        }));
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          status: 'error',
          error: error instanceof Error ? error : new Error('Unknown error'),
        }));
      }
    }
  }, [sessionId, maxEvents]);

  const disconnect = useCallback(() => {
    abortControllerRef.current?.abort();
    setState(prev => ({ ...prev, status: 'idle' }));
  }, []);

  const clearEvents = useCallback(() => {
    setState(prev => ({ ...prev, events: [] }));
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [autoConnect, connect]);

  return {
    ...state,
    connect,
    disconnect,
    clearEvents,
    isConnected: state.status === 'connected',
  };
}

// ============================================================================
// Health Check Hooks
// ============================================================================

/**
 * Check WhatsApp service health
 */
export function useWhatsappHealth() {
  return useQuery(
    orpc.whatsapp.health.queryOptions({
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    }),
  );
}

/**
 * Check WhatsApp service readiness
 */
export function useWhatsappReady() {
  return useQuery(
    orpc.whatsapp.ready.queryOptions({
      staleTime: 10 * 1000,
      refetchInterval: 30 * 1000,
    }),
  );
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Invalidate all WhatsApp queries
 */
export function useInvalidateWhatsapp() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: whatsappKeys.all() });
  }, [queryClient]);
}

/**
 * Prefetch WhatsApp sessions
 */
export function usePrefetchWhatsappSessions() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.prefetchQuery(orpc.whatsapp.listSessions.queryOptions());
  }, [queryClient]);
}

// ============================================================================
// Error Handling Utilities
// ============================================================================

export { isDefinedError };

export function isWhatsappError(error: unknown): error is Error {
  return error instanceof Error && isDefinedError(error);
}

// Re-export types
export type {
  Session,
  SessionStatus,
  CreateSessionInput,
  UpdateSessionInput,
  SendMessageInput,
  SendMessageResponse,
  MessageType,
  QREvent,
  WhatsAppEvent,
  HealthResponse,
  ReadyResponse,
  HealthStatus,
  ReadyStatus,
  SessionID,
  E164Phone,
} from '@pharmabroker/schemas/whatsapp';

export { healthStatus, readyStatus } from '@pharmabroker/schemas/whatsapp';
