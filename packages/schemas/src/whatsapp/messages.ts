/**
 * WhatsApp Messages Schemas
 *
 * Schemas for WhatsApp message storage, retrieval, and AI processing.
 * Matches the Prisma WhatsAppMessage and WhatsAppExtractedData models.
 */

import { z } from 'zod';
import { unbranded } from '../common';

// ============================================================================
// Enums
// ============================================================================

/** Message type enum matching Prisma WhatsAppMessageType */
export const storedMessageType = z.enum([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'contact',
  'location',
  'poll',
  'reaction',
  'protocol',
  'unknown',
]);

/** Message status enum matching Prisma WhatsAppMessageStatus */
export const storedMessageStatus = z.enum([
  'received',
  'sent',
  'delivered',
  'read',
  'failed',
]);

/** Message source enum matching Prisma WhatsAppMessageSource */
export const messageSource = z.enum(['realtime', 'history']);

/** AI processing status enum matching Prisma WhatsAppAIStatus */
export const aiStatus = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'skipped',
]);

/** Extracted data type - flexible string for different extraction types */
export const extractedDataType = z.string();

// ============================================================================
// Output Schemas
// ============================================================================

/** WhatsApp message entity - list item */
export const whatsAppMessage = z.object({
  id: unbranded.uuid,
  messageId: z.string(),
  sessionId: unbranded.uuid,
  groupId: unbranded.uuid,
  senderJid: z.string(),
  senderPushName: z.string().nullable(),
  participantId: unbranded.uuid.nullable(),
  messageType: storedMessageType,
  text: z.string().nullable(),
  caption: z.string().nullable(),
  filename: z.string().nullable(),
  mimetype: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  mediaSize: z.number().nullable(),
  isFromMe: z.boolean(),
  isForwarded: z.boolean(),
  isViewOnce: z.boolean(),
  isBroadcast: z.boolean(),
  quotedMessageId: z.string().nullable(),
  status: storedMessageStatus,
  messageTimestamp: z.coerce.date(),
  receivedAt: z.coerce.date(),
  source: messageSource,
  aiStatus: aiStatus,
  aiModel: z.string().nullable(),
  aiError: z.string().nullable(),
  aiRetryCount: z.number().int().min(0),
  aiProcessedAt: z.coerce.date().nullable(),
});

/** WhatsApp message with group info for list display */
export const whatsAppMessageWithGroup = whatsAppMessage.extend({
  group: z.object({
    id: unbranded.uuid,
    name: z.string(),
    jid: z.string(),
  }),
  participant: z
    .object({
      id: unbranded.uuid,
      displayName: z.string().nullable(),
      jid: z.string(),
    })
    .nullable(),
});

/** Extracted data entity */
export const whatsAppExtractedData = z.object({
  id: unbranded.uuid,
  messageId: unbranded.uuid,
  dataType: extractedDataType,
  data: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).nullable(),
  model: z.string().nullable(),
  promptHash: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/** Message detail with extracted data and raw payload */
export const whatsAppMessageDetail = whatsAppMessageWithGroup.extend({
  extractedData: z.array(whatsAppExtractedData),
  rawPayload: z.unknown().nullable(),
});

// ============================================================================
// Input Schemas
// ============================================================================

/** Message filter input for list queries */
export const messageFilterInput = z.object({
  sessionId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  search: z.string().optional(),
  messageType: storedMessageType.optional(),
  aiStatus: aiStatus.optional(),
  source: messageSource.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

/** Get single message input */
export const messageIdInput = z.object({
  messageId: z.string().uuid(),
});

/** Bulk delete messages input */
export const bulkDeleteInput = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Sync messages input */
export const syncMessagesInput = z.object({
  sessionId: z.string().uuid(),
});

/** Export messages input */
export const exportMessagesInput = z.object({
  format: z.enum(['json', 'csv']),
  sessionId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  messageType: storedMessageType.optional(),
  aiStatus: aiStatus.optional(),
  source: messageSource.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

/** Process message with AI input */
export const processMessageInput = z.object({
  messageId: z.string().uuid(),
});

/** Bulk process messages with AI input */
export const bulkProcessInput = z.object({
  messageIds: z.array(z.string().uuid()).min(1).max(100),
});

/** Message stats input */
export const messageStatsInput = z.object({
  sessionId: z.string().uuid().optional(),
});

// ============================================================================
// Response Schemas
// ============================================================================

/** Paginated messages response */
export const messagesListResponse = z.object({
  messages: z.array(whatsAppMessageWithGroup),
  nextCursor: z.string().optional(),
  total: z.number().int().min(0),
});

/** Single message detail response */
export const messageDetailResponse = whatsAppMessageDetail;

/** Message statistics response */
export const messageStatsResponse = z.object({
  total: z.number().int().min(0),
  byType: z.record(storedMessageType, z.number().int().min(0)),
  byAIStatus: z.record(aiStatus, z.number().int().min(0)),
  bySource: z.record(messageSource, z.number().int().min(0)),
});

/** Delete message response */
export const deleteMessageResponse = z.object({
  success: z.literal(true),
});

/** Bulk delete response */
export const bulkDeleteResponse = z.object({
  deleted: z.number().int().min(0),
});

/** Sync messages response */
export const syncMessagesResponse = z.object({
  synced: z.number().int().min(0),
  errors: z.array(z.string()),
});

/** Process message response */
export const processMessageResponse = z.object({
  status: aiStatus,
  model: z.string().nullable(),
  error: z.string().nullable(),
});

/** Bulk process response */
export const bulkProcessResponse = z.object({
  queued: z.number().int().min(0),
  skipped: z.number().int().min(0),
});

/** Export messages response - returns file data */
export const exportMessagesResponse = z.object({
  filename: z.string(),
  contentType: z.string(),
  data: z.string(), // Base64 encoded
});

// ============================================================================
// Types
// ============================================================================

export type StoredMessageType = z.infer<typeof storedMessageType>;
export type StoredMessageStatus = z.infer<typeof storedMessageStatus>;
export type MessageSource = z.infer<typeof messageSource>;
export type AIStatus = z.infer<typeof aiStatus>;
export type ExtractedDataType = z.infer<typeof extractedDataType>;
export type WhatsAppMessage = z.infer<typeof whatsAppMessage>;
export type WhatsAppMessageWithGroup = z.infer<typeof whatsAppMessageWithGroup>;
export type WhatsAppExtractedData = z.infer<typeof whatsAppExtractedData>;
export type WhatsAppMessageDetail = z.infer<typeof whatsAppMessageDetail>;
export type MessageFilterInput = z.infer<typeof messageFilterInput>;
export type MessageIdInput = z.infer<typeof messageIdInput>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteInput>;
export type SyncMessagesInput = z.infer<typeof syncMessagesInput>;
export type ExportMessagesInput = z.infer<typeof exportMessagesInput>;
export type ProcessMessageInput = z.infer<typeof processMessageInput>;
export type BulkProcessInput = z.infer<typeof bulkProcessInput>;
export type MessageStatsInput = z.infer<typeof messageStatsInput>;
export type MessagesListResponse = z.infer<typeof messagesListResponse>;
export type MessageDetailResponse = z.infer<typeof messageDetailResponse>;
export type MessageStatsResponse = z.infer<typeof messageStatsResponse>;
export type DeleteMessageResponse = z.infer<typeof deleteMessageResponse>;
export type BulkDeleteResponse = z.infer<typeof bulkDeleteResponse>;
export type SyncMessagesResponse = z.infer<typeof syncMessagesResponse>;
export type ProcessMessageResponse = z.infer<typeof processMessageResponse>;
export type BulkProcessResponse = z.infer<typeof bulkProcessResponse>;
export type ExportMessagesResponse = z.infer<typeof exportMessagesResponse>;
