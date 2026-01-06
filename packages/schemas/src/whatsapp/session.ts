/**
 * WhatsApp Session Schemas
 *
 * Schemas for WhatsApp session management matching Go service DTOs.
 * Uses branded types for type-safe IDs on input, unbranded for output validation.
 */

import { z } from 'zod';
import { sessionId, unbranded } from '../common';

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
// Output Schemas (unbranded for validation of plain data from DB)
// ============================================================================

/** WhatsApp session entity - output schema */
export const session = z.object({
  id: unbranded.uuid,
  jid: z.string().optional(),
  name: z.string().min(1).max(100),
  status: sessionStatus,
  auto_connect: z.boolean(),
  created_at: unbranded.datetime,
  updated_at: unbranded.datetime,
});

/** Session list response */
export const sessionList = z.array(session);

/** Delete session response */
export const deleteSessionResponse = z.object({
  success: z.literal(true),
});

/** Reconnect session response */
export const reconnectSessionResponse = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// ============================================================================
// Input Schemas (branded for type safety)
// ============================================================================

/** Create session input */
export const createSessionInput = z.object({
  name: z.string().min(1).max(100),
  auto_connect: z.boolean().optional().default(false),
});

/** Update session input */
export const updateSessionInput = z.object({
  id: sessionId,
  name: z.string().min(1).max(100).optional(),
  auto_connect: z.boolean().optional(),
});

/** Get/Delete session input */
export const sessionIdInput = z.object({
  id: sessionId,
});

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = z.infer<typeof sessionStatus>;
export type Session = z.infer<typeof session>;
export type CreateSessionInput = z.infer<typeof createSessionInput>;
export type UpdateSessionInput = z.infer<typeof updateSessionInput>;
export type SessionIdInput = z.infer<typeof sessionIdInput>;
export type ReconnectSessionResponse = z.infer<typeof reconnectSessionResponse>;
