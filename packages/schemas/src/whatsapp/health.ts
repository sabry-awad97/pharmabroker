/**
 * WhatsApp Health Check Schemas
 */

import { z } from 'zod';

// ============================================================================
// Health Schemas
// ============================================================================

/** Health check response */
export const healthResponse = z.object({
  status: z.string(),
});

/** Readiness check response */
export const readyResponse = z.object({
  status: z.string(),
  components: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// Types
// ============================================================================

export type HealthResponse = z.infer<typeof healthResponse>;
export type ReadyResponse = z.infer<typeof readyResponse>;
