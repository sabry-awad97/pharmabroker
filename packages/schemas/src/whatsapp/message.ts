/**
 * WhatsApp Message Schemas
 *
 * Schemas for WhatsApp messaging matching Go service DTOs.
 * Uses branded types for type-safe IDs and phone numbers.
 */

import { z } from 'zod';
import { sessionId, messageId, url, e164Phone } from '../common';

// ============================================================================
// Enums
// ============================================================================

export const messageType = z.enum([
  'text',
  'image',
  'document',
  'audio',
  'video',
]);

export const messageStatus = z.enum([
  'pending',
  'sent',
  'delivered',
  'read',
  'failed',
]);

// ============================================================================
// Content Schemas
// ============================================================================

/** Text content with branded type */
export const textContent = z.string().max(4096).brand<'TextContent'>();

/** Caption content with branded type */
export const captionContent = z.string().max(1024).brand<'Caption'>();

/** Filename with branded type */
export const filename = z.string().max(255).brand<'Filename'>();

/** Message content structure */
export const messageContent = z.object({
  text: z.string().max(4096).optional(),
  image_url: z.string().url().optional(),
  doc_url: z.string().url().optional(),
  audio_url: z.string().url().optional(),
  video_url: z.string().url().optional(),
  caption: z.string().max(1024).optional(),
  filename: z.string().max(255).optional(),
});

// ============================================================================
// Message Schemas
// ============================================================================

/** Send message input with content-type validation and branded types */
export const sendMessageInput = z
  .object({
    session_id: sessionId,
    to: e164Phone,
    type: messageType,
    content: messageContent,
  })
  .refine(
    data => {
      switch (data.type) {
        case 'text':
          return !!data.content.text;
        case 'image':
          return !!data.content.image_url;
        case 'document':
          return !!data.content.doc_url;
        case 'audio':
          return !!data.content.audio_url;
        case 'video':
          return !!data.content.video_url;
        default:
          return false;
      }
    },
    { message: 'Content must match message type' },
  );

/** Send message response with branded message ID */
export const sendMessageResponse = z.object({
  message_id: messageId,
  status: z.string(),
});

// ============================================================================
// Type-safe Message Builders
// ============================================================================

/** Text message input */
export const textMessageInput = z.object({
  session_id: sessionId,
  to: e164Phone,
  type: z.literal('text'),
  content: z.object({
    text: z.string().min(1).max(4096),
  }),
});

/** Image message input */
export const imageMessageInput = z.object({
  session_id: sessionId,
  to: e164Phone,
  type: z.literal('image'),
  content: z.object({
    image_url: url,
    caption: z.string().max(1024).optional(),
  }),
});

/** Document message input */
export const documentMessageInput = z.object({
  session_id: sessionId,
  to: e164Phone,
  type: z.literal('document'),
  content: z.object({
    doc_url: url,
    filename: z.string().max(255).optional(),
    caption: z.string().max(1024).optional(),
  }),
});

/** Audio message input */
export const audioMessageInput = z.object({
  session_id: sessionId,
  to: e164Phone,
  type: z.literal('audio'),
  content: z.object({
    audio_url: url,
  }),
});

/** Video message input */
export const videoMessageInput = z.object({
  session_id: sessionId,
  to: e164Phone,
  type: z.literal('video'),
  content: z.object({
    video_url: url,
    caption: z.string().max(1024).optional(),
  }),
});

// ============================================================================
// Types
// ============================================================================

export type MessageType = z.infer<typeof messageType>;
export type MessageStatus = z.infer<typeof messageStatus>;
export type MessageContent = z.infer<typeof messageContent>;
export type SendMessageInput = z.infer<typeof sendMessageInput>;
export type SendMessageResponse = z.infer<typeof sendMessageResponse>;
export type TextMessageInput = z.infer<typeof textMessageInput>;
export type ImageMessageInput = z.infer<typeof imageMessageInput>;
export type DocumentMessageInput = z.infer<typeof documentMessageInput>;
export type AudioMessageInput = z.infer<typeof audioMessageInput>;
export type VideoMessageInput = z.infer<typeof videoMessageInput>;
export type TextContent = z.infer<typeof textContent>;
export type Caption = z.infer<typeof captionContent>;
export type Filename = z.infer<typeof filename>;
