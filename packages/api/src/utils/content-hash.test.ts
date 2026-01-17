/**
 * Content Hash Tests
 *
 * Property-based and unit tests for content hash generation.
 * Tests hash determinism, normalization, and message type differentiation.
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  generateContentHash,
  normalizeText,
  areContentsEquivalent,
  type MessageContent,
} from './content-hash';

// ============================================================================
// Test Helpers
// ============================================================================

/** Generate a valid message content */
const messageContentArb = fc.record({
  text: fc.option(fc.string(), { nil: null }),
  caption: fc.option(fc.string(), { nil: null }),
  messageType: fc.constantFrom('text', 'image', 'video', 'audio', 'document'),
});

/** Generate non-empty text */
const nonEmptyTextArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

// ============================================================================
// Unit Tests
// ============================================================================

describe('Content Hash - Unit Tests', () => {
  describe('generateContentHash', () => {
    it('should generate hash for message with text', () => {
      const content: MessageContent = {
        text: 'Need Paracetamol 500mg',
        messageType: 'text',
      };

      const hash = generateContentHash(content);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32);
    });

    it('should generate hash for message with caption', () => {
      const content: MessageContent = {
        caption: 'Medicine photo',
        messageType: 'image',
      };

      const hash = generateContentHash(content);

      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32);
    });

    it('should return empty string for empty content', () => {
      const content: MessageContent = {
        text: null,
        caption: null,
        messageType: 'text',
      };

      const hash = generateContentHash(content);

      expect(hash).toBe('');
    });

    it('should return empty string for whitespace-only content', () => {
      const content: MessageContent = {
        text: '   ',
        messageType: 'text',
      };

      const hash = generateContentHash(content);

      expect(hash).toBe('');
    });

    it('should generate same hash for identical content', () => {
      const content1: MessageContent = {
        text: 'Need Paracetamol',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: 'Need Paracetamol',
        messageType: 'text',
      };

      const hash1 = generateContentHash(content1);
      const hash2 = generateContentHash(content2);

      expect(hash1).toBe(hash2);
    });

    it('should generate same hash for content with different whitespace', () => {
      const content1: MessageContent = {
        text: 'Need  Paracetamol',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: 'need paracetamol',
        messageType: 'text',
      };

      const hash1 = generateContentHash(content1);
      const hash2 = generateContentHash(content2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hash for different message types', () => {
      const content1: MessageContent = {
        text: 'Hello',
        messageType: 'text',
      };
      const content2: MessageContent = {
        caption: 'Hello',
        messageType: 'image',
      };

      const hash1 = generateContentHash(content1);
      const hash2 = generateContentHash(content2);

      expect(hash1).not.toBe(hash2);
    });

    it('should prefer text over caption when both present', () => {
      const content: MessageContent = {
        text: 'Text content',
        caption: 'Caption content',
        messageType: 'text',
      };

      const hash = generateContentHash(content);

      // Should use text, not caption
      const textOnlyContent: MessageContent = {
        text: 'Text content',
        messageType: 'text',
      };
      const textOnlyHash = generateContentHash(textOnlyContent);

      expect(hash).toBe(textOnlyHash);
    });
  });

  describe('normalizeText', () => {
    it('should trim whitespace', () => {
      expect(normalizeText('  hello  ')).toBe('hello');
    });

    it('should convert to lowercase', () => {
      expect(normalizeText('HELLO')).toBe('hello');
      expect(normalizeText('HeLLo')).toBe('hello');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeText('hello    world')).toBe('hello world');
    });

    it('should remove punctuation', () => {
      expect(normalizeText('hello!!!')).toBe('hello');
      expect(normalizeText('hello, world!')).toBe('hello world');
    });

    it('should normalize unicode characters', () => {
      expect(normalizeText('café')).toBe('cafe');
      expect(normalizeText('naïve')).toBe('naive');
    });

    it('should handle empty string', () => {
      expect(normalizeText('')).toBe('');
    });

    it('should handle whitespace-only string', () => {
      expect(normalizeText('   ')).toBe('');
    });
  });

  describe('areContentsEquivalent', () => {
    it('should return true for identical content', () => {
      const content1: MessageContent = {
        text: 'Hello',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: 'Hello',
        messageType: 'text',
      };

      expect(areContentsEquivalent(content1, content2)).toBe(true);
    });

    it('should return true for normalized equivalent content', () => {
      const content1: MessageContent = {
        text: 'Hello  World',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: 'hello world',
        messageType: 'text',
      };

      expect(areContentsEquivalent(content1, content2)).toBe(true);
    });

    it('should return false for different content', () => {
      const content1: MessageContent = {
        text: 'Hello',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: 'Goodbye',
        messageType: 'text',
      };

      expect(areContentsEquivalent(content1, content2)).toBe(false);
    });

    it('should return false for different message types', () => {
      const content1: MessageContent = {
        text: 'Hello',
        messageType: 'text',
      };
      const content2: MessageContent = {
        caption: 'Hello',
        messageType: 'image',
      };

      expect(areContentsEquivalent(content1, content2)).toBe(false);
    });

    it('should return false for empty content', () => {
      const content1: MessageContent = {
        text: '',
        messageType: 'text',
      };
      const content2: MessageContent = {
        text: '',
        messageType: 'text',
      };

      expect(areContentsEquivalent(content1, content2)).toBe(false);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Content Hash - Property Tests', () => {
  /**
   * Feature: ai-content-deduplication, Property 1: Hash Determinism
   * For any message content, generating the content hash multiple times
   * should produce identical results.
   *
   * Validates: Requirements 1.2
   */
  describe('Property 1: Hash Determinism', () => {
    it('property: hash determinism', () => {
      fc.assert(
        fc.property(messageContentArb, content => {
          const hash1 = generateContentHash(content);
          const hash2 = generateContentHash(content);
          return hash1 === hash2;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: ai-content-deduplication, Property 2: Hash Normalization
   * For any two message contents that differ only in whitespace, case,
   * or punctuation, their content hashes should be identical.
   *
   * Validates: Requirements 1.3
   */
  describe('Property 2: Hash Normalization', () => {
    it('property: hash normalization', () => {
      fc.assert(
        fc.property(
          nonEmptyTextArb,
          fc.constantFrom('text', 'image'),
          (baseText, messageType) => {
            // Skip if normalized text is empty (only punctuation/whitespace)
            if (normalizeText(baseText).length === 0) {
              return true;
            }

            const variations = [
              baseText,
              baseText.toUpperCase(),
              baseText.toLowerCase(),
              `  ${baseText}  `,
              baseText.replace(/ /g, '  '),
              baseText + '!!!',
              baseText.replace(/a/g, 'a.'),
            ];

            const hashes = variations.map(text =>
              generateContentHash({ text, messageType }),
            );

            return hashes.every(hash => hash === hashes[0]);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Feature: ai-content-deduplication, Property 3: Message Type Differentiation
   * For any content string, the hash for messageType='text' should differ
   * from the hash for messageType='caption'.
   *
   * Validates: Requirements 1.4
   */
  describe('Property 3: Message Type Differentiation', () => {
    it('property: message type differentiation', () => {
      fc.assert(
        fc.property(nonEmptyTextArb, content => {
          // Skip if normalized text is empty (only punctuation/whitespace)
          if (normalizeText(content).length === 0) {
            return true;
          }

          const textHash = generateContentHash({
            text: content,
            messageType: 'text',
          });
          const captionHash = generateContentHash({
            caption: content,
            messageType: 'image',
          });

          return textHash !== captionHash;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Hash Length Consistency
   * For any non-empty content, the hash should always be 32 characters.
   */
  describe('Property: Hash Length Consistency', () => {
    it('property: hash length is always 32 for non-empty content', () => {
      fc.assert(
        fc.property(
          nonEmptyTextArb,
          fc.constantFrom('text', 'image', 'video'),
          (text, messageType) => {
            const hash = generateContentHash({ text, messageType });
            // Hash is either empty (for content that normalizes to empty) or 32 chars
            return hash.length === 0 || hash.length === 32;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Empty Content Returns Empty Hash
   * For any message with empty or null content, the hash should be empty string.
   */
  describe('Property: Empty Content Handling', () => {
    it('property: empty content returns empty hash', () => {
      fc.assert(
        fc.property(fc.constantFrom('text', 'image', 'video'), messageType => {
          const emptyVariations = [
            { text: null, caption: null, messageType },
            { text: '', caption: null, messageType },
            { text: '   ', caption: null, messageType },
            { text: null, caption: '', messageType },
            { text: null, caption: '   ', messageType },
          ];

          return emptyVariations.every(
            content => generateContentHash(content) === '',
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Hash Uniqueness
   * For different content, hashes should be different (collision resistance).
   */
  describe('Property: Hash Uniqueness', () => {
    it('property: different content produces different hashes', () => {
      fc.assert(
        fc.property(
          nonEmptyTextArb,
          nonEmptyTextArb,
          fc.constantFrom('text', 'image'),
          (text1, text2, messageType) => {
            fc.pre(normalizeText(text1) !== normalizeText(text2));

            const hash1 = generateContentHash({ text: text1, messageType });
            const hash2 = generateContentHash({ text: text2, messageType });

            return hash1 !== hash2;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Normalization Idempotence
   * Normalizing text multiple times should produce the same result.
   */
  describe('Property: Normalization Idempotence', () => {
    it('property: normalizing twice equals normalizing once', () => {
      fc.assert(
        fc.property(fc.string(), text => {
          const normalized1 = normalizeText(text);
          const normalized2 = normalizeText(normalized1);
          return normalized1 === normalized2;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Equivalence Symmetry
   * If content A is equivalent to content B, then B is equivalent to A.
   */
  describe('Property: Equivalence Symmetry', () => {
    it('property: equivalence is symmetric', () => {
      fc.assert(
        fc.property(
          messageContentArb,
          messageContentArb,
          (content1, content2) => {
            const equiv1to2 = areContentsEquivalent(content1, content2);
            const equiv2to1 = areContentsEquivalent(content2, content1);
            return equiv1to2 === equiv2to1;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property: Equivalence Transitivity
   * If A is equivalent to B and B is equivalent to C, then A is equivalent to C.
   */
  describe('Property: Equivalence Transitivity', () => {
    it('property: equivalence is transitive', () => {
      fc.assert(
        fc.property(
          nonEmptyTextArb,
          fc.constantFrom('text', 'image'),
          (baseText, messageType) => {
            const content1: MessageContent = {
              text: baseText,
              messageType,
            };
            const content2: MessageContent = {
              text: baseText.toUpperCase(),
              messageType,
            };
            const content3: MessageContent = {
              text: `  ${baseText}  `,
              messageType,
            };

            const equiv1to2 = areContentsEquivalent(content1, content2);
            const equiv2to3 = areContentsEquivalent(content2, content3);
            const equiv1to3 = areContentsEquivalent(content1, content3);

            // If 1==2 and 2==3, then 1==3
            if (equiv1to2 && equiv2to3) {
              return equiv1to3;
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
