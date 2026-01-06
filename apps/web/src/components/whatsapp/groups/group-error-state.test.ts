/**
 * Property-based tests for error logging safety
 *
 * Feature: whatsapp-groups-management
 * Property 14: Error Logging Safety
 * Validates: Requirements 9.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { sanitizeErrorForLogging, getErrorType } from './group-error-state';

describe('Error Logging Safety', () => {
  describe('sanitizeErrorForLogging', () => {
    // Unit tests for specific examples
    it('removes standard user JIDs from error messages', () => {
      const error = new Error(
        'Failed to send message to 1234567890@s.whatsapp.net',
      );
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('1234567890@s.whatsapp.net');
      expect(sanitized).toContain('[REDACTED_JID]');
    });

    it('removes user JIDs with device suffix from error messages', () => {
      const error = new Error(
        'Connection failed for 1234567890:80@s.whatsapp.net',
      );
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('1234567890:80@s.whatsapp.net');
      expect(sanitized).toContain('[REDACTED_JID]');
    });

    it('removes group JIDs from error messages', () => {
      const error = new Error('Group 120363123456789@g.us not found');
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('120363123456789@g.us');
      expect(sanitized).toContain('[REDACTED_JID]');
    });

    it('removes phone numbers from error messages', () => {
      const error = new Error('Invalid phone number: +1234567890123');
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('+1234567890123');
      expect(sanitized).toContain('[REDACTED_PHONE]');
    });

    it('removes long quoted content from error messages', () => {
      const error = new Error(
        'Failed to process message: "This is a very long message content that should be redacted"',
      );
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('This is a very long message content');
      expect(sanitized).toContain('[REDACTED_CONTENT]');
    });

    it('preserves short quoted content', () => {
      const error = new Error('Error code: "ERR_001"');
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).toContain('"ERR_001"');
    });

    it('handles non-Error objects', () => {
      const sanitized = sanitizeErrorForLogging('string error');
      expect(sanitized).toBe('Unknown error');

      const sanitized2 = sanitizeErrorForLogging(null);
      expect(sanitized2).toBe('Unknown error');

      const sanitized3 = sanitizeErrorForLogging(undefined);
      expect(sanitized3).toBe('Unknown error');
    });

    it('handles errors with multiple sensitive data types', () => {
      const error = new Error(
        'User 1234567890@s.whatsapp.net sent message "This is a very long message that contains sensitive content" to +9876543210123',
      );
      const sanitized = sanitizeErrorForLogging(error);
      expect(sanitized).not.toContain('1234567890@s.whatsapp.net');
      expect(sanitized).not.toContain('+9876543210123');
      expect(sanitized).not.toContain('This is a very long message');
    });
  });

  describe('getErrorType', () => {
    it('identifies network errors', () => {
      expect(getErrorType(new Error('Network error'))).toBe('network');
      expect(getErrorType(new Error('Failed to fetch'))).toBe('network');
      expect(getErrorType(new Error('Connection refused'))).toBe('network');
    });

    it('identifies session disconnected errors', () => {
      expect(getErrorType(new Error('Session disconnected'))).toBe(
        'session-disconnected',
      );
      expect(getErrorType(new Error('WhatsApp session expired'))).toBe(
        'session-disconnected',
      );
    });

    it('identifies not found errors', () => {
      expect(getErrorType(new Error('Group not found'))).toBe(
        'group-not-found',
      );
      expect(getErrorType(new Error('404 Not Found'))).toBe('group-not-found');
    });

    it('identifies sync errors', () => {
      expect(getErrorType(new Error('Sync failed'))).toBe('sync-failed');
    });

    it('identifies rate limit errors', () => {
      expect(getErrorType(new Error('Rate limited'))).toBe('rate-limited');
      expect(getErrorType(new Error('429 Too Many Requests'))).toBe(
        'rate-limited',
      );
    });

    it('returns generic for unknown errors', () => {
      expect(getErrorType(new Error('Something went wrong'))).toBe('generic');
      expect(getErrorType('string error')).toBe('generic');
      expect(getErrorType(null)).toBe('generic');
    });
  });

  /**
   * Property 14: Error Logging Safety
   *
   * For any logged error, the log message SHALL NOT contain user JIDs,
   * phone numbers, or message content.
   *
   * Validates: Requirements 9.4
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for phone numbers (10-15 digits)
    const phoneNumberArb = fc
      .integer({ min: 1000000000, max: 999999999999999 })
      .map(n => n.toString());

    // Arbitrary for device IDs
    const deviceIdArb = fc.integer({ min: 1, max: 999 }).map(n => n.toString());

    // Arbitrary for JID domains
    const jidDomainArb = fc.constantFrom('s.whatsapp.net', 'g.us');

    // Arbitrary for standard JIDs
    const standardJidArb = fc
      .tuple(phoneNumberArb, jidDomainArb)
      .map(([phone, domain]) => `${phone}@${domain}`);

    // Arbitrary for JIDs with device suffix
    const deviceJidArb = fc
      .tuple(phoneNumberArb, deviceIdArb)
      .map(([phone, device]) => `${phone}:${device}@s.whatsapp.net`);

    // Arbitrary for any JID format
    const anyJidArb = fc.oneof(standardJidArb, deviceJidArb);

    // Arbitrary for long message content (> 20 chars)
    const longContentArb = fc
      .string({ minLength: 25, maxLength: 100 })
      .filter(s => !s.includes('"') && !s.includes("'"));

    // Arbitrary for phone numbers with optional + prefix
    const phoneWithPrefixArb = fc
      .tuple(fc.boolean(), phoneNumberArb)
      .map(([hasPlus, phone]) => (hasPlus ? `+${phone}` : phone));

    it('Property 14: sanitized errors do not contain JIDs', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * For any error message containing a JID, the sanitized output should not contain the JID
       */
      fc.assert(
        fc.property(anyJidArb, fc.string(), (jid, prefix) => {
          const error = new Error(`${prefix} ${jid} error`);
          const sanitized = sanitizeErrorForLogging(error);

          // The sanitized message should not contain the original JID
          return !sanitized.includes(jid);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: sanitized errors do not contain phone numbers', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * For any error message containing a phone number, the sanitized output should not contain it
       */
      fc.assert(
        fc.property(phoneWithPrefixArb, fc.string(), (phone, prefix) => {
          const error = new Error(`${prefix} ${phone} error`);
          const sanitized = sanitizeErrorForLogging(error);

          // The sanitized message should not contain the original phone number
          return !sanitized.includes(phone);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: sanitized errors do not contain long quoted content', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * For any error message containing long quoted content, the sanitized output should not contain it
       */
      fc.assert(
        fc.property(longContentArb, content => {
          const error = new Error(`Failed to process: "${content}"`);
          const sanitized = sanitizeErrorForLogging(error);

          // The sanitized message should not contain the original content
          return !sanitized.includes(content);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: sanitization replaces sensitive data with redaction markers', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * For any error with sensitive data, the sanitized output should contain redaction markers
       */
      fc.assert(
        fc.property(anyJidArb, jid => {
          const error = new Error(`Error with ${jid}`);
          const sanitized = sanitizeErrorForLogging(error);

          // The sanitized message should contain the redaction marker
          return sanitized.includes('[REDACTED_JID]');
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: sanitization is idempotent', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * Sanitizing an already sanitized message should produce the same result
       */
      fc.assert(
        fc.property(anyJidArb, phoneWithPrefixArb, (jid, phone) => {
          const error = new Error(`User ${jid} called ${phone}`);
          const sanitized = sanitizeErrorForLogging(error);
          const sanitizedAgain = sanitizeErrorForLogging(new Error(sanitized));

          return sanitized === sanitizedAgain;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: sanitization preserves error structure', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * Sanitization should return a string (not throw or return undefined)
       */
      fc.assert(
        fc.property(fc.string(), message => {
          const error = new Error(message);
          const sanitized = sanitizeErrorForLogging(error);

          // Should always return a non-empty string
          return typeof sanitized === 'string' && sanitized.length > 0;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 14: non-Error inputs return safe default', () => {
      /**
       * Feature: whatsapp-groups-management, Property 14: Error Logging Safety
       * Non-Error inputs should return a safe default message
       */
      fc.assert(
        fc.property(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.constant(null),
            fc.constant(undefined),
            fc.object(),
          ),
          input => {
            const sanitized = sanitizeErrorForLogging(input);
            return sanitized === 'Unknown error';
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
