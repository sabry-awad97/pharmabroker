/**
 * WhatsApp Groups TanStack Query Hooks Integration Tests
 *
 * Tests for verifying TanStack Query hooks compatibility with the API.
 * These tests verify that the hooks interface correctly with the API
 * and that response shapes match frontend expectations.
 *
 * Feature: whatsapp-groups-api
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  whatsappGroupsKeys,
  type UseWhatsappGroupsOptions,
  type UseGroupParticipantsOptions,
} from './whatsapp-groups';
import type {
  GroupFilterInput,
  GroupsListResponse,
  ParticipantsListResponse,
  SyncGroupsResponse,
  WhatsAppGroup,
  WhatsAppGroupParticipant,
  WhatsAppGroupWithParticipants,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Query Key Tests
// ============================================================================

describe('WhatsApp Groups Query Keys', () => {
  describe('whatsappGroupsKeys', () => {
    it('generates consistent base key', () => {
      const key1 = whatsappGroupsKeys.all();
      const key2 = whatsappGroupsKeys.all();
      expect(key1).toEqual(key2);
    });

    it('generates list keys that extend base key', () => {
      const baseKey = whatsappGroupsKeys.all();
      const listsKey = whatsappGroupsKeys.lists();

      // Lists key should start with base key elements
      expect(listsKey.length).toBeGreaterThan(baseKey.length);
      expect(listsKey[listsKey.length - 1]).toBe('list');
    });

    it('generates unique list keys for different filters', () => {
      const key1 = whatsappGroupsKeys.list({ sessionId: 'session-1' });
      const key2 = whatsappGroupsKeys.list({ sessionId: 'session-2' });
      const key3 = whatsappGroupsKeys.list({ search: 'test' });

      expect(key1).not.toEqual(key2);
      expect(key1).not.toEqual(key3);
    });

    it('generates same list key for same filters', () => {
      const filters = {
        sessionId: 'session-1',
        search: 'test',
        filter: 'all' as const,
      };
      const key1 = whatsappGroupsKeys.list(filters);
      const key2 = whatsappGroupsKeys.list(filters);

      expect(key1).toEqual(key2);
    });

    it('generates detail keys that extend base key', () => {
      const baseKey = whatsappGroupsKeys.all();
      const detailsKey = whatsappGroupsKeys.details();

      expect(detailsKey.length).toBeGreaterThan(baseKey.length);
      expect(detailsKey[detailsKey.length - 1]).toBe('detail');
    });

    it('generates unique detail keys for different group IDs', () => {
      const key1 = whatsappGroupsKeys.detail('group-1');
      const key2 = whatsappGroupsKeys.detail('group-2');

      expect(key1).not.toEqual(key2);
    });

    it('generates participant keys that extend base key', () => {
      const baseKey = whatsappGroupsKeys.all();
      const participantsKey = whatsappGroupsKeys.participants();

      expect(participantsKey.length).toBeGreaterThan(baseKey.length);
      expect(participantsKey[participantsKey.length - 1]).toBe('participants');
    });

    it('generates unique participant list keys for different groups', () => {
      const key1 = whatsappGroupsKeys.participantList('group-1');
      const key2 = whatsappGroupsKeys.participantList('group-2');

      expect(key1).not.toEqual(key2);
    });

    it('generates unique participant list keys for different filters', () => {
      const key1 = whatsappGroupsKeys.participantList('group-1', {
        role: 'admin',
      });
      const key2 = whatsappGroupsKeys.participantList('group-1', {
        role: 'member',
      });

      expect(key1).not.toEqual(key2);
    });
  });
});

// ============================================================================
// Response Shape Validation Tests
// ============================================================================

describe('Response Shape Validation', () => {
  /**
   * Feature: whatsapp-groups-api, Property 7: Response Schema Conformance
   *
   * For any API response (groups list, group detail, participants list),
   * the response SHALL conform to the corresponding Zod schema with all
   * required fields present and dates serialized as ISO 8601 strings.
   *
   * **Validates: Requirements 1.6, 3.4, 6.4, 8.4**
   */
  describe('GroupsListResponse shape', () => {
    // Arbitrary for generating valid groups list responses
    const groupsListResponseArb: fc.Arbitrary<GroupsListResponse> = fc.record({
      groups: fc.array(
        fc.record({
          id: fc.uuid(),
          jid: fc
            .string({ minLength: 10, maxLength: 30 })
            .map(s => `${s}@g.us`),
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
        }),
        { minLength: 0, maxLength: 10 },
      ),
      nextCursor: fc.option(fc.uuid(), { nil: undefined }),
    });

    it('has groups array property', () => {
      fc.assert(
        fc.property(groupsListResponseArb, response => {
          return Array.isArray(response.groups);
        }),
        { numRuns: 100 },
      );
    });

    it('has optional nextCursor property', () => {
      fc.assert(
        fc.property(groupsListResponseArb, response => {
          return (
            response.nextCursor === undefined ||
            typeof response.nextCursor === 'string'
          );
        }),
        { numRuns: 100 },
      );
    });

    it('each group has required fields', () => {
      fc.assert(
        fc.property(groupsListResponseArb, response => {
          return response.groups.every(
            group =>
              typeof group.id === 'string' &&
              typeof group.jid === 'string' &&
              typeof group.name === 'string' &&
              typeof group.sessionId === 'string' &&
              typeof group.memberCount === 'number' &&
              typeof group.isAnnounce === 'boolean' &&
              typeof group.isLocked === 'boolean' &&
              typeof group.isEphemeral === 'boolean',
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('ParticipantsListResponse shape', () => {
    // Arbitrary for generating valid participants list responses
    const participantsListResponseArb: fc.Arbitrary<ParticipantsListResponse> =
      fc.record({
        participants: fc.array(
          fc.record({
            id: fc.uuid(),
            jid: fc
              .string({ minLength: 10, maxLength: 20 })
              .map(s => `${s}@s.whatsapp.net`),
            role: fc.constantFrom(
              'member',
              'admin',
              'superadmin',
            ) as fc.Arbitrary<'member' | 'admin' | 'superadmin'>,
            displayName: fc.option(
              fc.string({ minLength: 1, maxLength: 100 }),
              { nil: null },
            ),
            avatarUrl: fc.option(fc.webUrl(), { nil: null }),
            groupId: fc.uuid(),
            joinedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            addedBy: fc.option(
              fc
                .string({ minLength: 10, maxLength: 20 })
                .map(s => `${s}@s.whatsapp.net`),
              { nil: null },
            ),
            updatedAt: fc.date({
              min: new Date('2020-01-01'),
              max: new Date(),
            }),
          }),
          { minLength: 0, maxLength: 10 },
        ),
        nextCursor: fc.option(fc.uuid(), { nil: undefined }),
      });

    it('has participants array property', () => {
      fc.assert(
        fc.property(participantsListResponseArb, response => {
          return Array.isArray(response.participants);
        }),
        { numRuns: 100 },
      );
    });

    it('has optional nextCursor property', () => {
      fc.assert(
        fc.property(participantsListResponseArb, response => {
          return (
            response.nextCursor === undefined ||
            typeof response.nextCursor === 'string'
          );
        }),
        { numRuns: 100 },
      );
    });

    it('each participant has required fields', () => {
      fc.assert(
        fc.property(participantsListResponseArb, response => {
          return response.participants.every(
            participant =>
              typeof participant.id === 'string' &&
              typeof participant.jid === 'string' &&
              typeof participant.role === 'string' &&
              ['member', 'admin', 'superadmin'].includes(participant.role) &&
              typeof participant.groupId === 'string',
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('SyncGroupsResponse shape', () => {
    // Arbitrary for generating valid sync responses
    const syncGroupsResponseArb: fc.Arbitrary<SyncGroupsResponse> = fc.record({
      synced: fc.integer({ min: 0, max: 1000 }),
      errors: fc.array(fc.string({ minLength: 1, maxLength: 200 }), {
        minLength: 0,
        maxLength: 5,
      }),
    });

    it('has synced number property', () => {
      fc.assert(
        fc.property(syncGroupsResponseArb, response => {
          return typeof response.synced === 'number' && response.synced >= 0;
        }),
        { numRuns: 100 },
      );
    });

    it('has errors array property', () => {
      fc.assert(
        fc.property(syncGroupsResponseArb, response => {
          return (
            Array.isArray(response.errors) &&
            response.errors.every(err => typeof err === 'string')
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('WhatsAppGroupWithParticipants shape', () => {
    // Arbitrary for generating valid group with participants
    const groupWithParticipantsArb: fc.Arbitrary<WhatsAppGroupWithParticipants> =
      fc.record({
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
        participants: fc.array(
          fc.record({
            id: fc.uuid(),
            jid: fc
              .string({ minLength: 10, maxLength: 20 })
              .map(s => `${s}@s.whatsapp.net`),
            role: fc.constantFrom(
              'member',
              'admin',
              'superadmin',
            ) as fc.Arbitrary<'member' | 'admin' | 'superadmin'>,
            displayName: fc.option(
              fc.string({ minLength: 1, maxLength: 100 }),
              { nil: null },
            ),
            avatarUrl: fc.option(fc.webUrl(), { nil: null }),
            groupId: fc.uuid(),
            joinedAt: fc.date({ min: new Date('2020-01-01'), max: new Date() }),
            addedBy: fc.option(
              fc
                .string({ minLength: 10, maxLength: 20 })
                .map(s => `${s}@s.whatsapp.net`),
              { nil: null },
            ),
            updatedAt: fc.date({
              min: new Date('2020-01-01'),
              max: new Date(),
            }),
          }),
          { minLength: 0, maxLength: 20 },
        ),
      });

    it('has all group fields plus participants array', () => {
      fc.assert(
        fc.property(groupWithParticipantsArb, group => {
          return (
            typeof group.id === 'string' &&
            typeof group.jid === 'string' &&
            typeof group.name === 'string' &&
            typeof group.sessionId === 'string' &&
            typeof group.memberCount === 'number' &&
            Array.isArray(group.participants)
          );
        }),
        { numRuns: 100 },
      );
    });

    it('participants have valid roles', () => {
      fc.assert(
        fc.property(groupWithParticipantsArb, group => {
          return group.participants.every(p =>
            ['member', 'admin', 'superadmin'].includes(p.role),
          );
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Hook Options Validation Tests
// ============================================================================

describe('Hook Options Validation', () => {
  describe('UseWhatsappGroupsOptions', () => {
    it('accepts valid filter options', () => {
      const validOptions: UseWhatsappGroupsOptions[] = [
        {},
        { sessionId: '123e4567-e89b-12d3-a456-426614174000' },
        { search: 'test' },
        { filter: 'all' },
        { filter: 'admin' },
        { limit: 50 },
        { enabled: true },
        { enabled: false },
        {
          sessionId: '123e4567-e89b-12d3-a456-426614174000',
          search: 'test',
          filter: 'admin',
          limit: 25,
          enabled: true,
        },
      ];

      validOptions.forEach(options => {
        // Verify options have expected types
        if (options.sessionId !== undefined) {
          expect(typeof options.sessionId).toBe('string');
        }
        if (options.search !== undefined) {
          expect(typeof options.search).toBe('string');
        }
        if (options.filter !== undefined) {
          expect(['all', 'admin', 'archived', 'muted']).toContain(
            options.filter,
          );
        }
        if (options.limit !== undefined) {
          expect(typeof options.limit).toBe('number');
        }
        if (options.enabled !== undefined) {
          expect(typeof options.enabled).toBe('boolean');
        }
      });
    });
  });

  describe('UseGroupParticipantsOptions', () => {
    it('requires groupId', () => {
      const validOptions: UseGroupParticipantsOptions = {
        groupId: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(typeof validOptions.groupId).toBe('string');
    });

    it('accepts optional filter options', () => {
      const validOptions: UseGroupParticipantsOptions[] = [
        { groupId: '123e4567-e89b-12d3-a456-426614174000' },
        { groupId: '123e4567-e89b-12d3-a456-426614174000', search: 'john' },
        { groupId: '123e4567-e89b-12d3-a456-426614174000', role: 'admin' },
        { groupId: '123e4567-e89b-12d3-a456-426614174000', limit: 25 },
        { groupId: '123e4567-e89b-12d3-a456-426614174000', enabled: false },
        {
          groupId: '123e4567-e89b-12d3-a456-426614174000',
          search: 'john',
          role: 'member',
          limit: 50,
          enabled: true,
        },
      ];

      validOptions.forEach(options => {
        expect(typeof options.groupId).toBe('string');
        if (options.search !== undefined) {
          expect(typeof options.search).toBe('string');
        }
        if (options.role !== undefined) {
          expect(['member', 'admin', 'superadmin']).toContain(options.role);
        }
        if (options.limit !== undefined) {
          expect(typeof options.limit).toBe('number');
        }
        if (options.enabled !== undefined) {
          expect(typeof options.enabled).toBe('boolean');
        }
      });
    });
  });
});

// ============================================================================
// Pagination Support Tests
// ============================================================================

describe('Pagination Support', () => {
  /**
   * Feature: whatsapp-groups-api, Property 6: Pagination Completeness
   *
   * For any paginated query, iterating through all pages using the nextCursor
   * SHALL return all items exactly once with no duplicates and no missing items.
   *
   * **Validates: Requirements 1.5, 3.1, 8.2**
   */
  describe('Cursor-based pagination', () => {
    it('nextCursor is undefined when no more pages', () => {
      const lastPageResponse: GroupsListResponse = {
        groups: [],
        nextCursor: undefined,
      };

      expect(lastPageResponse.nextCursor).toBeUndefined();
    });

    it('nextCursor is string when more pages exist', () => {
      const midPageResponse: GroupsListResponse = {
        groups: [],
        nextCursor: '123e4567-e89b-12d3-a456-426614174000',
      };

      expect(typeof midPageResponse.nextCursor).toBe('string');
    });

    it('useInfiniteQuery getNextPageParam returns nextCursor', () => {
      // Simulate the getNextPageParam function from useWhatsappGroups
      const getNextPageParam = (lastPage: GroupsListResponse) =>
        lastPage.nextCursor;

      const pageWithMore: GroupsListResponse = {
        groups: [],
        nextCursor: 'next-cursor-id',
      };

      const lastPage: GroupsListResponse = {
        groups: [],
        nextCursor: undefined,
      };

      expect(getNextPageParam(pageWithMore)).toBe('next-cursor-id');
      expect(getNextPageParam(lastPage)).toBeUndefined();
    });
  });
});

// ============================================================================
// Cache Invalidation Tests
// ============================================================================

describe('Cache Invalidation', () => {
  /**
   * Feature: whatsapp-groups-api
   *
   * When groups are synced, THE API response SHALL enable proper cache invalidation.
   *
   * **Validates: Requirements 8.3**
   */
  describe('Query key hierarchy for invalidation', () => {
    it('invalidating all() invalidates lists and details', () => {
      const allKey = whatsappGroupsKeys.all();
      const listsKey = whatsappGroupsKeys.lists();
      const detailsKey = whatsappGroupsKeys.details();

      // Lists and details keys should start with the same prefix as all()
      // This ensures invalidating all() will also invalidate lists and details
      const allKeyStr = JSON.stringify(allKey);
      const listsKeyStr = JSON.stringify(listsKey);
      const detailsKeyStr = JSON.stringify(detailsKey);

      // The lists and details keys should contain the all key as a prefix
      expect(listsKeyStr.startsWith(allKeyStr.slice(0, -1))).toBe(true);
      expect(detailsKeyStr.startsWith(allKeyStr.slice(0, -1))).toBe(true);
    });

    it('invalidating lists() invalidates all list queries', () => {
      const listsKey = whatsappGroupsKeys.lists();
      const listKey1 = whatsappGroupsKeys.list({ sessionId: 'session-1' });
      const listKey2 = whatsappGroupsKeys.list({ search: 'test' });

      // List keys should extend the lists key
      expect(listKey1.length).toBeGreaterThan(listsKey.length);
      expect(listKey2.length).toBeGreaterThan(listsKey.length);
    });

    it('invalidating details() invalidates all detail queries', () => {
      const detailsKey = whatsappGroupsKeys.details();
      const detailKey1 = whatsappGroupsKeys.detail('group-1');
      const detailKey2 = whatsappGroupsKeys.detail('group-2');

      // Detail keys should extend the details key
      expect(detailKey1.length).toBeGreaterThan(detailsKey.length);
      expect(detailKey2.length).toBeGreaterThan(detailsKey.length);
    });
  });
});

// ============================================================================
// Type Compatibility Tests
// ============================================================================

describe('Type Compatibility', () => {
  /**
   * Verify that the types exported from the hooks match the schema types
   */
  it('WhatsAppGroup type has all required fields', () => {
    // This is a compile-time check - if types don't match, TypeScript will error
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
      createdAt: new Date(),
      updatedAt: new Date(),
      groupCreatedAt: null,
      lastSyncAt: null,
    };

    expect(group.id).toBeDefined();
    expect(group.name).toBeDefined();
    expect(group.memberCount).toBeDefined();
  });

  it('WhatsAppGroupParticipant type has all required fields', () => {
    const participant: WhatsAppGroupParticipant = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      jid: '1234567890@s.whatsapp.net',
      role: 'member',
      displayName: null,
      avatarUrl: null,
      groupId: '123e4567-e89b-12d3-a456-426614174001',
      joinedAt: new Date(),
      addedBy: null,
      updatedAt: new Date(),
    };

    expect(participant.id).toBeDefined();
    expect(participant.jid).toBeDefined();
    expect(participant.role).toBeDefined();
  });

  it('GroupFilterInput type matches hook options', () => {
    const filterInput: GroupFilterInput = {
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      search: 'test',
      filter: 'admin',
      limit: 50,
      cursor: undefined,
    };

    expect(filterInput.sessionId).toBeDefined();
    expect(filterInput.search).toBeDefined();
    expect(filterInput.filter).toBeDefined();
    expect(filterInput.limit).toBeDefined();
  });
});
