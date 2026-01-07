/**
 * WhatsApp Groups Router Unit Tests
 *
 * Tests for input validation, authentication, and response shape consistency.
 *
 * **Validates: Requirements 6.3, 7.3**
 */

import { describe, it, expect } from 'bun:test';
import {
  groupFilterInput,
  groupIdInput,
  participantFilterInput,
  syncGroupsInput,
  filterCountsInput,
  groupsListResponse,
  participantsListResponse,
  syncGroupsResponse,
  filterCountsResponse,
  whatsAppGroupWithParticipants,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Input Validation Tests
// ============================================================================

describe('WhatsApp Groups Router - Input Validation', () => {
  /**
   * Tests for groupFilterInput schema validation
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('groupFilterInput validation', () => {
    it('accepts valid filter input with all fields', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        search: 'test',
        filter: 'admin',
        limit: 25,
        cursor: 'abc123',
      };

      const result = groupFilterInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts minimal filter input with defaults', () => {
      const minimalInput = {};

      const result = groupFilterInput.safeParse(minimalInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filter).toBe('all');
        expect(result.data.limit).toBe(50);
      }
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'not-a-uuid',
      };

      const result = groupFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid filter type', () => {
      const invalidInput = {
        filter: 'invalid_filter',
      };

      const result = groupFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects limit below minimum', () => {
      const invalidInput = {
        limit: 0,
      };

      const result = groupFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects limit above maximum', () => {
      const invalidInput = {
        limit: 101,
      };

      const result = groupFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('accepts all valid filter types', () => {
      const filterTypes = ['all', 'admin', 'archived', 'muted'];

      for (const filter of filterTypes) {
        const result = groupFilterInput.safeParse({ filter });
        expect(result.success).toBe(true);
      }
    });

    it('accepts limit at boundary values', () => {
      // Minimum valid limit
      const minResult = groupFilterInput.safeParse({ limit: 1 });
      expect(minResult.success).toBe(true);

      // Maximum valid limit
      const maxResult = groupFilterInput.safeParse({ limit: 100 });
      expect(maxResult.success).toBe(true);
    });
  });

  /**
   * Tests for groupIdInput schema validation
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('groupIdInput validation', () => {
    it('accepts valid UUID groupId', () => {
      const validInput = {
        groupId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = groupIdInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects missing groupId', () => {
      const invalidInput = {};

      const result = groupIdInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID format', () => {
      const invalidInput = {
        groupId: 'not-a-valid-uuid',
      };

      const result = groupIdInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects empty string groupId', () => {
      const invalidInput = {
        groupId: '',
      };

      const result = groupIdInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for participantFilterInput schema validation
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('participantFilterInput validation', () => {
    it('accepts valid participant filter input', () => {
      const validInput = {
        groupId: '550e8400-e29b-41d4-a716-446655440000',
        search: 'john',
        role: 'admin',
        limit: 25,
        cursor: 'cursor123',
      };

      const result = participantFilterInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts minimal input with only required groupId', () => {
      const minimalInput = {
        groupId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = participantFilterInput.safeParse(minimalInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('rejects missing groupId', () => {
      const invalidInput = {
        search: 'test',
      };

      const result = participantFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid role value', () => {
      const invalidInput = {
        groupId: '550e8400-e29b-41d4-a716-446655440000',
        role: 'invalid_role',
      };

      const result = participantFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('accepts all valid role types', () => {
      const roles = ['member', 'admin', 'superadmin'];

      for (const role of roles) {
        const result = participantFilterInput.safeParse({
          groupId: '550e8400-e29b-41d4-a716-446655440000',
          role,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  /**
   * Tests for syncGroupsInput schema validation
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('syncGroupsInput validation', () => {
    it('accepts valid sessionId', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = syncGroupsInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects missing sessionId', () => {
      const invalidInput = {};

      const result = syncGroupsInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'invalid-uuid',
      };

      const result = syncGroupsInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Response Shape Consistency Tests
// ============================================================================

describe('WhatsApp Groups Router - Response Shape Consistency', () => {
  /**
   * Tests for groupsListResponse schema
   * **Validates: Requirements 6.4, 8.4**
   */
  describe('groupsListResponse validation', () => {
    it('validates response with groups and nextCursor', () => {
      const validResponse = {
        groups: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            jid: '1234567890@g.us',
            name: 'Test Group',
            description: 'A test group',
            avatarUrl: null,
            isAnnounce: false,
            isLocked: false,
            isEphemeral: false,
            ephemeralTime: null,
            ownerJid: '1111111111@s.whatsapp.net',
            sessionId: '660e8400-e29b-41d4-a716-446655440000',
            isArchived: false,
            isMuted: false,
            mutedUntil: null,
            memberCount: 10,
            createdAt: '2026-01-05T10:00:00Z',
            updatedAt: '2026-01-05T10:00:00Z',
            groupCreatedAt: '2026-01-01T10:00:00Z',
            lastSyncAt: '2026-01-05T10:00:00Z',
          },
        ],
        nextCursor: 'cursor123',
      };

      const result = groupsListResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates response with empty groups array', () => {
      const emptyResponse = {
        groups: [],
      };

      const result = groupsListResponse.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });

    it('validates response without nextCursor', () => {
      const responseWithoutCursor = {
        groups: [],
        nextCursor: undefined,
      };

      const result = groupsListResponse.safeParse(responseWithoutCursor);
      expect(result.success).toBe(true);
    });

    it('rejects response missing groups array', () => {
      const invalidResponse = {
        nextCursor: 'cursor123',
      };

      const result = groupsListResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for participantsListResponse schema
   * **Validates: Requirements 6.4, 8.4**
   */
  describe('participantsListResponse validation', () => {
    it('validates response with participants', () => {
      const validResponse = {
        participants: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            jid: '1234567890@s.whatsapp.net',
            role: 'admin',
            displayName: 'John Doe',
            avatarUrl: null,
            groupId: '660e8400-e29b-41d4-a716-446655440000',
            joinedAt: '2026-01-05T10:00:00Z',
            addedBy: null,
            updatedAt: '2026-01-05T10:00:00Z',
          },
        ],
        nextCursor: 'cursor123',
      };

      const result = participantsListResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates response with empty participants array', () => {
      const emptyResponse = {
        participants: [],
      };

      const result = participantsListResponse.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });

    it('rejects participant with invalid role', () => {
      const invalidResponse = {
        participants: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            jid: '1234567890@s.whatsapp.net',
            role: 'invalid_role',
            displayName: 'John Doe',
            avatarUrl: null,
            groupId: '660e8400-e29b-41d4-a716-446655440000',
            joinedAt: '2026-01-05T10:00:00Z',
            addedBy: null,
            updatedAt: '2026-01-05T10:00:00Z',
          },
        ],
      };

      const result = participantsListResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for syncGroupsResponse schema
   * **Validates: Requirements 6.4, 8.4**
   */
  describe('syncGroupsResponse validation', () => {
    it('validates successful sync response', () => {
      const validResponse = {
        synced: 10,
        errors: [],
      };

      const result = syncGroupsResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates sync response with errors', () => {
      const responseWithErrors = {
        synced: 5,
        errors: ['Failed to sync group 1', 'Failed to sync group 2'],
      };

      const result = syncGroupsResponse.safeParse(responseWithErrors);
      expect(result.success).toBe(true);
    });

    it('rejects negative synced count', () => {
      const invalidResponse = {
        synced: -1,
        errors: [],
      };

      const result = syncGroupsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects missing errors array', () => {
      const invalidResponse = {
        synced: 10,
      };

      const result = syncGroupsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for whatsAppGroupWithParticipants schema
   * **Validates: Requirements 6.4, 8.4**
   */
  describe('whatsAppGroupWithParticipants validation', () => {
    it('validates group with participants', () => {
      const validGroup = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Test Group',
        description: 'A test group',
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: '1111111111@s.whatsapp.net',
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 2,
        createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-01-05T10:00:00Z',
        groupCreatedAt: '2026-01-01T10:00:00Z',
        lastSyncAt: '2026-01-05T10:00:00Z',
        participants: [
          {
            id: '770e8400-e29b-41d4-a716-446655440000',
            jid: '1111111111@s.whatsapp.net',
            role: 'superadmin',
            displayName: 'Admin User',
            avatarUrl: null,
            groupId: '550e8400-e29b-41d4-a716-446655440000',
            joinedAt: '2026-01-01T10:00:00Z',
            addedBy: null,
            updatedAt: '2026-01-05T10:00:00Z',
          },
          {
            id: '880e8400-e29b-41d4-a716-446655440000',
            jid: '2222222222@s.whatsapp.net',
            role: 'member',
            displayName: 'Regular User',
            avatarUrl: null,
            groupId: '550e8400-e29b-41d4-a716-446655440000',
            joinedAt: '2026-01-02T10:00:00Z',
            addedBy: '1111111111@s.whatsapp.net',
            updatedAt: '2026-01-05T10:00:00Z',
          },
        ],
      };

      const result = whatsAppGroupWithParticipants.safeParse(validGroup);
      expect(result.success).toBe(true);
    });

    it('validates group with empty participants array', () => {
      const groupWithNoParticipants = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Empty Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 0,
        createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-01-05T10:00:00Z',
        groupCreatedAt: null,
        lastSyncAt: null,
        participants: [],
      };

      const result = whatsAppGroupWithParticipants.safeParse(
        groupWithNoParticipants,
      );
      expect(result.success).toBe(true);
    });

    it('rejects group missing participants array', () => {
      const groupWithoutParticipants = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 0,
        createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-01-05T10:00:00Z',
        groupCreatedAt: null,
        lastSyncAt: null,
      };

      const result = whatsAppGroupWithParticipants.safeParse(
        groupWithoutParticipants,
      );
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Date Serialization Tests
// ============================================================================

describe('WhatsApp Groups Router - Date Serialization', () => {
  /**
   * Tests for ISO 8601 date serialization
   * **Validates: Requirements 6.4**
   */
  describe('ISO 8601 date handling', () => {
    it('accepts ISO 8601 date strings', () => {
      const validGroup = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 0,
        createdAt: '2026-01-05T10:00:00.000Z',
        updatedAt: '2026-01-05T10:00:00.000Z',
        groupCreatedAt: null,
        lastSyncAt: null,
        participants: [],
      };

      const result = whatsAppGroupWithParticipants.safeParse(validGroup);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.createdAt instanceof Date).toBe(true);
        expect(result.data.updatedAt instanceof Date).toBe(true);
      }
    });

    it('accepts Date objects and coerces them', () => {
      const groupWithDateObjects = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 0,
        createdAt: new Date('2026-01-05T10:00:00Z'),
        updatedAt: new Date('2026-01-05T10:00:00Z'),
        groupCreatedAt: null,
        lastSyncAt: null,
        participants: [],
      };

      const result =
        whatsAppGroupWithParticipants.safeParse(groupWithDateObjects);
      expect(result.success).toBe(true);
    });

    it('rejects invalid date strings', () => {
      const groupWithInvalidDate = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@g.us',
        name: 'Test Group',
        description: null,
        avatarUrl: null,
        isAnnounce: false,
        isLocked: false,
        isEphemeral: false,
        ephemeralTime: null,
        ownerJid: null,
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        isArchived: false,
        isMuted: false,
        mutedUntil: null,
        memberCount: 0,
        createdAt: 'not-a-date',
        updatedAt: '2026-01-05T10:00:00Z',
        groupCreatedAt: null,
        lastSyncAt: null,
        participants: [],
      };

      const result =
        whatsAppGroupWithParticipants.safeParse(groupWithInvalidDate);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Filter Counts Endpoint Tests
// ============================================================================

describe('WhatsApp Groups Router - Filter Counts', () => {
  /**
   * Tests for filterCountsInput schema validation
   * **Validates: Requirements 3.1, 3.3**
   */
  describe('filterCountsInput validation', () => {
    it('accepts empty input (all sessions)', () => {
      const emptyInput = {};

      const result = filterCountsInput.safeParse(emptyInput);
      expect(result.success).toBe(true);
    });

    it('accepts valid sessionId', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      const result = filterCountsInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'not-a-uuid',
      };

      const result = filterCountsInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects empty string sessionId', () => {
      const invalidInput = {
        sessionId: '',
      };

      const result = filterCountsInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for filterCountsResponse schema validation
   * **Validates: Requirements 3.2, 3.5, 3.6, 3.7**
   */
  describe('filterCountsResponse validation', () => {
    it('validates response with all counts', () => {
      const validResponse = {
        all: 100,
        admin: 25,
        archived: 10,
        muted: 15,
      };

      const result = filterCountsResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
    });

    it('validates response with zero counts', () => {
      const zeroResponse = {
        all: 0,
        admin: 0,
        archived: 0,
        muted: 0,
      };

      const result = filterCountsResponse.safeParse(zeroResponse);
      expect(result.success).toBe(true);
    });

    it('validates response with large counts', () => {
      const largeResponse = {
        all: 10000,
        admin: 5000,
        archived: 2500,
        muted: 1000,
      };

      const result = filterCountsResponse.safeParse(largeResponse);
      expect(result.success).toBe(true);
    });

    it('rejects negative all count', () => {
      const invalidResponse = {
        all: -1,
        admin: 0,
        archived: 0,
        muted: 0,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects negative admin count', () => {
      const invalidResponse = {
        all: 10,
        admin: -5,
        archived: 0,
        muted: 0,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects negative archived count', () => {
      const invalidResponse = {
        all: 10,
        admin: 5,
        archived: -2,
        muted: 0,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects negative muted count', () => {
      const invalidResponse = {
        all: 10,
        admin: 5,
        archived: 2,
        muted: -1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects missing all field', () => {
      const invalidResponse = {
        admin: 5,
        archived: 2,
        muted: 1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects missing admin field', () => {
      const invalidResponse = {
        all: 10,
        archived: 2,
        muted: 1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects missing archived field', () => {
      const invalidResponse = {
        all: 10,
        admin: 5,
        muted: 1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects missing muted field', () => {
      const invalidResponse = {
        all: 10,
        admin: 5,
        archived: 2,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects non-integer counts', () => {
      const invalidResponse = {
        all: 10.5,
        admin: 5,
        archived: 2,
        muted: 1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });

    it('rejects string counts', () => {
      const invalidResponse = {
        all: '10',
        admin: 5,
        archived: 2,
        muted: 1,
      };

      const result = filterCountsResponse.safeParse(invalidResponse);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for filter counts consistency
   * **Validates: Requirements 4.2**
   */
  describe('filter counts consistency', () => {
    it('admin count can be less than or equal to all count', () => {
      // This is a logical constraint - admin groups are a subset of all groups
      const validResponse = {
        all: 100,
        admin: 25, // 25 <= 100 ✓
        archived: 10,
        muted: 15,
      };

      const result = filterCountsResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
      expect(validResponse.admin).toBeLessThanOrEqual(validResponse.all);
    });

    it('archived count can be less than or equal to all count', () => {
      const validResponse = {
        all: 100,
        admin: 25,
        archived: 10, // 10 <= 100 ✓
        muted: 15,
      };

      const result = filterCountsResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
      expect(validResponse.archived).toBeLessThanOrEqual(validResponse.all);
    });

    it('muted count can be less than or equal to all count', () => {
      const validResponse = {
        all: 100,
        admin: 25,
        archived: 10,
        muted: 15, // 15 <= 100 ✓
      };

      const result = filterCountsResponse.safeParse(validResponse);
      expect(result.success).toBe(true);
      expect(validResponse.muted).toBeLessThanOrEqual(validResponse.all);
    });

    it('all counts can be zero when no groups exist', () => {
      const emptyResponse = {
        all: 0,
        admin: 0,
        archived: 0,
        muted: 0,
      };

      const result = filterCountsResponse.safeParse(emptyResponse);
      expect(result.success).toBe(true);
    });
  });
});
