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

export const historySyncStatus = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'failed',
  'skipped',
  'cancelled',
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

  // History Sync Configuration
  enable_history_sync: z.boolean(),

  // Connection Tracking
  first_connected_at: unbranded.datetime.optional(),
  last_connected_at: unbranded.datetime.optional(),
  last_disconnected_at: unbranded.datetime.optional(),

  // Sync Status Tracking
  history_sync_status: historySyncStatus,
  history_sync_progress: z.number().int().min(0),
  history_sync_total: z.number().int().min(0).optional(),
  history_sync_started_at: unbranded.datetime.optional(),
  history_sync_completed_at: unbranded.datetime.optional(),

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
  enable_history_sync: z.boolean().optional().default(false),
});

/** Update session input */
export const updateSessionInput = z.object({
  id: sessionId,
  name: z.string().min(1).max(100).optional(),
  auto_connect: z.boolean().optional(),
  enable_history_sync: z.boolean().optional(),
});

/** Get/Delete session input */
export const sessionIdInput = z.object({
  id: sessionId,
});

/** Update history sync setting input */
export const updateHistorySyncInput = z.object({
  id: sessionId,
  enable_history_sync: z.boolean(),
});

/** Manual sync trigger input */
export const triggerSyncInput = z.object({
  id: sessionId,
});

/** Cancel sync input */
export const cancelSyncInput = z.object({
  id: sessionId,
});

/** Sync status response */
export const historySyncStatusResponse = z.object({
  status: historySyncStatus,
  progress: z.number().int().min(0),
  total: z.number().int().min(0).optional(),
  started_at: unbranded.datetime.optional(),
  completed_at: unbranded.datetime.optional(),
});

/** Generic success response */
export const successResponse = z.object({
  success: z.literal(true),
  message: z.string().optional(),
});

// ============================================================================
// Types
// ============================================================================

export type SessionStatus = z.infer<typeof sessionStatus>;
export type HistorySyncStatus = z.infer<typeof historySyncStatus>;
export type Session = z.infer<typeof session>;
export type CreateSessionInput = z.infer<typeof createSessionInput>;
export type UpdateSessionInput = z.infer<typeof updateSessionInput>;
export type SessionIdInput = z.infer<typeof sessionIdInput>;
export type ReconnectSessionResponse = z.infer<typeof reconnectSessionResponse>;
export type UpdateHistorySyncInput = z.infer<typeof updateHistorySyncInput>;
export type TriggerSyncInput = z.infer<typeof triggerSyncInput>;
export type CancelSyncInput = z.infer<typeof cancelSyncInput>;
export type HistorySyncStatusResponse = z.infer<
  typeof historySyncStatusResponse
>;
export type SuccessResponse = z.infer<typeof successResponse>;
