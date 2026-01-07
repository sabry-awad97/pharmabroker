/**
 * WhatsApp Event Schemas
 *
 * Schemas for real-time WhatsApp events (QR auth, messages, connections).
 * Uses unbranded types for output validation (data from Go service).
 * Uses branded types for input validation (session IDs from client).
 */

import { z } from 'zod';
import { sessionId, unbranded } from '../common';

// ============================================================================
// QR Authentication Events (unbranded - received from Go service)
// ============================================================================

/** QR code event - contains base64 PNG */
export const qrCodeEvent = z.object({
  type: z.literal('qr'),
  data: z.string(), // base64 PNG
});

/** Authentication success event */
export const authenticatedEvent = z.object({
  type: z.literal('authenticated'),
  data: z.object({
    jid: z.string(),
  }),
  message: z.string().optional(),
});

/** Authentication error event */
export const authErrorEvent = z.object({
  type: z.literal('error'),
  data: z
    .object({
      code: z.string(),
    })
    .optional(),
  message: z.string(),
});

/** Authentication timeout event */
export const authTimeoutEvent = z.object({
  type: z.literal('timeout'),
  message: z.string().optional(),
});

/** Union of all QR authentication events */
export const qrEvent = z.union([
  qrCodeEvent,
  authenticatedEvent,
  authErrorEvent,
  authTimeoutEvent,
]);

// ============================================================================
// Message Events (unbranded for output)
// ============================================================================

const messageEventData = z.record(z.string(), z.unknown());

export const messageReceivedEvent = z.object({
  type: z.literal('message.received'),
  session_id: unbranded.uuid,
  data: messageEventData,
});

export const messageSentEvent = z.object({
  type: z.literal('message.sent'),
  session_id: unbranded.uuid,
  data: messageEventData,
});

export const messageDeliveredEvent = z.object({
  type: z.literal('message.delivered'),
  session_id: unbranded.uuid,
  data: messageEventData,
});

export const messageReadEvent = z.object({
  type: z.literal('message.read'),
  session_id: unbranded.uuid,
  data: messageEventData,
});

export const messageFailedEvent = z.object({
  type: z.literal('message.failed'),
  session_id: unbranded.uuid,
  data: messageEventData,
});

/** Union of all message events */
export const messageEvent = z.union([
  messageReceivedEvent,
  messageSentEvent,
  messageDeliveredEvent,
  messageReadEvent,
  messageFailedEvent,
]);

// ============================================================================
// Connection Events (unbranded for output)
// ============================================================================

export const connectionConnectingEvent = z.object({
  type: z.literal('connection.connecting'),
  session_id: unbranded.uuid,
  timestamp: z.iso.datetime(),
});

export const connectionConnectedEvent = z.object({
  type: z.literal('connection.connected'),
  session_id: unbranded.uuid,
});

export const connectionDisconnectedEvent = z.object({
  type: z.literal('connection.disconnected'),
  session_id: unbranded.uuid,
});

export const connectionLoggedOutEvent = z.object({
  type: z.literal('connection.logged_out'),
  session_id: unbranded.uuid,
});

export const connectionFailedEvent = z.object({
  type: z.literal('connection.failed'),
  session_id: unbranded.uuid,
  timestamp: z.iso.datetime(),
  data: z.object({
    error_code: z.string(),
    error_message: z.string(),
  }),
});

/** Union of all connection events */
export const connectionEvent = z.discriminatedUnion('type', [
  connectionConnectingEvent,
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
  connectionFailedEvent,
]);

// ============================================================================
// Session Events (unbranded for output)
// ============================================================================

export const sessionQrScannedEvent = z.object({
  type: z.literal('session.qr_scanned'),
  session_id: unbranded.uuid,
});

export const sessionAuthenticatedEvent = z.object({
  type: z.literal('session.authenticated'),
  session_id: unbranded.uuid,
  data: z.object({
    jid: z.string(),
  }),
});

export const sessionExpiredEvent = z.object({
  type: z.literal('session.expired'),
  session_id: unbranded.uuid,
});

/** Union of all session events */
export const sessionEvent = z.union([
  sessionQrScannedEvent,
  sessionAuthenticatedEvent,
  sessionExpiredEvent,
]);

// ============================================================================
// Combined WhatsApp Event
// ============================================================================

/** All WhatsApp real-time events */
export const whatsappEvent = z.discriminatedUnion('type', [
  // Message events
  messageReceivedEvent,
  messageSentEvent,
  messageDeliveredEvent,
  messageReadEvent,
  messageFailedEvent,
  // Connection events
  connectionConnectingEvent,
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
  connectionFailedEvent,
  // Session events
  sessionQrScannedEvent,
  sessionAuthenticatedEvent,
  sessionExpiredEvent,
]);

/** Event types for type-safe event handling */
export const whatsappEventType = z.enum([
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'connection.connecting',
  'connection.connected',
  'connection.disconnected',
  'connection.logged_out',
  'connection.failed',
  'session.qr_scanned',
  'session.authenticated',
  'session.expired',
]);

// ============================================================================
// Subscription Input
// ============================================================================

/** Subscribe to events input */
export const subscribeEventsInput = z.object({
  session_id: sessionId.optional(),
});

/** Stream QR input */
export const streamQrInput = z.object({
  session_id: sessionId,
});

// ============================================================================
// Types
// ============================================================================

export type QRCodeEvent = z.infer<typeof qrCodeEvent>;
export type AuthenticatedEvent = z.infer<typeof authenticatedEvent>;
export type AuthErrorEvent = z.infer<typeof authErrorEvent>;
export type AuthTimeoutEvent = z.infer<typeof authTimeoutEvent>;
export type QREvent = z.infer<typeof qrEvent>;

export type MessageReceivedEvent = z.infer<typeof messageReceivedEvent>;
export type MessageSentEvent = z.infer<typeof messageSentEvent>;
export type MessageDeliveredEvent = z.infer<typeof messageDeliveredEvent>;
export type MessageReadEvent = z.infer<typeof messageReadEvent>;
export type MessageFailedEvent = z.infer<typeof messageFailedEvent>;
export type MessageEvent = z.infer<typeof messageEvent>;

export type ConnectionConnectingEvent = z.infer<
  typeof connectionConnectingEvent
>;
export type ConnectionConnectedEvent = z.infer<typeof connectionConnectedEvent>;
export type ConnectionDisconnectedEvent = z.infer<
  typeof connectionDisconnectedEvent
>;
export type ConnectionLoggedOutEvent = z.infer<typeof connectionLoggedOutEvent>;
export type ConnectionFailedEvent = z.infer<typeof connectionFailedEvent>;
export type ConnectionEvent = z.infer<typeof connectionEvent>;

export type SessionQrScannedEvent = z.infer<typeof sessionQrScannedEvent>;
export type SessionAuthenticatedEvent = z.infer<
  typeof sessionAuthenticatedEvent
>;
export type SessionExpiredEvent = z.infer<typeof sessionExpiredEvent>;
export type SessionEvent = z.infer<typeof sessionEvent>;

export type WhatsAppEvent = z.infer<typeof whatsappEvent>;
export type WhatsAppEventType = z.infer<typeof whatsappEventType>;

export type SubscribeEventsInput = z.infer<typeof subscribeEventsInput>;
export type StreamQrInput = z.infer<typeof streamQrInput>;
