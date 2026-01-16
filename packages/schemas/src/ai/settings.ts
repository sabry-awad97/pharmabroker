/**
 * AI Settings Schemas
 *
 * Schemas for user AI processing configuration.
 */

import { z } from 'zod';

// ============================================================================
// AI Settings Schema
// ============================================================================

/** User AI settings output schema */
export const userAISettings = z.object({
  id: z.string().uuid(),
  userId: z.string(),

  // Auto-processing configuration
  autoProcessEnabled: z.boolean(),
  autoProcessRealtime: z.boolean(),
  autoProcessHistory: z.boolean(),

  // Idle processing - process pending messages when no realtime messages
  idleProcessingEnabled: z.boolean(),
  idleTimeoutSeconds: z.number().int().min(5).max(300),
  idleMaxBatchSize: z.number().int().min(1).max(20),

  // History sync processing
  historyParallelEnabled: z.boolean(),
  historyParallelCount: z.number().int().min(1).max(10),
  historyProcessDelay: z.number().int().min(0).max(60),

  // Priority settings
  prioritizeLatest: z.boolean(),

  // Filtering options
  processTextOnly: z.boolean(),
  minTextLength: z.number().int().min(0).max(1000),
  excludeFromMe: z.boolean(),

  // Rate limiting
  maxProcessPerMinute: z.number().int().min(1).max(100),
  maxProcessPerHour: z.number().int().min(1).max(1000),

  // Session/Group filtering
  enabledSessionIds: z.array(z.string().uuid()).nullable(),
  enabledGroupIds: z.array(z.string().uuid()).nullable(),

  // Timestamps
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

/** Update AI settings input schema */
export const updateAISettingsInput = z.object({
  autoProcessEnabled: z.boolean().optional(),
  autoProcessRealtime: z.boolean().optional(),
  autoProcessHistory: z.boolean().optional(),

  // Idle processing
  idleProcessingEnabled: z.boolean().optional(),
  idleTimeoutSeconds: z.number().int().min(5).max(300).optional(),
  idleMaxBatchSize: z.number().int().min(1).max(20).optional(),

  // History sync processing
  historyParallelEnabled: z.boolean().optional(),
  historyParallelCount: z.number().int().min(1).max(10).optional(),
  historyProcessDelay: z.number().int().min(0).max(60).optional(),

  // Priority settings
  prioritizeLatest: z.boolean().optional(),

  // Filtering
  processTextOnly: z.boolean().optional(),
  minTextLength: z.number().int().min(0).max(1000).optional(),
  excludeFromMe: z.boolean().optional(),
  maxProcessPerMinute: z.number().int().min(1).max(100).optional(),
  maxProcessPerHour: z.number().int().min(1).max(1000).optional(),
  enabledSessionIds: z.array(z.string().uuid()).nullable().optional(),
  enabledGroupIds: z.array(z.string().uuid()).nullable().optional(),
});

/** AI settings response */
export const aiSettingsResponse = userAISettings;

/** Auto-process stats response */
export const autoProcessStatsResponse = z.object({
  processedLastMinute: z.number().int().min(0),
  processedLastHour: z.number().int().min(0),
  queuedCount: z.number().int().min(0),
  pendingCount: z.number().int().min(0),
  isRateLimited: z.boolean(),
  isIdle: z.boolean(),
  lastRealtimeAt: z.coerce.date().nullable(),
  historySyncStatus: z.enum(['idle', 'syncing', 'processing', 'completed']),
});

// ============================================================================
// Types
// ============================================================================

export type UserAISettings = z.infer<typeof userAISettings>;
export type UpdateAISettingsInput = z.infer<typeof updateAISettingsInput>;
export type AISettingsResponse = z.infer<typeof aiSettingsResponse>;
export type AutoProcessStatsResponse = z.infer<typeof autoProcessStatsResponse>;
