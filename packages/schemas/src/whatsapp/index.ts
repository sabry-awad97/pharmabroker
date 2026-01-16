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
  updateSessionInput,
  sessionIdInput,
  sessionList,
  deleteSessionResponse,
  reconnectSessionResponse,
  type SessionStatus,
  type Session,
  type CreateSessionInput,
  type UpdateSessionInput,
  type SessionIdInput,
  type ReconnectSessionResponse,
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
  connectionConnectingEvent,
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
  connectionFailedEvent,
  connectionEvent,
  // Session events
  sessionQrScannedEvent,
  sessionAuthenticatedEvent,
  sessionExpiredEvent,
  sessionEvent,
  // Sync events
  syncProgressData,
  syncStartedEvent,
  syncProgressEvent,
  syncCompletedEvent,
  syncFailedEvent,
  syncEvent,
  // Combined
  whatsappEvent,
  whatsappEventType,
  // Inputs
  subscribeEventsInput,
  streamQrInput,
  // Types
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
  type ConnectionConnectingEvent,
  type ConnectionConnectedEvent,
  type ConnectionDisconnectedEvent,
  type ConnectionLoggedOutEvent,
  type ConnectionFailedEvent,
  type ConnectionEvent,
  type SessionQrScannedEvent,
  type SessionAuthenticatedEvent,
  type SessionExpiredEvent,
  type SessionEvent,
  type SyncProgressData,
  type SyncStartedEvent,
  type SyncProgressEvent,
  type SyncCompletedEvent,
  type SyncFailedEvent,
  type SyncEvent,
  type WhatsAppEvent,
  type WhatsAppEventType,
  type SubscribeEventsInput,
  type StreamQrInput,
} from './events';

// Health schemas
export {
  healthStatus,
  readyStatus,
  componentStatus,
  healthResponse,
  readyResponse,
  type HealthStatus,
  type ReadyStatus,
  type ComponentStatus,
  type HealthResponse,
  type ReadyResponse,
} from './health';

// Groups schemas
export {
  participantRole,
  groupFilterType,
  whatsAppGroupParticipant,
  whatsAppGroup,
  whatsAppGroupWithParticipants,
  groupList,
  groupFilterInput,
  groupIdInput,
  syncGroupsInput,
  participantFilterInput,
  filterCountsInput,
  groupsListResponse,
  participantsListResponse,
  syncGroupsResponse,
  filterCountsResponse,
  type ParticipantRole,
  type GroupFilterType,
  type WhatsAppGroup,
  type WhatsAppGroupParticipant,
  type WhatsAppGroupWithParticipants,
  type GroupFilterInput,
  type GroupIdInput,
  type SyncGroupsInput,
  type ParticipantFilterInput,
  type FilterCountsInput,
  type GroupsListResponse,
  type ParticipantsListResponse,
  type SyncGroupsResponse,
  type FilterCountsResponse,
} from './groups';

// Messages schemas (stored messages with AI processing)
export {
  // Enums
  storedMessageType,
  storedMessageStatus,
  messageSource,
  aiStatus,
  extractedDataType,
  // Output schemas
  whatsAppMessage,
  whatsAppMessageWithGroup,
  whatsAppExtractedData,
  whatsAppMessageDetail,
  // Input schemas
  messageFilterInput,
  messageIdInput,
  bulkDeleteInput,
  syncMessagesInput,
  exportMessagesInput,
  processMessageInput,
  bulkProcessInput,
  messageStatsInput,
  // Response schemas
  messagesListResponse,
  messageDetailResponse,
  messageStatsResponse,
  deleteMessageResponse,
  bulkDeleteResponse,
  syncMessagesResponse,
  processMessageResponse,
  bulkProcessResponse,
  exportMessagesResponse,
  // Types
  type StoredMessageType,
  type StoredMessageStatus,
  type MessageSource,
  type AIStatus,
  type ExtractedDataType,
  type WhatsAppMessage as StoredWhatsAppMessage,
  type WhatsAppMessageWithGroup,
  type WhatsAppExtractedData,
  type WhatsAppMessageDetail,
  type MessageFilterInput,
  type MessageIdInput,
  type BulkDeleteInput,
  type SyncMessagesInput,
  type ExportMessagesInput,
  type ProcessMessageInput,
  type BulkProcessInput,
  type MessageStatsInput,
  type MessagesListResponse,
  type MessageDetailResponse,
  type MessageStatsResponse,
  type DeleteMessageResponse,
  type BulkDeleteResponse,
  type SyncMessagesResponse,
  type ProcessMessageResponse,
  type BulkProcessResponse,
  type ExportMessagesResponse,
} from './messages';

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
import * as groups from './groups';
import * as messages from './messages';

export const whatsapp = {
  session,
  message,
  events,
  health,
  groups,
  messages,
} as const;
