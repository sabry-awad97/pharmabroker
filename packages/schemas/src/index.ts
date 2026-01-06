/**
 * @pharmabroker/schemas
 *
 * Centralized schema definitions for the PharmaBroker application.
 * All schemas use Zod for runtime validation and TypeScript type inference.
 *
 * @example
 * ```ts
 * // Import specific schemas
 * import { session, sendMessageInput } from "@pharmabroker/schemas/whatsapp";
 * import { uuid, e164Phone } from "@pharmabroker/schemas/common";
 *
 * // Or import everything
 * import { whatsapp, common } from "@pharmabroker/schemas";
 *
 * // Validate data
 * const result = whatsapp.session.session.safeParse(data);
 * if (result.success) {
 *   console.log(result.data.name);
 * }
 *
 * // Use types
 * import type { Session, SendMessageInput } from "@pharmabroker/schemas/whatsapp";
 * ```
 */

// Re-export all common schemas
export * from './common';

// Re-export all whatsapp schemas
export * from './whatsapp';

// ============================================================================
// Namespace exports for organized access
// ============================================================================

import * as common from './common';
import * as whatsapp from './whatsapp';

export { common, whatsapp };

// ============================================================================
// Schema utilities
// ============================================================================

import { z } from 'zod';

/** Re-export Zod for convenience */
export { z };

/** Type helper to extract inferred type from any Zod schema */
export type Infer<T extends z.ZodTypeAny> = z.infer<T>;

/** Type helper for input type (before transforms) */
export type InferInput<T extends z.ZodTypeAny> = z.input<T>;

/** Type helper for output type (after transforms) */
export type InferOutput<T extends z.ZodTypeAny> = z.output<T>;
