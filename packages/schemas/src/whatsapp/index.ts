/**
 * @pharmabroker/schemas/whatsapp
 *
 * WhatsApp-related schemas for sessions, messages, and events.
 * All schemas match the Go WhatsApp microservice DTOs.
 * Uses Zod branded types for nominal typing.
 */

// Session schemas
export {
  sessionStatus,
  session,
  createSessionInput,
  sessionIdInput,
  sessionList,
  deleteSessionResponse,
  type SessionStatus,
  type Session,
  type CreateSessionInput,
  type SessionIdInput,
} from './session';

// Message schemas
export {
  messageType,
  messageStatus,
  messageContent,
  textContent,
  captionContent,
  filename,
  sendMessageInput,
  sendMessageResponse,
  textMessageInput,
  imageMessageInput,
  documentMessageInput,
  audioMessageInput,
  videoMessageInput,
  type MessageType,
  type MessageStatus,
  type MessageContent,
  type SendMessageInput,
  type SendMessageResponse,
  type TextMessageInput,
  type ImageMessageInput,
  type DocumentMessageInput,
  type AudioMessageInput,
  type VideoMessageInput,
  type TextContent,
  type Caption,
  type Filename,
} from './message';

// Event schemas
export {
  // QR events
  qrCodeData,
  qrCodeEvent,
  authenticatedEvent,
  authErrorEvent,
  authTimeoutEvent,
  qrEvent,
  // Message events
  messageReceivedEvent,
  messageSentEvent,
  messageDeliveredEvent,
  messageReadEvent,
  messageFailedEvent,
  messageEvent,
  // Connection events
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
  connectionEvent,
  // Session events
  sessionQrScannedEvent,
  sessionAuthenticatedEvent,
  sessionExpiredEvent,
  sessionEvent,
  // Combined
  whatsappEvent,
  whatsappEventType,
  // Inputs
  subscribeEventsInput,
  streamQrInput,
  // Types
  type QRCodeData,
  type QRCodeEvent,
  type AuthenticatedEvent,
  type AuthErrorEvent,
  type AuthTimeoutEvent,
  type QREvent,
  type MessageReceivedEvent,
  type MessageSentEvent,
  type MessageDeliveredEvent,
  type MessageReadEvent,
  type MessageFailedEvent,
  type MessageEvent,
  type ConnectionConnectedEvent,
  type ConnectionDisconnectedEvent,
  type ConnectionLoggedOutEvent,
  type ConnectionEvent,
  type SessionQrScannedEvent,
  type SessionAuthenticatedEvent,
  type SessionExpiredEvent,
  type SessionEvent,
  type WhatsAppEvent,
  type WhatsAppEventType,
  type SubscribeEventsInput,
  type StreamQrInput,
} from './events';

// Health schemas
export {
  healthStatus,
  readyStatus,
  healthResponse,
  readyResponse,
  type HealthStatus,
  type ReadyStatus,
  type HealthResponse,
  type ReadyResponse,
} from './health';

// Re-export branded types from common for convenience
export {
  sessionId,
  messageId,
  whatsappJid,
  e164Phone,
  type SessionID,
  type MessageID,
  type WhatsAppJID,
  type E164Phone,
} from '../common';

// ============================================================================
// Namespace export for convenient grouped access
// ============================================================================

import * as session from './session';
import * as message from './message';
import * as events from './events';
import * as health from './health';

export const whatsapp = {
  session,
  message,
  events,
  health,
} as const;
