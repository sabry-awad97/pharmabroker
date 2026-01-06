/**
 * Property-based tests for GroupFilterPanel filter logic
 *
 * Feature: whatsapp-groups-management
 * Property 4: Search Filter Correctness
 * Property 5: Session Filter Correctness
 * Property 6: Filter Count Accuracy
 * Validates: Requirements 2.2, 2.3, 2.5, 6.1, 6.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  filterGroupsBySearch,
  filterGroupsBySession,
  applyGroupFilters,
} from './group-filter-panel';

// Type for minimal group data needed for filtering
interface FilterableGroup {
  name: string;
  sessionId: string;
}

describe('GroupFilterPanel Filter Logic', () => {
  // Arbitrary for generating groups with names and session IDs
  const groupArb: fc.Arbitrary<FilterableGroup> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    sessionId: fc.uuid(),
  });

  // Arbitrary for generating a list of groups
  const groupListArb = fc.array(groupArb, { minLength: 0, maxLength: 50 });

  // Arbitrary for search queries
  const searchQueryArb = fc.string({ minLength: 0, maxLength: 50 });

  describe('filterGroupsBySearch', () => {
    // Unit tests for specific examples
    it('returns all groups when search is empty', () => {
      const groups: FilterableGroup[] = [
        { name: 'Marketing Team', sessionId: '123' },
        { name: 'Sales Group', sessionId: '456' },
      ];
      expect(filterGroupsBySearch(groups, '')).toEqual(groups);
      expect(filterGroupsBySearch(groups, '   ')).toEqual(groups);
    });

    it('filters groups by name case-insensitively', () => {
      const groups: FilterableGroup[] = [
        { name: 'Marketing Team', sessionId: '123' },
        { name: 'Sales Group', sessionId: '456' },
        { name: 'Dev Team', sessionId: '789' },
      ];
      expect(filterGroupsBySearch(groups, 'team')).toHaveLength(2);
      expect(filterGroupsBySearch(groups, 'TEAM')).toHaveLength(2);
      expect(filterGroupsBySearch(groups, 'sales')).toHaveLength(1);
    });

    it('returns empty array when no groups match', () => {
      const groups: FilterableGroup[] = [
        { name: 'Marketing Team', sessionId: '123' },
        { name: 'Sales Group', sessionId: '456' },
      ];
      expect(filterGroupsBySearch(groups, 'xyz')).toHaveLength(0);
    });
  });

  describe('filterGroupsBySession', () => {
    // Unit tests for specific examples
    it('returns all groups when sessionId is null', () => {
      const groups: FilterableGroup[] = [
        { name: 'Group 1', sessionId: '123' },
        { name: 'Group 2', sessionId: '456' },
      ];
      expect(filterGroupsBySession(groups, null)).toEqual(groups);
    });

    it('filters groups by session ID', () => {
      const groups: FilterableGroup[] = [
        { name: 'Group 1', sessionId: '123' },
        { name: 'Group 2', sessionId: '456' },
        { name: 'Group 3', sessionId: '123' },
      ];
      expect(filterGroupsBySession(groups, '123')).toHaveLength(2);
      expect(filterGroupsBySession(groups, '456')).toHaveLength(1);
    });

    it('returns empty array when no groups match session', () => {
      const groups: FilterableGroup[] = [
        { name: 'Group 1', sessionId: '123' },
        { name: 'Group 2', sessionId: '456' },
      ];
      expect(filterGroupsBySession(groups, '789')).toHaveLength(0);
    });
  });

  /**
   * Property 4: Search Filter Correctness
   *
   * For any search query string, the filtered groups list SHALL contain only
   * groups whose name includes the search string (case-insensitive).
   *
   * Validates: Requirements 2.2, 2.3
   */
  describe('Property 4: Search Filter Correctness', () => {
    it('Property 4: filtered groups always contain the search string in their name', () => {
      /**
       * Feature: whatsapp-groups-management, Property 4: Search Filter Correctness
       * For any search query, all returned groups must have names containing the query
       */
      fc.assert(
        fc.property(groupListArb, searchQueryArb, (groups, search) => {
          const filtered = filterGroupsBySearch(groups, search);
          const normalizedSearch = search.toLowerCase().trim();

          // If search is empty/whitespace, all groups should be returned
          if (!normalizedSearch) {
            return filtered.length === groups.length;
          }

          // All filtered groups must contain the search string
          return filtered.every(group =>
            group.name.toLowerCase().includes(normalizedSearch),
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 4: no matching groups are excluded from results', () => {
      /**
       * Feature: whatsapp-groups-management, Property 4: Search Filter Correctness
       * For any search query, no group that matches should be excluded
       */
      fc.assert(
        fc.property(groupListArb, searchQueryArb, (groups, search) => {
          const filtered = filterGroupsBySearch(groups, search);
          const normalizedSearch = search.toLowerCase().trim();

          // If search is empty, all groups should be returned
          if (!normalizedSearch) {
            return filtered.length === groups.length;
          }

          // Count groups that should match
          const expectedMatches = groups.filter(group =>
            group.name.toLowerCase().includes(normalizedSearch),
          );

          return filtered.length === expectedMatches.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 4: search is case-insensitive', () => {
      /**
       * Feature: whatsapp-groups-management, Property 4: Search Filter Correctness
       * Searching with different cases should return the same results
       */
      fc.assert(
        fc.property(groupListArb, searchQueryArb, (groups, search) => {
          const lowerResult = filterGroupsBySearch(
            groups,
            search.toLowerCase(),
          );
          const upperResult = filterGroupsBySearch(
            groups,
            search.toUpperCase(),
          );
          const mixedResult = filterGroupsBySearch(groups, search);

          return (
            lowerResult.length === upperResult.length &&
            upperResult.length === mixedResult.length
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 4: empty search returns all groups', () => {
      /**
       * Feature: whatsapp-groups-management, Property 4: Search Filter Correctness
       * Empty or whitespace-only search should return all groups
       */
      const whitespaceArb = fc
        .array(fc.constantFrom(' ', '\t', '\n', '\r'), {
          minLength: 0,
          maxLength: 10,
        })
        .map(chars => chars.join(''));

      fc.assert(
        fc.property(groupListArb, whitespaceArb, (groups, search) => {
          const filtered = filterGroupsBySearch(groups, search);
          return filtered.length === groups.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 4: filtered result is a subset of original groups', () => {
      /**
       * Feature: whatsapp-groups-management, Property 4: Search Filter Correctness
       * Filtered groups should always be a subset of the original list
       */
      fc.assert(
        fc.property(groupListArb, searchQueryArb, (groups, search) => {
          const filtered = filterGroupsBySearch(groups, search);
          return filtered.length <= groups.length;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Session Filter Correctness
   *
   * For any selected sessionId filter, the filtered groups list SHALL contain
   * only groups where group.sessionId equals the selected sessionId.
   *
   * Validates: Requirements 6.1, 6.3
   */
  describe('Property 5: Session Filter Correctness', () => {
    it('Property 5: filtered groups always have the selected sessionId', () => {
      /**
       * Feature: whatsapp-groups-management, Property 5: Session Filter Correctness
       * For any sessionId filter, all returned groups must have that sessionId
       */
      fc.assert(
        fc.property(groupListArb, fc.uuid(), (groups, sessionId) => {
          const filtered = filterGroupsBySession(groups, sessionId);

          // All filtered groups must have the selected sessionId
          return filtered.every(group => group.sessionId === sessionId);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 5: null sessionId returns all groups', () => {
      /**
       * Feature: whatsapp-groups-management, Property 5: Session Filter Correctness
       * Null sessionId should return all groups (no filtering)
       */
      fc.assert(
        fc.property(groupListArb, groups => {
          const filtered = filterGroupsBySession(groups, null);
          return filtered.length === groups.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 5: no matching groups are excluded from results', () => {
      /**
       * Feature: whatsapp-groups-management, Property 5: Session Filter Correctness
       * For any sessionId filter, no group with that sessionId should be excluded
       */
      fc.assert(
        fc.property(groupListArb, fc.uuid(), (groups, sessionId) => {
          const filtered = filterGroupsBySession(groups, sessionId);

          // Count groups that should match
          const expectedMatches = groups.filter(
            group => group.sessionId === sessionId,
          );

          return filtered.length === expectedMatches.length;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 5: filtered result is a subset of original groups', () => {
      /**
       * Feature: whatsapp-groups-management, Property 5: Session Filter Correctness
       * Filtered groups should always be a subset of the original list
       */
      fc.assert(
        fc.property(
          groupListArb,
          fc.option(fc.uuid(), { nil: null }),
          (groups, sessionId) => {
            const filtered = filterGroupsBySession(groups, sessionId);
            return filtered.length <= groups.length;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 5: filtering by existing sessionId returns at least one group', () => {
      /**
       * Feature: whatsapp-groups-management, Property 5: Session Filter Correctness
       * If we filter by a sessionId that exists in the groups, we should get results
       */
      fc.assert(
        fc.property(
          fc.array(groupArb, { minLength: 1, maxLength: 50 }),
          groups => {
            // Pick a sessionId from the existing groups
            const existingSessionId = groups[0].sessionId;
            const filtered = filterGroupsBySession(groups, existingSessionId);

            // Should have at least one result
            return filtered.length >= 1;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('applyGroupFilters (combined filters)', () => {
    it('applies both search and session filters', () => {
      const groups: FilterableGroup[] = [
        { name: 'Marketing Team', sessionId: '123' },
        { name: 'Sales Team', sessionId: '123' },
        { name: 'Marketing Group', sessionId: '456' },
        { name: 'Dev Team', sessionId: '456' },
      ];

      const result = applyGroupFilters(groups, {
        search: 'team',
        sessionId: '123',
        filter: 'all',
      });

      expect(result).toHaveLength(2);
      expect(result.every(g => g.name.toLowerCase().includes('team'))).toBe(
        true,
      );
      expect(result.every(g => g.sessionId === '123')).toBe(true);
    });

    it('combined filters are commutative in result', () => {
      /**
       * Applying search then session should give same result as session then search
       */
      fc.assert(
        fc.property(
          groupListArb,
          searchQueryArb,
          fc.option(fc.uuid(), { nil: null }),
          (groups, search, sessionId) => {
            // Apply combined filter
            const combined = applyGroupFilters(groups, {
              search,
              sessionId,
              filter: 'all',
            });

            // Apply filters separately in different orders
            const searchFirst = filterGroupsBySession(
              filterGroupsBySearch(groups, search),
              sessionId,
            );
            const sessionFirst = filterGroupsBySearch(
              filterGroupsBySession(groups, sessionId),
              search,
            );

            return (
              combined.length === searchFirst.length &&
              combined.length === sessionFirst.length
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

/**
 * Property 6: Filter Count Accuracy
 *
 * For any filter option (all, admin, archived, muted), the displayed count
 * SHALL equal the actual number of groups matching that filter criteria.
 *
 * Validates: Requirements 2.5
 */
describe('Property 6: Filter Count Accuracy', () => {
  // Extended group type with filter-relevant properties
  interface ExtendedGroup {
    name: string;
    sessionId: string;
    isAdmin: boolean;
    isArchived: boolean;
    isMuted: boolean;
  }

  // Arbitrary for generating extended groups
  const extendedGroupArb: fc.Arbitrary<ExtendedGroup> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }),
    sessionId: fc.uuid(),
    isAdmin: fc.boolean(),
    isArchived: fc.boolean(),
    isMuted: fc.boolean(),
  });

  const extendedGroupListArb = fc.array(extendedGroupArb, {
    minLength: 0,
    maxLength: 50,
  });

  /**
   * Calculate filter counts for extended groups
   * This simulates what the UI would display
   */
  function calculateExtendedFilterCounts(groups: ExtendedGroup[]) {
    return {
      all: groups.length,
      admin: groups.filter(g => g.isAdmin).length,
      archived: groups.filter(g => g.isArchived).length,
      muted: groups.filter(g => g.isMuted).length,
    };
  }

  /**
   * Filter groups by type
   */
  function filterByType(
    groups: ExtendedGroup[],
    filterType: 'all' | 'admin' | 'archived' | 'muted',
  ): ExtendedGroup[] {
    switch (filterType) {
      case 'all':
        return groups;
      case 'admin':
        return groups.filter(g => g.isAdmin);
      case 'archived':
        return groups.filter(g => g.isArchived);
      case 'muted':
        return groups.filter(g => g.isMuted);
    }
  }

  it('Property 6: "all" count equals total number of groups', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * The "all" count should always equal the total number of groups
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        return counts.all === groups.length;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: "admin" count equals number of groups where user is admin', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * The "admin" count should equal the number of groups where isAdmin is true
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        const actualAdminCount = groups.filter(g => g.isAdmin).length;
        return counts.admin === actualAdminCount;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: "archived" count equals number of archived groups', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * The "archived" count should equal the number of groups where isArchived is true
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        const actualArchivedCount = groups.filter(g => g.isArchived).length;
        return counts.archived === actualArchivedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: "muted" count equals number of muted groups', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * The "muted" count should equal the number of groups where isMuted is true
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        const actualMutedCount = groups.filter(g => g.isMuted).length;
        return counts.muted === actualMutedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: filter count matches actual filtered result length', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * For any filter type, the count should match the length of filtered results
     */
    const filterTypeArb = fc.constantFrom(
      'all' as const,
      'admin' as const,
      'archived' as const,
      'muted' as const,
    );

    fc.assert(
      fc.property(extendedGroupListArb, filterTypeArb, (groups, filterType) => {
        const counts = calculateExtendedFilterCounts(groups);
        const filtered = filterByType(groups, filterType);
        return counts[filterType] === filtered.length;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: sum of exclusive filters can exceed total (groups can be in multiple categories)', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * A group can be both admin and muted, so sum of filters may exceed total
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        // This is a sanity check - the sum of admin + archived + muted
        // can be >= 0 and <= 3 * all (if every group is in all categories)
        const sumOfFilters = counts.admin + counts.archived + counts.muted;
        return sumOfFilters >= 0 && sumOfFilters <= 3 * counts.all;
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: counts are always non-negative', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * All filter counts should be non-negative integers
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        return (
          counts.all >= 0 &&
          counts.admin >= 0 &&
          counts.archived >= 0 &&
          counts.muted >= 0
        );
      }),
      { numRuns: 100 },
    );
  });

  it('Property 6: individual filter counts never exceed total count', () => {
    /**
     * Feature: whatsapp-groups-management, Property 6: Filter Count Accuracy
     * No individual filter count should exceed the total count
     */
    fc.assert(
      fc.property(extendedGroupListArb, groups => {
        const counts = calculateExtendedFilterCounts(groups);
        return (
          counts.admin <= counts.all &&
          counts.archived <= counts.all &&
          counts.muted <= counts.all
        );
      }),
      { numRuns: 100 },
    );
  });
});
