/**
 * Content Hash Utility
 *
 * Generates deterministic hashes for message content to enable
 * AI processing deduplication across multiple messages with identical content.
 *
 * Use case: User sends "Need Paracetamol 500mg" to 3 different groups
 * → Same hash → Process once, reuse results 3 times
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface MessageContent {
  text?: string | null;
  caption?: string | null;
  messageType: string;
}

// ============================================================================
// Content Hashing
// ============================================================================

/**
 * Generate a deterministic hash for message content
 *
 * Same content produces same hash regardless of:
 * - Sender
 * - Group
 * - Timestamp
 * - Whitespace variations
 * - Case differences
 *
 * @param content - Message content to hash
 * @returns 32-character hex hash, or empty string if no content
 *
 * @example
 * ```typescript
 * const hash1 = generateContentHash({
 *   text: 'Need Paracetamol 500mg',
 *   messageType: 'text'
 * });
 *
 * const hash2 = generateContentHash({
 *   text: 'need  paracetamol  500mg', // Different whitespace/case
 *   messageType: 'text'
 * });
 *
 * console.log(hash1 === hash2); // true
 * ```
 */
export function generateContentHash(content: MessageContent): string {
  const normalizedText = normalizeText(content.text || content.caption || '');

  if (!normalizedText) {
    return ''; // Empty content = no hash
  }

  // Include message type to differentiate text vs caption
  // This ensures "Hello" as text != "Hello" as caption
  const hashInput = `${content.messageType}:${normalizedText}`;

  return crypto
    .createHash('sha256')
    .update(hashInput, 'utf8')
    .digest('hex')
    .substring(0, 32); // Use first 32 chars for efficiency
}

/**
 * Normalize text for consistent hashing
 *
 * Normalization rules:
 * - Trim leading/trailing whitespace
 * - Convert to lowercase
 * - Collapse multiple spaces to single space
 * - Remove punctuation (keeps alphanumeric and spaces)
 *
 * @param text - Text to normalize
 * @returns Normalized text
 *
 * @example
 * ```typescript
 * normalizeText('  Need  Paracetamol!!! ')
 * // Returns: 'need paracetamol'
 * ```
 */
export function normalizeText(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      // Normalize Unicode (e.g., é → e)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      // Remove punctuation but keep alphanumeric and spaces
      .replace(/[^\w\s]/g, '')
      .trim()
  );
}

/**
 * Check if two message contents would produce the same hash
 *
 * @param content1 - First message content
 * @param content2 - Second message content
 * @returns true if contents are equivalent
 */
export function areContentsEquivalent(
  content1: MessageContent,
  content2: MessageContent,
): boolean {
  const hash1 = generateContentHash(content1);
  const hash2 = generateContentHash(content2);

  return hash1 !== '' && hash1 === hash2;
}
