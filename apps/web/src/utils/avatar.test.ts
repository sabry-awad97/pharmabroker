/**
 * Property-based tests for avatar utility functions
 *
 * Feature: whatsapp-groups-management
 * Property 2: Avatar Fallback Generation
 * Validates: Requirements 1.4
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { getInitials } from './avatar';

describe('Avatar Utility', () => {
  describe('getInitials', () => {
    // Unit tests for specific examples
    it('returns first 2 letters for single word names', () => {
      expect(getInitials('Alice')).toBe('AL');
      expect(getInitials('Bob')).toBe('BO');
      expect(getInitials('X')).toBe('X');
    });

    it('returns first letter of first 2 words for multi-word names', () => {
      expect(getInitials('John Doe')).toBe('JD');
      expect(getInitials('Marketing Team')).toBe('MT');
      expect(getInitials('Alice Bob Charlie')).toBe('AB');
    });

    it('returns empty string for empty or whitespace names', () => {
      expect(getInitials('')).toBe('');
      expect(getInitials('   ')).toBe('');
      expect(getInitials('\t\n')).toBe('');
    });

    it('handles names with extra whitespace', () => {
      expect(getInitials('  John  Doe  ')).toBe('JD');
      expect(getInitials('  Alice  ')).toBe('AL');
    });
  });

  /**
   * Property 2: Avatar Fallback Generation
   *
   * For any group or participant without an avatarUrl, the system SHALL generate
   * fallback initials from the name (first letter of first two words, or first
   * two letters if single word).
   *
   * Validates: Requirements 1.4
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for single word names (no spaces)
    const singleWordArb = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter(s => s.trim().length > 0 && !s.includes(' '));

    // Arbitrary for multi-word names (at least 2 words)
    const multiWordArb = fc
      .array(
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter(s => s.trim().length > 0 && !s.includes(' ')),
        { minLength: 2, maxLength: 5 },
      )
      .map(words => words.join(' '));

    it('Property 2: single word names produce initials from first 2 letters (uppercase)', () => {
      /**
       * Feature: whatsapp-groups-management, Property 2: Avatar Fallback Generation
       * For any single word name, initials should be the first 2 letters (or 1 if name is 1 char)
       */
      fc.assert(
        fc.property(singleWordArb, name => {
          const initials = getInitials(name);
          const trimmed = name.trim();
          const expected = trimmed.slice(0, 2).toUpperCase();

          return initials === expected;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 2: multi-word names produce initials from first letter of first 2 words (uppercase)', () => {
      /**
       * Feature: whatsapp-groups-management, Property 2: Avatar Fallback Generation
       * For any multi-word name, initials should be first letter of first 2 words
       */
      fc.assert(
        fc.property(multiWordArb, name => {
          const initials = getInitials(name);
          const words = name.trim().split(/\s+/).filter(Boolean);
          const expected = (words[0][0] + words[1][0]).toUpperCase();

          return initials === expected;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 2: initials are always uppercase', () => {
      /**
       * Feature: whatsapp-groups-management, Property 2: Avatar Fallback Generation
       * For any non-empty name, initials should be uppercase
       */
      const nonEmptyNameArb = fc
        .string({ minLength: 1, maxLength: 100 })
        .filter(s => s.trim().length > 0);

      fc.assert(
        fc.property(nonEmptyNameArb, name => {
          const initials = getInitials(name);
          return initials === initials.toUpperCase();
        }),
        { numRuns: 100 },
      );
    });

    it('Property 2: initials length is at most 2 characters', () => {
      /**
       * Feature: whatsapp-groups-management, Property 2: Avatar Fallback Generation
       * For any name, initials should be at most 2 characters
       */
      const anyNameArb = fc.string({ minLength: 0, maxLength: 100 });

      fc.assert(
        fc.property(anyNameArb, name => {
          const initials = getInitials(name);
          return initials.length <= 2;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 2: empty/whitespace names produce empty initials', () => {
      /**
       * Feature: whatsapp-groups-management, Property 2: Avatar Fallback Generation
       * For any whitespace-only string, initials should be empty
       */
      const whitespaceArb = fc
        .array(fc.constantFrom(' ', '\t', '\n', '\r'), {
          minLength: 0,
          maxLength: 20,
        })
        .map(chars => chars.join(''));

      fc.assert(
        fc.property(whitespaceArb, name => {
          const initials = getInitials(name);
          return initials === '';
        }),
        { numRuns: 100 },
      );
    });
  });
});
