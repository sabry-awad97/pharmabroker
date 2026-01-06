/**
 * WhatsApp Router
 *
 * Type-safe oRPC router proxying to the WhatsApp Go microservice.
 * Uses centralized schemas from @pharmabroker/schemas.
 */

import { o, protectedProcedure } from '..';
import { eventIterator, EventPublisher } from '@orpc/server';
import { whatsappService } from '../services/whatsapp.service';
import {
  // Session schemas
  session,
  createSessionInput,
  sessionIdInput,
  sessionList,
  deleteSessionResponse,
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
  // Session Management
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
    .handler(async ({ input }) => whatsappService.createSession(input)),

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
    .handler(async () => whatsappService.listSessions()),

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
    .handler(async ({ input }) => whatsappService.getSession(input.id)),

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
    .handler(async ({ input }) => {
      await whatsappService.deleteSession(input.id);
      return { success: true as const };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Messaging
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
  // QR Authentication Stream
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
    .handler(async function* ({ input, signal }) {
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
  // Health Checks
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
