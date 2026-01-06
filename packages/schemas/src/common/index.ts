/**
 * @pharmabroker/schemas/common
 *
 * Common reusable schemas and utilities shared across the application.
 * Uses Zod brand types for nominal typing to prevent mixing up similar types.
 */

import { z } from 'zod';

// ============================================================================
// Branded Primitive Schemas
// ============================================================================

/**
 * UUID v4 branded type
 * Prevents accidentally passing a regular string where a UUID is expected
 */
export const uuid = z.string().uuid().brand<'UUID'>();

/**
 * Non-empty string branded type
 */
export const nonEmptyString = z.string().min(1).brand<'NonEmptyString'>();

/**
 * URL branded type
 */
export const url = z.string().url().brand<'URL'>();

/**
 * ISO 8601 datetime string branded type
 */
export const datetime = z.string().datetime().brand<'DateTime'>();

/**
 * E.164 phone number format branded type
 * Format: +[country][number], 1-15 digits total
 */
export const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number format')
  .brand<'E164Phone'>();

/**
 * Session ID branded type (UUID with semantic meaning)
 */
export const sessionId = z.string().uuid().brand<'SessionID'>();

/**
 * Message ID branded type (UUID with semantic meaning)
 */
export const messageId = z.string().uuid().brand<'MessageID'>();

/**
 * WhatsApp JID (Jabber ID) branded type
 */
export const whatsappJid = z.string().brand<'WhatsAppJID'>();

// ============================================================================
// Unbranded versions for internal/flexible use
// ============================================================================

export const unbranded = {
  uuid: z.string().uuid(),
  nonEmptyString: z.string().min(1),
  url: z.string().url(),
  datetime: z.string().datetime(),
  e164Phone: z
    .string()
    .regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number format'),
} as const;

// ============================================================================
// API Response Schemas
// ============================================================================

/** Standard error response structure */
export const apiError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.string()).optional(),
});

/** Generic API response wrapper */
export const apiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: apiError.optional(),
  });

/** Success response helper */
export const successResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

/** Error response helper */
export const errorResponse = z.object({
  success: z.literal(false),
  error: apiError,
});

// ============================================================================
// Pagination Schemas
// ============================================================================

/** Pagination input */
export const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/** Pagination metadata */
export const paginationMeta = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

/** Paginated response wrapper */
export const paginatedResponse = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    meta: paginationMeta,
  });

// ============================================================================
// Brand Utilities
// ============================================================================

/**
 * Helper to create a branded string type
 * @example
 * const UserId = brandedString<"UserId">();
 * type UserId = z.infer<typeof UserId>;
 */
export const brandedString = <Brand extends string>() =>
  z.string().brand<Brand>();

/**
 * Helper to create a branded UUID type
 * @example
 * const OrderId = brandedUuid<"OrderId">();
 * type OrderId = z.infer<typeof OrderId>;
 */
export const brandedUuid = <Brand extends string>() =>
  z.string().uuid().brand<Brand>();

/**
 * Helper to create a branded number type
 * @example
 * const Price = brandedNumber<"Price">();
 * type Price = z.infer<typeof Price>;
 */
export const brandedNumber = <Brand extends string>() =>
  z.number().brand<Brand>();

// ============================================================================
// Types
// ============================================================================

/** Branded UUID type - use this instead of plain string for UUIDs */
export type UUID = z.infer<typeof uuid>;

/** Branded E.164 phone number type */
export type E164Phone = z.infer<typeof e164Phone>;

/** Branded URL type */
export type URL = z.infer<typeof url>;

/** Branded DateTime type */
export type DateTime = z.infer<typeof datetime>;

/** Branded Session ID type */
export type SessionID = z.infer<typeof sessionId>;

/** Branded Message ID type */
export type MessageID = z.infer<typeof messageId>;

/** Branded WhatsApp JID type */
export type WhatsAppJID = z.infer<typeof whatsappJid>;

/** Non-empty string type */
export type NonEmptyString = z.infer<typeof nonEmptyString>;

/** API Error type */
export type ApiError = z.infer<typeof apiError>;

/** Pagination input type */
export type PaginationInput = z.infer<typeof paginationInput>;

/** Pagination metadata type */
export type PaginationMeta = z.infer<typeof paginationMeta>;

// ============================================================================
// Type Guards & Utilities
// ============================================================================

/** Check if a value is a valid UUID */
export const isUUID = (value: unknown): value is UUID =>
  uuid.safeParse(value).success;

/** Check if a value is a valid E.164 phone */
export const isE164Phone = (value: unknown): value is E164Phone =>
  e164Phone.safeParse(value).success;

/** Check if a value is a valid URL */
export const isURL = (value: unknown): value is URL =>
  url.safeParse(value).success;

/** Check if a value is a valid DateTime */
export const isDateTime = (value: unknown): value is DateTime =>
  datetime.safeParse(value).success;
