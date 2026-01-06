/**
 * WhatsApp Session Schemas
 *
 * Schemas for WhatsApp session management matching Go service DTOs.
 * Uses branded types for type-safe IDs.
 */

import { z } from 'zod';
import { sessionId, whatsappJid, datetime } from '../common';

// ============================================================================
// Enums
// ============================================================================

export const sessionStatus = z.enum([
  'pending',
  'connecting',
  'connected',
  'disconnected',
  'logged_out',
  'expired',
]);

// ============================================================================
// Schemas
// ============================================================================

/** WhatsApp session entity with branded IDs */
export const session = z.object({
  id: sessionId,
  jid: whatsappJid.optional(),
  name: z.string().min(1).max(100).brand<'SessionName'>(),
  status: sessionStatus,
  created_at: datetime,
  updated_at: datetime,
});

/** Create session input */
export const createSessionInput = z.object({
  name: z.string().min(1).max(100),
});

/** Get/Delete session input with branded ID */
export const sessionIdInput = z.object({
  id: sessionId,
});

/** Session list response */
export const sessionList = z.array(session);

/** Delete session response */
export const deleteSessionResponse = z.object({
  success: z.literal(true),
});

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = z.infer<typeof sessionStatus>;
export type Session = z.infer<typeof session>;
export type CreateSessionInput = z.infer<typeof createSessionInput>;
export type SessionIdInput = z.infer<typeof sessionIdInput>;
