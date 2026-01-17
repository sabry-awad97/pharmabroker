/**
 * WhatsApp Router
 *
 * Type-safe oRPC router for WhatsApp session management.
 * Sessions are stored in PostgreSQL via Prisma.
 * WhatsApp operations (connect, QR, messages) are proxied to Go microservice.
 */

import { o, protectedProcedure } from '..';
import { eventIterator, EventPublisher } from '@orpc/server';
import { whatsappService } from '../services/whatsapp.service';
import { historySyncService } from '../services/history-sync.service';
import { whatsappGroupsRouter } from './whatsapp-groups.router';
import { whatsappMessagesRouter } from './whatsapp-messages.router';
import {
  // Session schemas
  session,
  createSessionInput,
  updateSessionInput,
  sessionIdInput,
  sessionList,
  deleteSessionResponse,
  reconnectSessionResponse,
  // History sync schemas
  updateHistorySyncInput,
  triggerSyncInput,
  cancelSyncInput,
  historySyncStatusResponse,
  successResponse,
  // Message schemas
  sendMessageInput,
  sendMessageResponse,
  // Event schemas
  qrEvent,
  whatsappEvent,
  subscribeEventsInput,
  streamQrInput,
  // Health schemas
  healthResponse,
  readyResponse,
  // Types
  type QREvent,
  type WhatsAppEvent,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Event Publisher
// ============================================================================

export const whatsappEventPublisher = new EventPublisher<{
  'whatsapp-event': WhatsAppEvent;
}>();

// ============================================================================
// WhatsApp Router
// ============================================================================

export const whatsappRouter = o.router({
  // ─────────────────────────────────────────────────────────────────────────
  // Session Management (Prisma)
  // ─────────────────────────────────────────────────────────────────────────

  createSession: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/sessions',
        tags: ['WhatsApp Sessions'],
        summary: 'Create a new WhatsApp session',
        description:
          'Creates a new WhatsApp session that can be authenticated via QR code.',
      },
    })
    .input(createSessionInput)
    .output(session)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappService.createSession(userId, input);
    }),

  listSessions: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/sessions',
        tags: ['WhatsApp Sessions'],
        summary: 'List all WhatsApp sessions',
        description:
          'Returns a list of all WhatsApp sessions for the authenticated user.',
      },
    })
    .output(sessionList)
    .handler(async ({ context }) => {
      const userId = context.session!.user.id;
      return whatsappService.listSessions(userId);
    }),

  getSession: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/sessions/{id}',
        tags: ['WhatsApp Sessions'],
        summary: 'Get a WhatsApp session',
        description: 'Returns details of a specific WhatsApp session by ID.',
      },
    })
    .input(sessionIdInput)
    .output(session)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappService.getSession(userId, input.id);
    }),

  deleteSession: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/whatsapp/sessions/{id}',
        tags: ['WhatsApp Sessions'],
        summary: 'Delete a WhatsApp session',
        description:
          'Deletes a WhatsApp session and disconnects it from WhatsApp.',
      },
    })
    .input(sessionIdInput)
    .output(deleteSessionResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      await whatsappService.deleteSession(userId, input.id);
      return { success: true as const };
    }),

  updateSession: protectedProcedure
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/whatsapp/sessions/{id}',
        tags: ['WhatsApp Sessions'],
        summary: 'Update a WhatsApp session',
        description:
          'Updates session settings like name and auto-connect preference.',
      },
    })
    .input(updateSessionInput)
    .output(session)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappService.updateSession(userId, input);
    }),

  reconnectSession: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/sessions/{id}/reconnect',
        tags: ['WhatsApp Sessions'],
        summary: 'Reconnect a WhatsApp session',
        description:
          'Attempts to reconnect a previously authenticated session using stored credentials. No QR scan needed if credentials are still valid.',
      },
    })
    .input(sessionIdInput)
    .output(reconnectSessionResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappService.reconnectSession(userId, input.id);
    }),

  disconnectSession: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/sessions/{id}/disconnect',
        tags: ['WhatsApp Sessions'],
        summary: 'Disconnect a WhatsApp session',
        description:
          'Disconnects a session without deleting it. Credentials are preserved for reconnection.',
      },
    })
    .input(sessionIdInput)
    .output(reconnectSessionResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappService.disconnectSession(userId, input.id);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // History Sync Management
  // ─────────────────────────────────────────────────────────────────────────

  updateHistorySync: protectedProcedure
    .meta({
      openapi: {
        method: 'PATCH',
        path: '/whatsapp/sessions/{id}/history-sync',
        tags: ['WhatsApp Sessions'],
        summary: 'Update history sync setting',
        description:
          'Enable or disable history sync for a session. Can only be changed before first connection.',
      },
    })
    .input(updateHistorySyncInput)
    .output(session)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Verify session belongs to user and get current state
      const existingSession = await whatsappService.getSession(
        userId,
        input.id,
      );

      // Prevent changing setting after first connection
      if (existingSession.first_connected_at) {
        throw new Error(
          'Cannot change history sync setting after first connection',
        );
      }

      return whatsappService.updateSession(userId, {
        id: input.id,
        enable_history_sync: input.enable_history_sync,
      });
    }),

  triggerHistorySync: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/sessions/{id}/sync-history',
        tags: ['WhatsApp Sessions'],
        summary: 'Manually trigger history sync',
        description:
          'Manually trigger a history sync for a connected session. Useful for re-syncing after errors.',
      },
    })
    .input(triggerSyncInput)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Verify session belongs to user and is connected
      const session = await whatsappService.getSession(userId, input.id);

      if (session.status !== 'connected') {
        throw new Error('Session must be connected to trigger sync');
      }

      if (session.history_sync_status === 'in_progress') {
        throw new Error('Sync already in progress');
      }

      // Determine sync type based on history
      if (!session.first_connected_at) {
        await historySyncService.triggerFullHistorySync(input.id);
      } else if (session.last_disconnected_at) {
        await historySyncService.triggerIncrementalSync(
          input.id,
          new Date(session.last_disconnected_at),
        );
      } else {
        throw new Error('No sync needed - session has not been disconnected');
      }

      return {
        success: true as const,
        message: 'History sync triggered successfully',
      };
    }),

  cancelHistorySync: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/sessions/{id}/cancel-sync',
        tags: ['WhatsApp Sessions'],
        summary: 'Cancel ongoing history sync',
        description:
          'Cancel an in-progress history sync. Already synced messages will be preserved.',
      },
    })
    .input(cancelSyncInput)
    .output(successResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Verify session belongs to user
      const session = await whatsappService.getSession(userId, input.id);

      if (session.history_sync_status !== 'in_progress') {
        throw new Error('No sync in progress to cancel');
      }

      await historySyncService.cancelSync(input.id);

      return {
        success: true as const,
        message: 'History sync cancelled successfully',
      };
    }),

  getHistorySyncStatus: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/sessions/{id}/sync-status',
        tags: ['WhatsApp Sessions'],
        summary: 'Get history sync status',
        description:
          'Get the current history sync status and progress for a session.',
      },
    })
    .input(sessionIdInput)
    .output(historySyncStatusResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Verify session belongs to user
      const session = await whatsappService.getSession(userId, input.id);

      return {
        status: session.history_sync_status,
        progress: session.history_sync_progress,
        total: session.history_sync_total,
        started_at: session.history_sync_started_at,
        completed_at: session.history_sync_completed_at,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Messaging (Go Service)
  // ─────────────────────────────────────────────────────────────────────────

  sendMessage: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages',
        tags: ['WhatsApp Messages'],
        summary: 'Send a WhatsApp message',
        description:
          'Sends a message (text, image, document, audio, or video) via WhatsApp.',
      },
    })
    .input(sendMessageInput)
    .output(sendMessageResponse)
    .handler(async ({ input }) => whatsappService.sendMessage(input)),

  // ─────────────────────────────────────────────────────────────────────────
  // QR Authentication Stream (Go Service WebSocket)
  // ─────────────────────────────────────────────────────────────────────────

  streamQR: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/sessions/{session_id}/qr',
        tags: ['WhatsApp Authentication'],
        summary: 'Stream QR codes for authentication',
        description:
          'Server-Sent Events stream that provides QR codes for WhatsApp authentication. Scan the QR code with WhatsApp to authenticate the session.',
      },
    })
    .input(streamQrInput)
    .output(eventIterator(qrEvent))
    .handler(async function* ({ input, signal, context }) {
      const userId = context.session!.user.id;

      // Verify session belongs to user
      await whatsappService.getSession(userId, input.session_id);

      const wsUrl = whatsappService.getQRWebSocketUrl(input.session_id);
      const ws = new WebSocket(wsUrl);

      const messageQueue: QREvent[] = [];
      let resolveNext: ((value: QREvent | null) => void) | null = null;
      let closed = false;

      ws.onmessage = event => {
        try {
          const data = JSON.parse(event.data as string);
          const parsed = qrEvent.safeParse(data);
          if (parsed.success) {
            // Update session status on authentication
            if (parsed.data.type === 'authenticated' && parsed.data.data?.jid) {
              whatsappService
                .updateSessionJid(input.session_id, parsed.data.data.jid)
                .catch(() => {});
            }

            if (resolveNext) {
              resolveNext(parsed.data);
              resolveNext = null;
            } else {
              messageQueue.push(parsed.data);
            }
          }
        } catch {
          /* ignore malformed */
        }
      };

      ws.onclose = () => {
        closed = true;
        resolveNext?.(null);
        resolveNext = null;
      };

      ws.onerror = () => {
        closed = true;
        resolveNext?.(null);
        resolveNext = null;
      };

      signal?.addEventListener('abort', () => ws.close());

      try {
        while (!closed && !signal?.aborted) {
          const event = await new Promise<QREvent | null>(resolve => {
            if (messageQueue.length > 0) resolve(messageQueue.shift()!);
            else if (closed) resolve(null);
            else resolveNext = resolve;
          });

          if (event === null) break;
          yield event;
          if (event.type === 'authenticated' || event.type === 'timeout') break;
        }
      } finally {
        ws.close();
      }
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Real-time Events Subscription
  // ─────────────────────────────────────────────────────────────────────────

  subscribeEvents: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/events',
        tags: ['WhatsApp Events'],
        summary: 'Subscribe to WhatsApp events',
        description:
          'Server-Sent Events stream for real-time WhatsApp events including messages, connection status, and session updates. Optionally filter by session_id.',
      },
    })
    .input(subscribeEventsInput)
    .output(eventIterator(whatsappEvent))
    .handler(async function* ({ input, signal }) {
      for await (const event of whatsappEventPublisher.subscribe(
        'whatsapp-event',
        { signal },
      )) {
        if (
          input.session_id &&
          'session_id' in event &&
          event.session_id !== input.session_id
        ) {
          continue;
        }
        yield event;
      }
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Health Checks (Go Service)
  // ─────────────────────────────────────────────────────────────────────────

  health: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/health',
        tags: ['WhatsApp Health'],
        summary: 'Check WhatsApp service health',
        description: 'Returns the health status of the WhatsApp microservice.',
      },
    })
    .output(healthResponse)
    .handler(async () => whatsappService.health()),

  ready: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/ready',
        tags: ['WhatsApp Health'],
        summary: 'Check WhatsApp service readiness',
        description:
          'Returns the readiness status of the WhatsApp microservice and its components.',
      },
    })
    .output(readyResponse)
    .handler(async () => whatsappService.ready()),

  // ─────────────────────────────────────────────────────────────────────────
  // Groups Management (Sub-router)
  // ─────────────────────────────────────────────────────────────────────────

  groups: whatsappGroupsRouter,

  // ─────────────────────────────────────────────────────────────────────────
  // Messages Management (Sub-router)
  // ─────────────────────────────────────────────────────────────────────────

  messages: whatsappMessagesRouter,
});

// ============================================================================
// Re-export schemas for backward compatibility
// ============================================================================

export {
  session,
  createSessionInput,
  sendMessageInput,
  sendMessageResponse,
  qrEvent,
  whatsappEvent,
} from '@pharmabroker/schemas/whatsapp';

export const schemas = {
  session,
  createSessionInput,
  sendMessageInput,
  sendMessageResponse,
  qrEvent,
  whatsappEvent,
};
