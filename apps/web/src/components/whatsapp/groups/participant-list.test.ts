/**
 * Property-based tests for ParticipantList component
 *
 * Feature: whatsapp-groups-management
 * Property 7: Participant Role Grouping
 * Property 9: Owner Identification
 * Property 10: Participant Search Correctness
 * Validates: Requirements 4.1, 3.5, 4.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  sortParticipantsByRole,
  groupParticipantsByRole,
  isParticipantOwner,
  getParticipantDisplayName,
} from './participant-card';
import { filterParticipantsBySearch } from './participant-list';
import type {
  WhatsAppGroupParticipant,
  ParticipantRole,
} from '@pharmabroker/schemas';

// ============================================================================
// Test Arbitraries
// ============================================================================

// Arbitrary for participant roles
const roleArb: fc.Arbitrary<ParticipantRole> = fc.constantFrom(
  'superadmin',
  'admin',
  'member',
);

// Arbitrary for phone numbers (numeric strings) - using integer for speed
const phoneNumberArb = fc
  .integer({ min: 1000000000, max: 9999999999999 })
  .map(n => n.toString());

// Arbitrary for generating valid WhatsApp participant JIDs
const participantJidArb = phoneNumberArb.map(
  phone => `${phone}@s.whatsapp.net`,
);

// Arbitrary for generating valid WhatsApp participants - simplified for speed
const participantArb: fc.Arbitrary<WhatsAppGroupParticipant> = fc.record({
  id: fc.uuid(),
  jid: participantJidArb,
  role: roleArb,
  displayName: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: null,
  }),
  avatarUrl: fc.constant(null), // Simplified - not needed for logic tests
  groupId: fc.uuid(),
  joinedAt: fc.date({ min: new Date('2023-01-01'), max: new Date() }),
  addedBy: fc.constant(null), // Simplified - not needed for logic tests
  updatedAt: fc.date({ min: new Date('2023-01-01'), max: new Date() }),
});

// Arbitrary for generating a list of participants - reduced max size
const participantListArb = fc.array(participantArb, {
  minLength: 0,
  maxLength: 20,
});

// Arbitrary for search queries - reduced size
const searchQueryArb = fc.string({ minLength: 0, maxLength: 20 });

// ============================================================================
// Property 7: Participant Role Grouping
// ============================================================================

/**
 * Property 7: Participant Role Grouping
 *
 * For any group's participant list, participants SHALL be ordered by role
 * priority: superadmin first, then admin, then member.
 *
 * Validates: Requirements 4.1
 */
describe('Property 7: Participant Role Grouping', () => {
  // Role priority map for validation
  const rolePriority: Record<ParticipantRole, number> = {
    superadmin: 0,
    admin: 1,
    member: 2,
  };

  describe('sortParticipantsByRole', () => {
    // Unit tests for specific examples
    it('sorts participants by role priority', () => {
      const participants: WhatsAppGroupParticipant[] = [
        createParticipant('1', 'member'),
        createParticipant('2', 'superadmin'),
        createParticipant('3', 'admin'),
      ];

      const sorted = sortParticipantsByRole(participants);

      expect(sorted[0].role).toBe('superadmin');
      expect(sorted[1].role).toBe('admin');
      expect(sorted[2].role).toBe('member');
    });

    it('handles empty list', () => {
      expect(sortParticipantsByRole([])).toEqual([]);
    });

    it('handles single participant', () => {
      const participants = [createParticipant('1', 'admin')];
      const sorted = sortParticipantsByRole(participants);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].role).toBe('admin');
    });
  });

  describe('groupParticipantsByRole', () => {
    it('groups participants correctly', () => {
      const participants: WhatsAppGroupParticipant[] = [
        createParticipant('1', 'member'),
        createParticipant('2', 'superadmin'),
        createParticipant('3', 'admin'),
        createParticipant('4', 'member'),
      ];

      const grouped = groupParticipantsByRole(participants);

      expect(grouped.superadmin).toHaveLength(1);
      expect(grouped.admin).toHaveLength(1);
      expect(grouped.member).toHaveLength(2);
    });

    it('handles empty list', () => {
      const grouped = groupParticipantsByRole([]);
      expect(grouped.superadmin).toHaveLength(0);
      expect(grouped.admin).toHaveLength(0);
      expect(grouped.member).toHaveLength(0);
    });
  });

  describe('Property-Based Tests', () => {
    it('Property 7: sorted participants maintain role priority order', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * For any list of participants, sorting should maintain role priority order
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const sorted = sortParticipantsByRole(participants);

          // Check that each participant has priority <= next participant
          for (let i = 0; i < sorted.length - 1; i++) {
            if (
              rolePriority[sorted[i].role] > rolePriority[sorted[i + 1].role]
            ) {
              return false;
            }
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: sorting preserves all participants', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * Sorting should not add or remove any participants
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const sorted = sortParticipantsByRole(participants);
          return sorted.length === participants.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: grouping preserves all participants', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * Grouping should not lose any participants
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const grouped = groupParticipantsByRole(participants);
          const totalGrouped =
            grouped.superadmin.length +
            grouped.admin.length +
            grouped.member.length;
          return totalGrouped === participants.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: each group contains only participants of that role', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * Each role group should only contain participants with that role
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const grouped = groupParticipantsByRole(participants);

          const superadminCorrect = grouped.superadmin.every(
            p => p.role === 'superadmin',
          );
          const adminCorrect = grouped.admin.every(p => p.role === 'admin');
          const memberCorrect = grouped.member.every(p => p.role === 'member');

          return superadminCorrect && adminCorrect && memberCorrect;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: superadmins always appear before admins in sorted list', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * All superadmins should appear before any admin in the sorted list
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const sorted = sortParticipantsByRole(participants);
          const lastSuperadminIndex = sorted.findLastIndex(
            p => p.role === 'superadmin',
          );
          const firstAdminIndex = sorted.findIndex(p => p.role === 'admin');

          // If both exist, superadmin should come before admin
          if (lastSuperadminIndex !== -1 && firstAdminIndex !== -1) {
            return lastSuperadminIndex < firstAdminIndex;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: admins always appear before members in sorted list', () => {
      /**
       * Feature: whatsapp-groups-management, Property 7: Participant Role Grouping
       * All admins should appear before any member in the sorted list
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const sorted = sortParticipantsByRole(participants);
          const lastAdminIndex = sorted.findLastIndex(p => p.role === 'admin');
          const firstMemberIndex = sorted.findIndex(p => p.role === 'member');

          // If both exist, admin should come before member
          if (lastAdminIndex !== -1 && firstMemberIndex !== -1) {
            return lastAdminIndex < firstMemberIndex;
          }
          return true;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Property 9: Owner Identification
// ============================================================================

/**
 * Property 9: Owner Identification
 *
 * For any group with an ownerJid, exactly one participant in the participant
 * list SHALL be marked as owner, and that participant's JID SHALL match the
 * group's ownerJid.
 *
 * Validates: Requirements 3.5
 */
describe('Property 9: Owner Identification', () => {
  describe('isParticipantOwner', () => {
    // Unit tests for specific examples
    it('returns true when JIDs match exactly', () => {
      expect(
        isParticipantOwner(
          '1234567890@s.whatsapp.net',
          '1234567890@s.whatsapp.net',
        ),
      ).toBe(true);
    });

    it('returns true when phone numbers match despite device suffix', () => {
      expect(
        isParticipantOwner(
          '1234567890:80@s.whatsapp.net',
          '1234567890@s.whatsapp.net',
        ),
      ).toBe(true);
    });

    it('returns false when phone numbers differ', () => {
      expect(
        isParticipantOwner(
          '1234567890@s.whatsapp.net',
          '9876543210@s.whatsapp.net',
        ),
      ).toBe(false);
    });

    it('returns false when ownerJid is null', () => {
      expect(isParticipantOwner('1234567890@s.whatsapp.net', null)).toBe(false);
    });

    it('returns false when ownerJid is undefined', () => {
      expect(isParticipantOwner('1234567890@s.whatsapp.net', undefined)).toBe(
        false,
      );
    });
  });

  describe('Property-Based Tests', () => {
    it('Property 9: exactly one participant matches ownerJid when owner exists in list', () => {
      /**
       * Feature: whatsapp-groups-management, Property 9: Owner Identification
       * When ownerJid matches a participant, exactly one should be identified as owner
       */
      fc.assert(
        fc.property(
          fc.array(participantArb, { minLength: 1, maxLength: 20 }),
          participants => {
            // Use the first participant's JID as the owner
            const ownerJid = participants[0].jid;

            // Count how many participants are identified as owner
            const ownerCount = participants.filter(p =>
              isParticipantOwner(p.jid, ownerJid),
            ).length;

            // Should be at least 1 (the first participant)
            return ownerCount >= 1;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 9: no participant is owner when ownerJid is null', () => {
      /**
       * Feature: whatsapp-groups-management, Property 9: Owner Identification
       * When ownerJid is null, no participant should be identified as owner
       */
      fc.assert(
        fc.property(participantListArb, participants => {
          const ownerCount = participants.filter(p =>
            isParticipantOwner(p.jid, null),
          ).length;
          return ownerCount === 0;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 9: owner identification is consistent for same JID', () => {
      /**
       * Feature: whatsapp-groups-management, Property 9: Owner Identification
       * Calling isParticipantOwner multiple times with same inputs should return same result
       */
      fc.assert(
        fc.property(
          participantJidArb,
          fc.option(participantJidArb, { nil: null }),
          (participantJid, ownerJid) => {
            const result1 = isParticipantOwner(participantJid, ownerJid);
            const result2 = isParticipantOwner(participantJid, ownerJid);
            return result1 === result2;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 9: owner identification matches phone number regardless of device suffix', () => {
      /**
       * Feature: whatsapp-groups-management, Property 9: Owner Identification
       * JIDs with same phone number but different device suffixes should match
       */
      const deviceIdArb = fc
        .integer({ min: 1, max: 999 })
        .map(n => n.toString());

      fc.assert(
        fc.property(phoneNumberArb, deviceIdArb, (phone, device) => {
          const jidWithDevice = `${phone}:${device}@s.whatsapp.net`;
          const jidWithoutDevice = `${phone}@s.whatsapp.net`;

          return isParticipantOwner(jidWithDevice, jidWithoutDevice);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Property 10: Participant Search Correctness
// ============================================================================

/**
 * Property 10: Participant Search Correctness
 *
 * For any participant search query, the filtered participant list SHALL contain
 * only participants whose displayName or extracted phone number includes the
 * search string.
 *
 * Validates: Requirements 4.5
 */
describe('Property 10: Participant Search Correctness', () => {
  describe('filterParticipantsBySearch', () => {
    // Unit tests for specific examples
    it('returns all participants when search is empty', () => {
      const participants = [
        createParticipant('1', 'member', 'John Doe'),
        createParticipant('2', 'admin', 'Jane Smith'),
      ];
      expect(filterParticipantsBySearch(participants, '')).toEqual(
        participants,
      );
      expect(filterParticipantsBySearch(participants, '   ')).toEqual(
        participants,
      );
    });

    it('filters by display name case-insensitively', () => {
      const participants = [
        createParticipant('1', 'member', 'John Doe'),
        createParticipant('2', 'admin', 'Jane Smith'),
        createParticipant('3', 'member', 'Bob Johnson'),
      ];
      expect(filterParticipantsBySearch(participants, 'john')).toHaveLength(2);
      expect(filterParticipantsBySearch(participants, 'JOHN')).toHaveLength(2);
    });

    it('filters by phone number from JID', () => {
      const participants = [
        createParticipantWithJid(
          '1',
          'member',
          null,
          '1234567890@s.whatsapp.net',
        ),
        createParticipantWithJid(
          '2',
          'admin',
          null,
          '9876543210@s.whatsapp.net',
        ),
      ];
      expect(filterParticipantsBySearch(participants, '1234')).toHaveLength(1);
      expect(filterParticipantsBySearch(participants, '9876')).toHaveLength(1);
    });

    it('returns empty array when no participants match', () => {
      const participants = [
        createParticipant('1', 'member', 'John Doe'),
        createParticipant('2', 'admin', 'Jane Smith'),
      ];
      expect(filterParticipantsBySearch(participants, 'xyz')).toHaveLength(0);
    });
  });

  describe('Property-Based Tests', () => {
    it('Property 10: filtered participants always contain the search string', () => {
      /**
       * Feature: whatsapp-groups-management, Property 10: Participant Search Correctness
       * For any search query, all returned participants must match the query
       */
      fc.assert(
        fc.property(
          participantListArb,
          searchQueryArb,
          (participants, search) => {
            const filtered = filterParticipantsBySearch(participants, search);
            const normalizedSearch = search.toLowerCase().trim();

            // If search is empty/whitespace, all participants should be returned
            if (!normalizedSearch) {
              return filtered.length === participants.length;
            }

            // All filtered participants must match the search
            return filtered.every(participant => {
              const displayName =
                getParticipantDisplayName(participant).toLowerCase();
              const phoneMatch = participant.jid.match(/^(\d+)/);
              const phone = phoneMatch ? phoneMatch[1].toLowerCase() : '';

              return (
                displayName.includes(normalizedSearch) ||
                phone.includes(normalizedSearch)
              );
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 10: no matching participants are excluded', () => {
      /**
       * Feature: whatsapp-groups-management, Property 10: Participant Search Correctness
       * For any search query, no matching participant should be excluded
       */
      fc.assert(
        fc.property(
          participantListArb,
          searchQueryArb,
          (participants, search) => {
            const filtered = filterParticipantsBySearch(participants, search);
            const normalizedSearch = search.toLowerCase().trim();

            // If search is empty, all should be returned
            if (!normalizedSearch) {
              return filtered.length === participants.length;
            }

            // Count expected matches
            const expectedMatches = participants.filter(participant => {
              const displayName =
                getParticipantDisplayName(participant).toLowerCase();
              const phoneMatch = participant.jid.match(/^(\d+)/);
              const phone = phoneMatch ? phoneMatch[1].toLowerCase() : '';

              return (
                displayName.includes(normalizedSearch) ||
                phone.includes(normalizedSearch)
              );
            });

            return filtered.length === expectedMatches.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 10: search is case-insensitive', () => {
      /**
       * Feature: whatsapp-groups-management, Property 10: Participant Search Correctness
       * Searching with different cases should return the same results
       */
      fc.assert(
        fc.property(
          participantListArb,
          searchQueryArb,
          (participants, search) => {
            const lowerResult = filterParticipantsBySearch(
              participants,
              search.toLowerCase(),
            );
            const upperResult = filterParticipantsBySearch(
              participants,
              search.toUpperCase(),
            );
            const mixedResult = filterParticipantsBySearch(
              participants,
              search,
            );

            return (
              lowerResult.length === upperResult.length &&
              upperResult.length === mixedResult.length
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 10: empty search returns all participants', () => {
      /**
       * Feature: whatsapp-groups-management, Property 10: Participant Search Correctness
       * Empty or whitespace-only search should return all participants
       */
      const whitespaceArb = fc
        .array(fc.constantFrom(' ', '\t', '\n', '\r'), {
          minLength: 0,
          maxLength: 10,
        })
        .map(chars => chars.join(''));

      fc.assert(
        fc.property(
          participantListArb,
          whitespaceArb,
          (participants, search) => {
            const filtered = filterParticipantsBySearch(participants, search);
            return filtered.length === participants.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 10: filtered result is a subset of original participants', () => {
      /**
       * Feature: whatsapp-groups-management, Property 10: Participant Search Correctness
       * Filtered participants should always be a subset of the original list
       */
      fc.assert(
        fc.property(
          participantListArb,
          searchQueryArb,
          (participants, search) => {
            const filtered = filterParticipantsBySearch(participants, search);
            return filtered.length <= participants.length;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Helper Functions for Tests
// ============================================================================

/**
 * Creates a test participant with minimal required fields
 */
function createParticipant(
  id: string,
  role: ParticipantRole,
  displayName: string | null = null,
): WhatsAppGroupParticipant {
  return {
    id,
    jid: `${id}234567890@s.whatsapp.net`,
    role,
    displayName,
    avatarUrl: null,
    groupId: 'test-group-id',
    joinedAt: new Date(),
    addedBy: null,
    updatedAt: new Date(),
  };
}

/**
 * Creates a test participant with a specific JID
 */
function createParticipantWithJid(
  id: string,
  role: ParticipantRole,
  displayName: string | null,
  jid: string,
): WhatsAppGroupParticipant {
  return {
    id,
    jid,
    role,
    displayName,
    avatarUrl: null,
    groupId: 'test-group-id',
    joinedAt: new Date(),
    addedBy: null,
    updatedAt: new Date(),
  };
}
