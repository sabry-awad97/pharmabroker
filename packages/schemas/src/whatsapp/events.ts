/**
 * WhatsApp Event Schemas
 *
 * Schemas for real-time WhatsApp events (QR auth, messages, connections).
 * Uses branded types for type-safe session IDs.
 */

import { z } from 'zod';
import { sessionId, whatsappJid } from '../common';

// ============================================================================
// QR Authentication Events
// ============================================================================

/** Base64 QR code data branded type */
export const qrCodeData = z.string().brand<'QRCodeData'>();

/** QR code event - contains base64 PNG */
export const qrCodeEvent = z.object({
  type: z.literal('qr'),
  data: qrCodeData,
});

/** Authentication success event */
export const authenticatedEvent = z.object({
  type: z.literal('authenticated'),
  data: z.object({
    jid: whatsappJid,
  }),
});

/** Authentication error event */
export const authErrorEvent = z.object({
  type: z.literal('error'),
  message: z.string(),
});

/** Authentication timeout event */
export const authTimeoutEvent = z.object({
  type: z.literal('timeout'),
});

/** Union of all QR authentication events */
export const qrEvent = z.union([
  qrCodeEvent,
  authenticatedEvent,
  authErrorEvent,
  authTimeoutEvent,
]);

// ============================================================================
// Message Events
// ============================================================================

const messageEventData = z.record(z.string(), z.unknown());

export const messageReceivedEvent = z.object({
  type: z.literal('message.received'),
  session_id: sessionId,
  data: messageEventData,
});

export const messageSentEvent = z.object({
  type: z.literal('message.sent'),
  session_id: sessionId,
  data: messageEventData,
});

export const messageDeliveredEvent = z.object({
  type: z.literal('message.delivered'),
  session_id: sessionId,
  data: messageEventData,
});

export const messageReadEvent = z.object({
  type: z.literal('message.read'),
  session_id: sessionId,
  data: messageEventData,
});

export const messageFailedEvent = z.object({
  type: z.literal('message.failed'),
  session_id: sessionId,
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
// Connection Events
// ============================================================================

export const connectionConnectedEvent = z.object({
  type: z.literal('connection.connected'),
  session_id: sessionId,
});

export const connectionDisconnectedEvent = z.object({
  type: z.literal('connection.disconnected'),
  session_id: sessionId,
});

export const connectionLoggedOutEvent = z.object({
  type: z.literal('connection.logged_out'),
  session_id: sessionId,
});

/** Union of all connection events */
export const connectionEvent = z.union([
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
]);

// ============================================================================
// Session Events
// ============================================================================

export const sessionQrScannedEvent = z.object({
  type: z.literal('session.qr_scanned'),
  session_id: sessionId,
});

export const sessionAuthenticatedEvent = z.object({
  type: z.literal('session.authenticated'),
  session_id: sessionId,
  data: z.object({
    jid: whatsappJid,
  }),
});

export const sessionExpiredEvent = z.object({
  type: z.literal('session.expired'),
  session_id: sessionId,
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
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
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
  'connection.connected',
  'connection.disconnected',
  'connection.logged_out',
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

export type QRCodeData = z.infer<typeof qrCodeData>;
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

export type ConnectionConnectedEvent = z.infer<typeof connectionConnectedEvent>;
export type ConnectionDisconnectedEvent = z.infer<
  typeof connectionDisconnectedEvent
>;
export type ConnectionLoggedOutEvent = z.infer<typeof connectionLoggedOutEvent>;
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
