/**
 * Property-based tests for GroupCard component
 *
 * Feature: whatsapp-groups-management
 * Property 1: Group Card Data Completeness
 * Validates: Requirements 1.5, 3.2, 4.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractGroupCardData, isGroupCardDataComplete } from './group-card';
import type { WhatsAppGroup } from '@pharmabroker/schemas';

describe('GroupCard', () => {
  // Arbitrary for generating valid WhatsApp groups
  const validGroupArb: fc.Arbitrary<WhatsAppGroup> = fc.record({
    id: fc.uuid(),
    jid: fc.string({ minLength: 10, maxLength: 30 }).map(s => `${s}@g.us`),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    description: fc.option(fc.string({ minLength: 0, maxLength: 500 }), {
      nil: null,
    }),
    avatarUrl: fc.option(fc.webUrl(), { nil: null }),
    isAnnounce: fc.boolean(),
    isLocked: fc.boolean(),
    isEphemeral: fc.boolean(),
    ephemeralTime: fc.option(fc.integer({ min: 60, max: 604800 }), {
      nil: null,
    }),
    ownerJid: fc.option(
      fc
        .string({ minLength: 10, maxLength: 20 })
        .map(s => `${s}@s.whatsapp.net`),
      { nil: null },
    ),
    sessionId: fc.uuid(),
    memberCount: fc.integer({ min: 0, max: 1000 }),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    updatedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
    groupCreatedAt: fc.option(
      fc.date({ min: new Date('2020-01-01'), max: new Date() }),
      { nil: null },
    ),
    lastSyncAt: fc.option(
      fc.date({ min: new Date('2020-01-01'), max: new Date() }),
      { nil: null },
    ),
  });

  describe('extractGroupCardData', () => {
    // Unit tests for specific examples
    it('extracts all required fields from a group', () => {
      const group: WhatsAppGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        jid: '120363123456789@g.us',
        name: 'Test Group',
        description: 'A test group',
        avatarUrl: 'https://example.com/avatar.jpg',
        isAnnounce: true,
        isLocked: false,
        isEphemeral: true,
        ephemeralTime: 86400,
        ownerJid: '1234567890@s.whatsapp.net',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        memberCount: 50,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        groupCreatedAt: new Date('2023-01-01'),
        lastSyncAt: new Date('2024-06-15'),
      };

      const data = extractGroupCardData(group);

      expect(data.id).toBe(group.id);
      expect(data.name).toBe(group.name);
      expect(data.memberCount).toBe(group.memberCount);
      expect(data.lastActivity).toEqual(group.lastSyncAt);
      expect(data.avatarUrl).toBe(group.avatarUrl);
      expect(data.description).toBe(group.description);
      expect(data.settings.isAnnounce).toBe(group.isAnnounce);
      expect(data.settings.isLocked).toBe(group.isLocked);
      expect(data.settings.isEphemeral).toBe(group.isEphemeral);
    });

    it('uses updatedAt when lastSyncAt is null', () => {
      const group: WhatsAppGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        jid: '120363123456789@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        memberCount: 10,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        groupCreatedAt: null,
        lastSyncAt: null,
      };

      const data = extractGroupCardData(group);
      expect(data.lastActivity).toEqual(group.updatedAt);
    });
  });

  describe('isGroupCardDataComplete', () => {
    it('returns true for valid group data', () => {
      const group: WhatsAppGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        jid: '120363123456789@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        memberCount: 10,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        groupCreatedAt: null,
        lastSyncAt: new Date('2024-06-15'),
      };

      expect(isGroupCardDataComplete(group)).toBe(true);
    });

    it('returns false for empty name', () => {
      const group: WhatsAppGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        jid: '120363123456789@g.us',
        name: '',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        memberCount: 10,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        groupCreatedAt: null,
        lastSyncAt: null,
      };

      expect(isGroupCardDataComplete(group)).toBe(false);
    });

    it('returns false for negative member count', () => {
      const group: WhatsAppGroup = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        jid: '120363123456789@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        memberCount: -1,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-06-01'),
        groupCreatedAt: null,
        lastSyncAt: null,
      };

      expect(isGroupCardDataComplete(group)).toBe(false);
    });
  });

  /**
   * Property 1: Group Card Data Completeness
   *
   * For any WhatsApp group, the rendered Group_Card SHALL contain the group name,
   * member count, and a formatted last activity timestamp.
   *
   * Validates: Requirements 1.5, 3.2, 4.2
   */
  describe('Property-Based Tests', () => {
    it('Property 1: extractGroupCardData always includes name, memberCount, and lastActivity', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * For any valid group, extracted data should always contain name, memberCount, and lastActivity
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          const data = extractGroupCardData(group);

          // Must have name
          if (typeof data.name !== 'string') return false;

          // Must have memberCount
          if (typeof data.memberCount !== 'number') return false;

          // Must have lastActivity (either lastSyncAt or updatedAt)
          if (data.lastActivity === null || data.lastActivity === undefined) {
            return false;
          }

          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 1: extractGroupCardData preserves original name and memberCount', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * Extracted name and memberCount should match the original group values
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          const data = extractGroupCardData(group);
          return (
            data.name === group.name && data.memberCount === group.memberCount
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 1: extractGroupCardData uses lastSyncAt when available, otherwise updatedAt', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * lastActivity should be lastSyncAt if available, otherwise updatedAt
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          const data = extractGroupCardData(group);

          // Handle invalid dates (NaN)
          const lastSyncAtValid =
            group.lastSyncAt && !isNaN(group.lastSyncAt.getTime());
          const expectedActivity = lastSyncAtValid
            ? group.lastSyncAt
            : group.updatedAt;

          // If both are invalid, skip this test case
          if (!expectedActivity || isNaN(expectedActivity.getTime())) {
            return true;
          }

          return data.lastActivity?.getTime() === expectedActivity?.getTime();
        }),
        { numRuns: 100 },
      );
    });

    it('Property 1: extractGroupCardData includes all settings', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * Extracted settings should match the original group settings
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          const data = extractGroupCardData(group);
          return (
            data.settings.isAnnounce === group.isAnnounce &&
            data.settings.isLocked === group.isLocked &&
            data.settings.isEphemeral === group.isEphemeral &&
            data.settings.ephemeralTime === group.ephemeralTime
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 1: isGroupCardDataComplete returns true for all valid groups', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * All generated valid groups should pass the completeness check
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          return isGroupCardDataComplete(group);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 1: extractGroupCardData is idempotent for id', () => {
      /**
       * Feature: whatsapp-groups-management, Property 1: Group Card Data Completeness
       * Extracting data multiple times should always return the same id
       */
      fc.assert(
        fc.property(validGroupArb, group => {
          const data1 = extractGroupCardData(group);
          const data2 = extractGroupCardData(group);
          return data1.id === data2.id;
        }),
        { numRuns: 100 },
      );
    });
  });
});
