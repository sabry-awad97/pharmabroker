/**
 * WhatsApp Health Check Schemas
 */

import { z } from 'zod';

// ============================================================================
// Health Status Enums
// ============================================================================

/** Health status values */
export const healthStatus = z.enum(['ok', 'degraded', 'unhealthy']);

/** Ready status values */
export const readyStatus = z.enum(['ready', 'not_ready']);

// ============================================================================
// Health Schemas
// ============================================================================

/** Health check response */
export const healthResponse = z.object({
  status: healthStatus,
});

/** Readiness check response */
export const readyResponse = z.object({
  status: readyStatus,
  components: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Types
// ============================================================================

export type HealthStatus = z.infer<typeof healthStatus>;
export type ReadyStatus = z.infer<typeof readyStatus>;
export type HealthResponse = z.infer<typeof healthResponse>;
export type ReadyResponse = z.infer<typeof readyResponse>;
