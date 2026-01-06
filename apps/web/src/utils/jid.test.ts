/**
 * Property-based tests for JID utility functions
 *
 * Feature: whatsapp-groups-management
 * Property 8: JID Phone Number Extraction
 * Validates: Requirements 4.4
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { extractPhoneFromJid, isGroupJid, isUserJid } from './jid';

describe('JID Utility', () => {
  describe('extractPhoneFromJid', () => {
    // Unit tests for specific examples
    it('extracts phone from standard user JID', () => {
      expect(extractPhoneFromJid('201021347532@s.whatsapp.net')).toBe(
        '201021347532',
      );
      expect(extractPhoneFromJid('1234567890@s.whatsapp.net')).toBe(
        '1234567890',
      );
    });

    it('extracts phone from user JID with device suffix', () => {
      expect(extractPhoneFromJid('201021347532:80@s.whatsapp.net')).toBe(
        '201021347532',
      );
      expect(extractPhoneFromJid('1234567890:123@s.whatsapp.net')).toBe(
        '1234567890',
      );
    });

    it('extracts phone from group JID', () => {
      expect(extractPhoneFromJid('120363123456789@g.us')).toBe(
        '120363123456789',
      );
    });

    it('returns empty string for empty input', () => {
      expect(extractPhoneFromJid('')).toBe('');
    });

    it('returns original string for non-standard JID', () => {
      expect(extractPhoneFromJid('invalid')).toBe('invalid');
      expect(extractPhoneFromJid('no-numbers-here@s.whatsapp.net')).toBe(
        'no-numbers-here@s.whatsapp.net',
      );
    });
  });

  describe('isGroupJid', () => {
    it('returns true for group JIDs', () => {
      expect(isGroupJid('120363123456789@g.us')).toBe(true);
    });

    it('returns false for user JIDs', () => {
      expect(isGroupJid('1234567890@s.whatsapp.net')).toBe(false);
    });
  });

  describe('isUserJid', () => {
    it('returns true for user JIDs', () => {
      expect(isUserJid('1234567890@s.whatsapp.net')).toBe(true);
    });

    it('returns false for group JIDs', () => {
      expect(isUserJid('120363123456789@g.us')).toBe(false);
    });
  });

  /**
   * Property 8: JID Phone Number Extraction
   *
   * For any valid WhatsApp JID (format: "number@s.whatsapp.net" or
   * "number:device@s.whatsapp.net"), the extracted phone number SHALL be
   * the numeric portion before the "@" symbol.
   *
   * Validates: Requirements 4.4
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for phone numbers (numeric strings)
    const phoneNumberArb = fc
      .string({ minLength: 1, maxLength: 15 })
      .filter(s => /^\d+$/.test(s));

    // Arbitrary for device IDs (numeric strings)
    const deviceIdArb = fc
      .string({ minLength: 1, maxLength: 5 })
      .filter(s => /^\d+$/.test(s));

    it('Property 8: standard user JID extraction returns the phone number', () => {
      /**
       * Feature: whatsapp-groups-management, Property 8: JID Phone Number Extraction
       * For any phone number, creating a standard JID and extracting should return the original number
       */
      fc.assert(
        fc.property(phoneNumberArb, phoneNumber => {
          const jid = `${phoneNumber}@s.whatsapp.net`;
          const extracted = extractPhoneFromJid(jid);
          return extracted === phoneNumber;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 8: user JID with device suffix extraction returns the phone number', () => {
      /**
       * Feature: whatsapp-groups-management, Property 8: JID Phone Number Extraction
       * For any phone number with device suffix, extraction should return only the phone number
       */
      fc.assert(
        fc.property(phoneNumberArb, deviceIdArb, (phoneNumber, deviceId) => {
          const jid = `${phoneNumber}:${deviceId}@s.whatsapp.net`;
          const extracted = extractPhoneFromJid(jid);
          return extracted === phoneNumber;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 8: group JID extraction returns the group ID', () => {
      /**
       * Feature: whatsapp-groups-management, Property 8: JID Phone Number Extraction
       * For any group JID, extraction should return the numeric group ID
       */
      fc.assert(
        fc.property(phoneNumberArb, groupId => {
          const jid = `${groupId}@g.us`;
          const extracted = extractPhoneFromJid(jid);
          return extracted === groupId;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 8: extracted value is always numeric for valid JIDs', () => {
      /**
       * Feature: whatsapp-groups-management, Property 8: JID Phone Number Extraction
       * For any valid JID format, the extracted value should be purely numeric
       */
      const validJidArb = fc.oneof(
        // Standard user JID
        phoneNumberArb.map(phone => `${phone}@s.whatsapp.net`),
        // User JID with device
        fc
          .tuple(phoneNumberArb, deviceIdArb)
          .map(([phone, device]) => `${phone}:${device}@s.whatsapp.net`),
        // Group JID
        phoneNumberArb.map(id => `${id}@g.us`),
      );

      fc.assert(
        fc.property(validJidArb, jid => {
          const extracted = extractPhoneFromJid(jid);
          return /^\d+$/.test(extracted);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 8: extraction is idempotent for phone numbers', () => {
      /**
       * Feature: whatsapp-groups-management, Property 8: JID Phone Number Extraction
       * Extracting from an already extracted phone number should return the same value
       */
      fc.assert(
        fc.property(phoneNumberArb, phoneNumber => {
          const jid = `${phoneNumber}@s.whatsapp.net`;
          const extracted = extractPhoneFromJid(jid);
          const extractedAgain = extractPhoneFromJid(extracted);
          return extracted === extractedAgain;
        }),
        { numRuns: 100 },
      );
    });
  });
});
