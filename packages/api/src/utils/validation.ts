/**
 * Input Validation Utilities
 *
 * Comprehensive validation and sanitization for user inputs.
 * Prevents injection attacks, XSS, and data corruption.
 */

import { z } from 'zod';

// ============================================================================
// Common Validation Schemas
// ============================================================================

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Email validation
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase();

/**
 * Phone number validation (E.164 format)
 */
export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format');

/**
 * URL validation
 */
export const urlSchema = z.string().url('Invalid URL format');

/**
 * Date validation
 */
export const dateSchema = z.coerce.date();

/**
 * Pagination cursor validation
 */
export const cursorSchema = z.string().min(1).max(100);

/**
 * Pagination limit validation
 */
export const limitSchema = z.coerce.number().int().min(1).max(100).default(50);

/**
 * Search query validation
 */
export const searchSchema = z
  .string()
  .min(1)
  .max(200)
  .transform(val => sanitizeSearchQuery(val));

/**
 * WhatsApp JID validation
 */
export const whatsappJidSchema = z
  .string()
  .regex(
    /^(\d+|[\w.-]+)@(s\.whatsapp\.net|g\.us|broadcast|lid)$/,
    'Invalid WhatsApp JID format',
  );

/**
 * Message ID validation
 */
export const messageIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Z0-9]+$/, 'Invalid message ID format');

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize search query to prevent SQL injection
 */
export function sanitizeSearchQuery(query: string): string {
  // Remove SQL wildcards and special characters
  return query
    .replace(/[%_\\]/g, '\\$&') // Escape SQL wildcards
    .replace(/[<>'"]/g, '') // Remove potential XSS characters
    .trim();
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize filename to prevent path traversal
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars
    .replace(/\.{2,}/g, '.') // Remove multiple dots
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
}

/**
 * Sanitize JSON to prevent prototype pollution
 */
export function sanitizeJson<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeJson) as T;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip dangerous keys
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    sanitized[key] = sanitizeJson(value);
  }

  return sanitized as T;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate and parse input with Zod schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map(
    err => `${err.path.join('.')}: ${err.message}`,
  );

  return { success: false, errors };
}

/**
 * Validate array of inputs
 */
export function validateArray<T>(
  schema: z.ZodSchema<T>,
  inputs: unknown[],
): { success: true; data: T[] } | { success: false; errors: string[] } {
  const results: T[] = [];
  const errors: string[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const result = schema.safeParse(inputs[i]);
    if (result.success) {
      results.push(result.data);
    } else {
      errors.push(
        `Item ${i}: ${result.error.errors.map(e => e.message).join(', ')}`,
      );
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: results };
}

// ============================================================================
// Security Checks
// ============================================================================

/**
 * Check if string contains SQL injection patterns
 */
export function containsSqlInjection(input: string): boolean {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/i,
    /(--|;|\/\*|\*\/)/,
    /(\bOR\b.*=.*)/i,
    /(\bAND\b.*=.*)/i,
    /('|")\s*(OR|AND)\s*('|")/i,
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Check if string contains XSS patterns
 */
export function containsXss(input: string): boolean {
  const patterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // Event handlers
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
  ];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Check if string contains path traversal patterns
 */
export function containsPathTraversal(input: string): boolean {
  const patterns = [/\.\.[\/\\]/, /^[\/\\]/, /~[\/\\]/];

  return patterns.some(pattern => pattern.test(input));
}

/**
 * Validate input is safe
 */
export function isSafeInput(input: string): boolean {
  return (
    !containsSqlInjection(input) &&
    !containsXss(input) &&
    !containsPathTraversal(input)
  );
}

// ============================================================================
// Rate Limit Key Validation
// ============================================================================

/**
 * Validate and normalize rate limit key
 */
export function normalizeRateLimitKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9:-]/g, '_')
    .substring(0, 100);
}

// ============================================================================
// Content Validation
// ============================================================================

/**
 * Validate message content length
 */
export function validateMessageContent(content: string | null | undefined): {
  valid: boolean;
  error?: string;
} {
  if (!content) {
    return { valid: true }; // Empty content is allowed
  }

  if (content.length > 10000) {
    return {
      valid: false,
      error: 'Message content too long (max 10000 chars)',
    };
  }

  if (containsXss(content)) {
    return { valid: false, error: 'Message content contains unsafe patterns' };
  }

  return { valid: true };
}

/**
 * Validate file upload
 */
export function validateFileUpload(
  filename: string,
  size: number,
  allowedTypes: string[],
): { valid: boolean; error?: string } {
  // Check filename
  if (containsPathTraversal(filename)) {
    return { valid: false, error: 'Invalid filename' };
  }

  // Check size (max 50MB)
  if (size > 50 * 1024 * 1024) {
    return { valid: false, error: 'File too large (max 50MB)' };
  }

  // Check file type
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext || !allowedTypes.includes(ext)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed: ${allowedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// Exports
// ============================================================================

export const validators = {
  uuid: uuidSchema,
  email: emailSchema,
  phone: phoneSchema,
  url: urlSchema,
  date: dateSchema,
  cursor: cursorSchema,
  limit: limitSchema,
  search: searchSchema,
  whatsappJid: whatsappJidSchema,
  messageId: messageIdSchema,
};

export const sanitizers = {
  searchQuery: sanitizeSearchQuery,
  html: sanitizeHtml,
  filename: sanitizeFilename,
  json: sanitizeJson,
};

export const securityChecks = {
  sqlInjection: containsSqlInjection,
  xss: containsXss,
  pathTraversal: containsPathTraversal,
  isSafe: isSafeInput,
};
