/**
 * WhatsApp Groups Service Tests
 *
 * Property-based tests and unit tests for the WhatsApp Groups Service.
 * Uses fast-check for property-based testing.
 *
 * Feature: whatsapp-groups-api, Property 1: User Authorization
 * **Validates: Requirements 1.1, 2.3**
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import prisma from '@pharmabroker/db';
import { whatsappGroupsService } from './whatsapp-groups.service';

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestUser {
  id: string;
  email: string;
  name: string;
}

interface TestSession {
  id: string;
  name: string;
  userId: string;
}

interface TestGroup {
  id: string;
  jid: string;
  name: string;
  sessionId: string;
}

interface TestParticipant {
  id: string;
  jid: string;
  role: 'member' | 'admin' | 'superadmin';
  displayName: string | null;
  groupId: string;
}

// Store created test data for cleanup
const testUsers: TestUser[] = [];
const testSessions: TestSession[] = [];
const testGroups: TestGroup[] = [];
const testParticipants: TestParticipant[] = [];

async function createTestUser(suffix: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `test-${suffix}-${Date.now()}@example.com`,
      name: `Test User ${suffix}`,
    },
  });
  testUsers.push(user);
  return user;
}

async function createTestSession(
  userId: string,
  suffix: string,
  jid?: string,
): Promise<TestSession> {
  const session = await prisma.whatsAppSession.create({
    data: {
      id: crypto.randomUUID(),
      name: `Test Session ${suffix}`,
      userId,
      status: 'connected',
      jid: jid ?? null,
    },
  });
  testSessions.push(session);
  return session;
}

async function createTestGroup(
  sessionId: string,
  jid: string,
  name: string,
): Promise<TestGroup> {
  const group = await prisma.whatsAppGroup.create({
    data: {
      id: crypto.randomUUID(),
      jid,
      name,
      sessionId,
      memberCount: 0,
    },
  });
  testGroups.push(group);
  return group;
}

async function createTestParticipant(
  groupId: string,
  jid: string,
  role: 'member' | 'admin' | 'superadmin',
  displayName?: string,
): Promise<TestParticipant> {
  const participant = await prisma.whatsAppGroupParticipant.create({
    data: {
      id: crypto.randomUUID(),
      jid,
      role,
      displayName: displayName ?? null,
      groupId,
    },
  });
  testParticipants.push(participant);
  return participant;
}

async function cleanupTestData(): Promise<void> {
  // Delete in reverse order of dependencies
  if (testParticipants.length > 0) {
    await prisma.whatsAppGroupParticipant.deleteMany({
      where: { id: { in: testParticipants.map(p => p.id) } },
    });
    testParticipants.length = 0;
  }

  if (testGroups.length > 0) {
    await prisma.whatsAppGroup.deleteMany({
      where: { id: { in: testGroups.map(g => g.id) } },
    });
    testGroups.length = 0;
  }

  if (testSessions.length > 0) {
    await prisma.whatsAppSession.deleteMany({
      where: { id: { in: testSessions.map(s => s.id) } },
    });
    testSessions.length = 0;
  }

  if (testUsers.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: testUsers.map(u => u.id) } },
    });
    testUsers.length = 0;
  }
}

// Default filter input for tests
const defaultFilters = { filter: 'all' as const, limit: 50 };
const defaultParticipantFilters = { limit: 50 };

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('WhatsApp Groups Service - Property Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Feature: whatsapp-groups-api, Property 1: User Authorization
   *
   * *For any* user and any group query (list or get), all returned groups
   * SHALL belong to sessions owned by that user. No group from another
   * user's session shall ever be returned.
   *
   * **Validates: Requirements 1.1, 2.3**
   */
  describe('Property 1: User Authorization', () => {
    it('listGroups only returns groups from sessions owned by the requesting user', async () => {
      // Create two users with their own sessions and groups
      const user1 = await createTestUser('auth-1');
      const user2 = await createTestUser('auth-2');

      const session1 = await createTestSession(user1.id, 'auth-1');
      const session2 = await createTestSession(user2.id, 'auth-2');

      // Create groups for each user
      const group1 = await createTestGroup(
        session1.id,
        '1234567890@g.us',
        'User 1 Group',
      );
      const group2 = await createTestGroup(
        session2.id,
        '0987654321@g.us',
        'User 2 Group',
      );

      // Property: User 1 should only see their own groups
      const result1 = await whatsappGroupsService.listGroups(
        user1.id,
        defaultFilters,
      );
      expect(result1.groups.length).toBe(1);
      expect(result1.groups[0]?.id).toBe(group1.id);
      expect(result1.groups.every(g => g.sessionId === session1.id)).toBe(true);

      // Property: User 2 should only see their own groups
      const result2 = await whatsappGroupsService.listGroups(
        user2.id,
        defaultFilters,
      );
      expect(result2.groups.length).toBe(1);
      expect(result2.groups[0]?.id).toBe(group2.id);
      expect(result2.groups.every(g => g.sessionId === session2.id)).toBe(true);
    });

    it('getGroup returns GROUP_NOT_FOUND for groups belonging to other users', async () => {
      // Create two users
      const user1 = await createTestUser('get-auth-1');
      const user2 = await createTestUser('get-auth-2');

      const session1 = await createTestSession(user1.id, 'get-auth-1');

      // Create a group owned by user1
      const group = await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'User 1 Private Group',
      );

      // User1 can access their own group
      const result = await whatsappGroupsService.getGroup(user1.id, group.id);
      expect(result.id).toBe(group.id);

      // User2 cannot access user1's group
      try {
        await whatsappGroupsService.getGroup(user2.id, group.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });

    it('property: for any number of users and groups, each user only sees their own groups', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }), // Number of users
          fc.integer({ min: 1, max: 3 }), // Groups per user
          async (numUsers, groupsPerUser) => {
            // Create users with sessions and groups
            const users: Array<{
              user: TestUser;
              session: TestSession;
              groups: TestGroup[];
            }> = [];

            for (let i = 0; i < numUsers; i++) {
              const user = await createTestUser(`prop-${i}-${Date.now()}`);
              const session = await createTestSession(
                user.id,
                `prop-${i}-${Date.now()}`,
              );
              const groups: TestGroup[] = [];

              for (let j = 0; j < groupsPerUser; j++) {
                const jid = `${Date.now()}${i}${j}@g.us`;
                const group = await createTestGroup(
                  session.id,
                  jid,
                  `Group ${i}-${j}`,
                );
                groups.push(group);
              }

              users.push({ user, session, groups });
            }

            // Verify each user only sees their own groups
            for (const { user, session, groups } of users) {
              const result = await whatsappGroupsService.listGroups(
                user.id,
                defaultFilters,
              );

              // Should have exactly the number of groups created for this user
              expect(result.groups.length).toBe(groups.length);

              // All returned groups should belong to this user's session
              for (const returnedGroup of result.groups) {
                expect(returnedGroup.sessionId).toBe(session.id);
              }

              // All created groups should be in the result
              const returnedIds = new Set(result.groups.map(g => g.id));
              for (const group of groups) {
                expect(returnedIds.has(group.id)).toBe(true);
              }
            }

            return true;
          },
        ),
        { numRuns: 10 }, // Reduced runs due to database operations
      );
    });

    it('property: listParticipants returns GROUP_NOT_FOUND for unauthorized access', async () => {
      // Create two users
      const user1 = await createTestUser('part-auth-1');
      const user2 = await createTestUser('part-auth-2');

      const session1 = await createTestSession(user1.id, 'part-auth-1');

      // Create a group with participants owned by user1
      const group = await createTestGroup(
        session1.id,
        '2222222222@g.us',
        'User 1 Group with Participants',
      );

      // Add a participant
      await prisma.whatsAppGroupParticipant.create({
        data: {
          id: crypto.randomUUID(),
          jid: '3333333333@s.whatsapp.net',
          role: 'member',
          groupId: group.id,
        },
      });

      // User1 can list participants
      const result = await whatsappGroupsService.listParticipants(user1.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
      });
      expect(result.participants.length).toBe(1);

      // User2 cannot list participants of user1's group
      try {
        await whatsappGroupsService.listParticipants(user2.id, {
          groupId: group.id,
          ...defaultParticipantFilters,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 2: Session Filter Correctness
   *
   * *For any* groups list query with a sessionId filter, all returned groups
   * SHALL have a sessionId matching the filter value exactly.
   *
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Session Filter Correctness', () => {
    it('listGroups with sessionId filter returns only groups from that session', async () => {
      const user = await createTestUser('session-filter-1');
      const session1 = await createTestSession(user.id, 'session-filter-1a');
      const session2 = await createTestSession(user.id, 'session-filter-1b');

      // Create groups in both sessions
      const group1 = await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'Session 1 Group',
      );
      const group2 = await createTestGroup(
        session2.id,
        '2222222222@g.us',
        'Session 2 Group',
      );

      // Filter by session1
      const result1 = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        sessionId: session1.id,
      });
      expect(result1.groups.length).toBe(1);
      expect(result1.groups[0]?.id).toBe(group1.id);
      expect(result1.groups.every(g => g.sessionId === session1.id)).toBe(true);

      // Filter by session2
      const result2 = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        sessionId: session2.id,
      });
      expect(result2.groups.length).toBe(1);
      expect(result2.groups[0]?.id).toBe(group2.id);
      expect(result2.groups.every(g => g.sessionId === session2.id)).toBe(true);
    });

    it('property: for any session filter, all returned groups have matching sessionId', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 4 }), // Number of sessions
          fc.integer({ min: 1, max: 3 }), // Groups per session
          async (numSessions, groupsPerSession) => {
            const user = await createTestUser(`sf-prop-${Date.now()}`);
            const sessions: TestSession[] = [];
            const groupsBySession: Map<string, TestGroup[]> = new Map();

            // Create sessions and groups
            for (let i = 0; i < numSessions; i++) {
              const session = await createTestSession(
                user.id,
                `sf-prop-${i}-${Date.now()}`,
              );
              sessions.push(session);
              groupsBySession.set(session.id, []);

              for (let j = 0; j < groupsPerSession; j++) {
                const group = await createTestGroup(
                  session.id,
                  `${Date.now()}${i}${j}@g.us`,
                  `Group ${i}-${j}`,
                );
                groupsBySession.get(session.id)!.push(group);
              }
            }

            // Test filter for each session
            for (const session of sessions) {
              const result = await whatsappGroupsService.listGroups(user.id, {
                ...defaultFilters,
                sessionId: session.id,
              });

              // All returned groups should belong to the filtered session
              for (const group of result.groups) {
                expect(group.sessionId).toBe(session.id);
              }

              // Should return exactly the groups created for this session
              expect(result.groups.length).toBe(groupsPerSession);
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 3: Search Filter Correctness
   *
   * *For any* groups or participants list query with a search term, all returned
   * items SHALL contain the search term in their searchable fields (name for groups;
   * displayName or JID for participants), case-insensitively.
   *
   * **Validates: Requirements 1.3, 3.3**
   */
  describe('Property 3: Search Filter Correctness', () => {
    it('listGroups with search filter returns only groups with matching names', async () => {
      const user = await createTestUser('search-filter-1');
      const session = await createTestSession(user.id, 'search-filter-1');

      // Create groups with different names
      await createTestGroup(session.id, '1111111111@g.us', 'Alpha Team');
      await createTestGroup(session.id, '2222222222@g.us', 'Beta Squad');
      await createTestGroup(session.id, '3333333333@g.us', 'ALPHA Force');

      // Search for "alpha" (case-insensitive)
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        search: 'alpha',
      });

      expect(result.groups.length).toBe(2);
      for (const group of result.groups) {
        expect(group.name.toLowerCase()).toContain('alpha');
      }
    });

    it('listParticipants with search filter returns only matching participants', async () => {
      const user = await createTestUser('search-part-1');
      const session = await createTestSession(user.id, 'search-part-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create participants with different names and JIDs
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'member',
        'John Doe',
      );
      await createTestParticipant(
        group.id,
        '2222222222@s.whatsapp.net',
        'member',
        'Jane Smith',
      );
      await createTestParticipant(
        group.id,
        '3333333333@s.whatsapp.net',
        'admin',
        'Johnny Admin',
      );

      // Search for "john" (case-insensitive)
      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
        search: 'john',
      });

      expect(result.participants.length).toBe(2);
      for (const participant of result.participants) {
        const matchesName =
          participant.displayName?.toLowerCase().includes('john') ?? false;
        const matchesJid = participant.jid.toLowerCase().includes('john');
        expect(matchesName || matchesJid).toBe(true);
      }
    });

    it('property: for any search term, all returned groups contain the term in name', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 3, maxLength: 20 }), {
            minLength: 3,
            maxLength: 5,
          }),
          async groupNames => {
            const user = await createTestUser(`search-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `search-prop-${Date.now()}`,
            );

            // Create groups with the generated names
            for (let i = 0; i < groupNames.length; i++) {
              await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                groupNames[i] ?? `Group ${i}`,
              );
            }

            // Pick a search term from one of the names (first 3 chars)
            const searchTerm = (groupNames[0] ?? 'test').substring(0, 3);

            const result = await whatsappGroupsService.listGroups(user.id, {
              ...defaultFilters,
              search: searchTerm,
            });

            // All returned groups should contain the search term
            for (const group of result.groups) {
              expect(group.name.toLowerCase()).toContain(
                searchTerm.toLowerCase(),
              );
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 4: Admin Filter Correctness
   *
   * *For any* groups list query with the 'admin' filter, all returned groups
   * SHALL have at least one participant with role 'admin' or 'superadmin'
   * where the participant JID matches the session's JID.
   *
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: Admin Filter Correctness', () => {
    it('listGroups with admin filter returns only groups where user is admin', async () => {
      const user = await createTestUser('admin-filter-1');
      // Session JID is the user's WhatsApp number - must match participant JID
      const sessionJid = '5551234567890@s.whatsapp.net';
      const session = await createTestSession(
        user.id,
        'admin-filter-1',
        sessionJid,
      );

      // Create groups with different participant roles
      const adminGroup = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Admin Group',
      );
      const memberGroup = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Member Group',
      );
      const superadminGroup = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Superadmin Group',
      );

      // Add the session owner as participant with different roles in each group
      // The session JID (5551234567890) must match the participant JID
      await createTestParticipant(
        adminGroup.id,
        '5551234567890@s.whatsapp.net', // Matches session JID - admin
        'admin',
      );
      await createTestParticipant(
        memberGroup.id,
        '5551234567890@s.whatsapp.net', // Matches session JID - but only member
        'member',
      );
      await createTestParticipant(
        superadminGroup.id,
        '5551234567890@s.whatsapp.net', // Matches session JID - superadmin
        'superadmin',
      );

      // Filter by admin
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        filter: 'admin',
      });

      // Should return only groups where the session owner is admin or superadmin
      expect(result.groups.length).toBe(2);
      const groupIds = result.groups.map(g => g.id);
      expect(groupIds).toContain(adminGroup.id);
      expect(groupIds).toContain(superadminGroup.id);
      expect(groupIds).not.toContain(memberGroup.id);
    });

    it('property: for admin filter, all returned groups have admin/superadmin participant matching session JID', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Number of groups
          async numGroups => {
            const user = await createTestUser(`admin-prop-${Date.now()}`);
            // Session needs a JID to match against participants
            const sessionJid = `${Date.now()}@s.whatsapp.net`;
            const session = await createTestSession(
              user.id,
              `admin-prop-${Date.now()}`,
              sessionJid,
            );

            const roles: Array<'member' | 'admin' | 'superadmin'> = [
              'member',
              'admin',
              'superadmin',
            ];

            // Create groups with the session owner as participant with different roles
            for (let i = 0; i < numGroups; i++) {
              const group = await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
              // Assign a random role to the session owner
              const role = roles[i % roles.length]!;
              await createTestParticipant(
                group.id,
                sessionJid, // Use session JID so it matches
                role,
              );
            }

            // Filter by admin
            const result = await whatsappGroupsService.listGroups(user.id, {
              ...defaultFilters,
              filter: 'admin',
            });

            // Verify all returned groups have the session owner as admin or superadmin
            for (const group of result.groups) {
              const participants =
                await prisma.whatsAppGroupParticipant.findMany({
                  where: { groupId: group.id },
                });
              // Find participant matching session JID
              const sessionJidBase = sessionJid.split(':')[0] ?? sessionJid;
              const sessionParticipant = participants.find(p =>
                p.jid.startsWith(sessionJidBase),
              );
              expect(sessionParticipant).toBeDefined();
              expect(
                sessionParticipant?.role === 'admin' ||
                  sessionParticipant?.role === 'superadmin',
              ).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 5: Role Filter Correctness
   *
   * *For any* participants list query with a role filter, all returned
   * participants SHALL have a role matching the filter value exactly.
   *
   * **Validates: Requirements 3.2**
   */
  describe('Property 5: Role Filter Correctness', () => {
    it('listParticipants with role filter returns only matching participants', async () => {
      const user = await createTestUser('role-filter-1');
      const session = await createTestSession(user.id, 'role-filter-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create participants with different roles
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'member',
      );
      await createTestParticipant(
        group.id,
        '2222222222@s.whatsapp.net',
        'admin',
      );
      await createTestParticipant(
        group.id,
        '3333333333@s.whatsapp.net',
        'superadmin',
      );
      await createTestParticipant(
        group.id,
        '4444444444@s.whatsapp.net',
        'member',
      );

      // Filter by admin role
      const adminResult = await whatsappGroupsService.listParticipants(
        user.id,
        {
          groupId: group.id,
          ...defaultParticipantFilters,
          role: 'admin',
        },
      );
      expect(adminResult.participants.length).toBe(1);
      expect(adminResult.participants.every(p => p.role === 'admin')).toBe(
        true,
      );

      // Filter by member role
      const memberResult = await whatsappGroupsService.listParticipants(
        user.id,
        {
          groupId: group.id,
          ...defaultParticipantFilters,
          role: 'member',
        },
      );
      expect(memberResult.participants.length).toBe(2);
      expect(memberResult.participants.every(p => p.role === 'member')).toBe(
        true,
      );

      // Filter by superadmin role
      const superadminResult = await whatsappGroupsService.listParticipants(
        user.id,
        {
          groupId: group.id,
          ...defaultParticipantFilters,
          role: 'superadmin',
        },
      );
      expect(superadminResult.participants.length).toBe(1);
      expect(
        superadminResult.participants.every(p => p.role === 'superadmin'),
      ).toBe(true);
    });

    it('property: for any role filter, all returned participants have matching role', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('member', 'admin', 'superadmin') as fc.Arbitrary<
            'member' | 'admin' | 'superadmin'
          >,
          fc.integer({ min: 3, max: 6 }), // Number of participants
          async (filterRole, numParticipants) => {
            const user = await createTestUser(`role-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `role-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const roles: Array<'member' | 'admin' | 'superadmin'> = [
              'member',
              'admin',
              'superadmin',
            ];

            // Create participants with various roles
            for (let i = 0; i < numParticipants; i++) {
              const role = roles[i % roles.length]!;
              await createTestParticipant(
                group.id,
                `${Date.now()}${i}@s.whatsapp.net`,
                role,
              );
            }

            // Filter by the specified role
            const result = await whatsappGroupsService.listParticipants(
              user.id,
              {
                groupId: group.id,
                ...defaultParticipantFilters,
                role: filterRole,
              },
            );

            // All returned participants should have the filtered role
            for (const participant of result.participants) {
              expect(participant.role).toBe(filterRole);
            }

            return true;
          },
        ),
        { numRuns: 15 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 6: Pagination Completeness
   *
   * *For any* paginated query, iterating through all pages using the nextCursor
   * SHALL return all items exactly once with no duplicates and no missing items.
   *
   * **Validates: Requirements 1.5, 3.1, 8.2**
   */
  describe('Property 6: Pagination Completeness', () => {
    it('listGroups pagination returns all groups exactly once', async () => {
      const user = await createTestUser('pagination-1');
      const session = await createTestSession(user.id, 'pagination-1');

      // Create 7 groups
      const createdGroups: TestGroup[] = [];
      for (let i = 0; i < 7; i++) {
        const group = await createTestGroup(
          session.id,
          `${Date.now()}${i}@g.us`,
          `Group ${i}`,
        );
        createdGroups.push(group);
      }

      // Paginate with limit of 3
      const allGroups: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 3,
          cursor,
        });

        for (const group of result.groups) {
          allGroups.push(group.id);
        }

        cursor = result.nextCursor;
      } while (cursor);

      // Should have all 7 groups
      expect(allGroups.length).toBe(7);

      // No duplicates
      const uniqueIds = new Set(allGroups);
      expect(uniqueIds.size).toBe(7);

      // All created groups should be present
      for (const group of createdGroups) {
        expect(uniqueIds.has(group.id)).toBe(true);
      }
    });

    it('listParticipants pagination returns all participants exactly once', async () => {
      const user = await createTestUser('pagination-part-1');
      const session = await createTestSession(user.id, 'pagination-part-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create 8 participants
      const createdParticipants: TestParticipant[] = [];
      const roles: Array<'member' | 'admin' | 'superadmin'> = [
        'member',
        'admin',
        'superadmin',
      ];
      for (let i = 0; i < 8; i++) {
        const participant = await createTestParticipant(
          group.id,
          `${Date.now()}${i}@s.whatsapp.net`,
          roles[i % roles.length]!,
          `Participant ${i}`,
        );
        createdParticipants.push(participant);
      }

      // Paginate with limit of 3
      const allParticipants: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await whatsappGroupsService.listParticipants(user.id, {
          groupId: group.id,
          limit: 3,
          cursor,
        });

        for (const participant of result.participants) {
          allParticipants.push(participant.id);
        }

        cursor = result.nextCursor;
      } while (cursor);

      // Should have all 8 participants
      expect(allParticipants.length).toBe(8);

      // No duplicates
      const uniqueIds = new Set(allParticipants);
      expect(uniqueIds.size).toBe(8);

      // All created participants should be present
      for (const participant of createdParticipants) {
        expect(uniqueIds.has(participant.id)).toBe(true);
      }
    });

    it('property: for any number of groups, pagination returns all items exactly once', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 15 }), // Number of groups
          fc.integer({ min: 2, max: 5 }), // Page size
          async (numGroups, pageSize) => {
            const user = await createTestUser(`pag-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `pag-prop-${Date.now()}`,
            );

            // Create groups
            const createdIds: string[] = [];
            for (let i = 0; i < numGroups; i++) {
              const group = await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
              createdIds.push(group.id);
            }

            // Paginate through all groups
            const allIds: string[] = [];
            let cursor: string | undefined;

            do {
              const result = await whatsappGroupsService.listGroups(user.id, {
                filter: 'all',
                limit: pageSize,
                cursor,
              });

              for (const group of result.groups) {
                allIds.push(group.id);
              }

              cursor = result.nextCursor;
            } while (cursor);

            // Should have all groups
            expect(allIds.length).toBe(numGroups);

            // No duplicates
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(numGroups);

            // All created groups should be present
            for (const id of createdIds) {
              expect(uniqueIds.has(id)).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 7: Response Schema Conformance
   *
   * *For any* API response (groups list, group detail, participants list),
   * the response SHALL conform to the corresponding Zod schema with all
   * required fields present and dates serialized as ISO 8601 strings.
   *
   * **Validates: Requirements 1.6, 3.4, 6.4, 8.4**
   */
  describe('Property 7: Response Schema Conformance', () => {
    it('listGroups response contains all required fields', async () => {
      const user = await createTestUser('schema-1');
      const session = await createTestSession(user.id, 'schema-1');
      await createTestGroup(session.id, '1111111111@g.us', 'Test Group');

      const result = await whatsappGroupsService.listGroups(
        user.id,
        defaultFilters,
      );

      // Response should have groups array and optional nextCursor
      expect(Array.isArray(result.groups)).toBe(true);
      expect(
        result.nextCursor === undefined ||
          typeof result.nextCursor === 'string',
      ).toBe(true);

      // Each group should have required fields
      for (const group of result.groups) {
        expect(typeof group.id).toBe('string');
        expect(typeof group.jid).toBe('string');
        expect(typeof group.name).toBe('string');
        expect(typeof group.sessionId).toBe('string');
        expect(typeof group.memberCount).toBe('number');
        expect(group.createdAt instanceof Date).toBe(true);
        expect(group.updatedAt instanceof Date).toBe(true);
      }
    });

    it('getGroup response contains all required fields including participants', async () => {
      const user = await createTestUser('schema-2');
      const session = await createTestSession(user.id, 'schema-2');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'admin',
        'Admin User',
      );

      const result = await whatsappGroupsService.getGroup(user.id, group.id);

      // Group should have required fields
      expect(typeof result.id).toBe('string');
      expect(typeof result.jid).toBe('string');
      expect(typeof result.name).toBe('string');
      expect(typeof result.sessionId).toBe('string');
      expect(typeof result.memberCount).toBe('number');
      expect(result.createdAt instanceof Date).toBe(true);
      expect(result.updatedAt instanceof Date).toBe(true);

      // Should have participants array
      expect(Array.isArray(result.participants)).toBe(true);

      // Each participant should have required fields
      for (const participant of result.participants) {
        expect(typeof participant.id).toBe('string');
        expect(typeof participant.jid).toBe('string');
        expect(['member', 'admin', 'superadmin']).toContain(participant.role);
        expect(typeof participant.groupId).toBe('string');
        expect(participant.joinedAt instanceof Date).toBe(true);
        expect(participant.updatedAt instanceof Date).toBe(true);
      }
    });

    it('listParticipants response contains all required fields', async () => {
      const user = await createTestUser('schema-3');
      const session = await createTestSession(user.id, 'schema-3');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'member',
        'Test User',
      );

      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
      });

      // Response should have participants array and optional nextCursor
      expect(Array.isArray(result.participants)).toBe(true);
      expect(
        result.nextCursor === undefined ||
          typeof result.nextCursor === 'string',
      ).toBe(true);

      // Each participant should have required fields
      for (const participant of result.participants) {
        expect(typeof participant.id).toBe('string');
        expect(typeof participant.jid).toBe('string');
        expect(['member', 'admin', 'superadmin']).toContain(participant.role);
        expect(typeof participant.groupId).toBe('string');
        expect(participant.joinedAt instanceof Date).toBe(true);
        expect(participant.updatedAt instanceof Date).toBe(true);
      }
    });

    it('property: for any groups, response always has required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // Number of groups
          async numGroups => {
            const user = await createTestUser(`schema-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `schema-prop-${Date.now()}`,
            );

            // Create groups
            for (let i = 0; i < numGroups; i++) {
              await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
            }

            const result = await whatsappGroupsService.listGroups(
              user.id,
              defaultFilters,
            );

            // Verify response structure
            expect(Array.isArray(result.groups)).toBe(true);
            expect(result.groups.length).toBe(numGroups);

            // Verify each group has required fields
            for (const group of result.groups) {
              expect(typeof group.id).toBe('string');
              expect(typeof group.jid).toBe('string');
              expect(typeof group.name).toBe('string');
              expect(typeof group.sessionId).toBe('string');
              expect(typeof group.memberCount).toBe('number');
              expect(group.createdAt instanceof Date).toBe(true);
              expect(group.updatedAt instanceof Date).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 8: Participant Ordering
   *
   * *For any* group detail or participants list response, participants SHALL
   * be ordered by role priority. The ordering is based on the enum definition
   * in the database: member < admin < superadmin (ascending order).
   *
   * **Validates: Requirements 2.4**
   */
  describe('Property 8: Participant Ordering', () => {
    it('getGroup returns participants ordered by role', async () => {
      const user = await createTestUser('ordering-1');
      const session = await createTestSession(user.id, 'ordering-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create participants in random order
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'superadmin',
        'Superadmin User',
      );
      await createTestParticipant(
        group.id,
        '2222222222@s.whatsapp.net',
        'member',
        'Member User',
      );
      await createTestParticipant(
        group.id,
        '3333333333@s.whatsapp.net',
        'admin',
        'Admin User',
      );

      const result = await whatsappGroupsService.getGroup(user.id, group.id);

      // Verify ordering: enum order is member < admin < superadmin
      const roles = result.participants.map(p => p.role);
      // The expected order based on enum definition
      const expectedOrder = ['member', 'admin', 'superadmin'];

      // Verify roles appear in the expected order (filtering to only roles present)
      let lastIndex = -1;
      for (const role of roles) {
        const currentIndex = expectedOrder.indexOf(role);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      }
    });

    it('listParticipants returns participants ordered by role', async () => {
      const user = await createTestUser('ordering-2');
      const session = await createTestSession(user.id, 'ordering-2');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create participants in random order
      await createTestParticipant(
        group.id,
        '1111111111@s.whatsapp.net',
        'superadmin',
        'Superadmin User',
      );
      await createTestParticipant(
        group.id,
        '2222222222@s.whatsapp.net',
        'member',
        'Member User',
      );
      await createTestParticipant(
        group.id,
        '3333333333@s.whatsapp.net',
        'admin',
        'Admin User',
      );

      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
      });

      // Verify ordering: enum order is member < admin < superadmin
      const roles = result.participants.map(p => p.role);
      const expectedOrder = ['member', 'admin', 'superadmin'];

      // Verify roles appear in the expected order
      let lastIndex = -1;
      for (const role of roles) {
        const currentIndex = expectedOrder.indexOf(role);
        expect(currentIndex).toBeGreaterThanOrEqual(lastIndex);
        lastIndex = currentIndex;
      }
    });

    it('property: for any participants, they are always ordered by role enum order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }), // Number of participants
          async numParticipants => {
            const user = await createTestUser(`order-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `order-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const roles: Array<'member' | 'admin' | 'superadmin'> = [
              'member',
              'admin',
              'superadmin',
            ];

            // Create participants with various roles
            for (let i = 0; i < numParticipants; i++) {
              const role = roles[i % roles.length]!;
              await createTestParticipant(
                group.id,
                `${Date.now()}${i}@s.whatsapp.net`,
                role,
                `Participant ${i}`,
              );
            }

            const result = await whatsappGroupsService.listParticipants(
              user.id,
              {
                groupId: group.id,
                ...defaultParticipantFilters,
              },
            );

            // Verify ordering: enum order is member < admin < superadmin
            const expectedOrder = ['member', 'admin', 'superadmin'];
            const returnedRoles = result.participants.map(p => p.role);

            // Verify roles appear in non-decreasing order according to enum
            let lastIndex = -1;
            for (const role of returnedRoles) {
              const currentIndex = expectedOrder.indexOf(role);
              expect(currentIndex).toBeGreaterThanOrEqual(lastIndex);
              lastIndex = currentIndex;
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api, Property 10: Input Validation
   *
   * *For any* invalid input (malformed UUIDs, out-of-range limits, invalid
   * filter values), the API SHALL reject the request with a validation error
   * before processing.
   *
   * **Validates: Requirements 6.1**
   */
  describe('Property 10: Input Validation', () => {
    it('getGroup rejects invalid group ID format', async () => {
      const user = await createTestUser('validation-1');

      // Invalid UUID should throw GROUP_NOT_FOUND (since it won't match any group)
      try {
        await whatsappGroupsService.getGroup(user.id, 'invalid-uuid');
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });

    it('listParticipants rejects invalid group ID', async () => {
      const user = await createTestUser('validation-2');

      try {
        await whatsappGroupsService.listParticipants(user.id, {
          groupId: 'invalid-uuid',
          ...defaultParticipantFilters,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });

    it('listGroups handles empty results gracefully', async () => {
      const user = await createTestUser('validation-3');

      // User with no sessions/groups should get empty result
      const result = await whatsappGroupsService.listGroups(
        user.id,
        defaultFilters,
      );

      expect(result.groups).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('property: for any non-existent group ID, getGroup returns GROUP_NOT_FOUND', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async randomUuid => {
          const user = await createTestUser(`val-prop-${Date.now()}`);

          try {
            await whatsappGroupsService.getGroup(user.id, randomUuid);
            // If no error, the UUID happened to match an existing group (very unlikely)
            return true;
          } catch (error: unknown) {
            expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
            return true;
          }
        }),
        { numRuns: 10 },
      );
    });
  });
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('WhatsApp Groups Service - Unit Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Unit tests for listGroups with various filter combinations
   * **Validates: Requirements 2.2**
   */
  describe('listGroups - Filter Combinations', () => {
    it('returns groups filtered by sessionId and search term combined', async () => {
      const user = await createTestUser('combo-filter-1');
      const session1 = await createTestSession(user.id, 'combo-filter-1a');
      const session2 = await createTestSession(user.id, 'combo-filter-1b');

      // Create groups in both sessions with different names
      await createTestGroup(session1.id, '1111111111@g.us', 'Alpha Team');
      await createTestGroup(session1.id, '2222222222@g.us', 'Beta Squad');
      await createTestGroup(session2.id, '3333333333@g.us', 'Alpha Force');

      // Filter by session1 AND search for "alpha"
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        sessionId: session1.id,
        search: 'alpha',
      });

      expect(result.groups.length).toBe(1);
      expect(result.groups[0]?.name).toBe('Alpha Team');
      expect(result.groups[0]?.sessionId).toBe(session1.id);
    });

    it('returns groups filtered by admin filter and search term combined', async () => {
      const user = await createTestUser('combo-filter-2');
      // Session needs a JID to match against participants for admin filter
      const sessionJid = '5559876543210@s.whatsapp.net';
      const session = await createTestSession(
        user.id,
        'combo-filter-2',
        sessionJid,
      );

      // Create groups with different names and roles
      const adminGroup = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Alpha Admins',
      );
      const memberGroup = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Alpha Members',
      );
      const otherAdminGroup = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Beta Admins',
      );

      // Add session owner as participant with different roles
      await createTestParticipant(
        adminGroup.id,
        sessionJid, // Session owner is admin here
        'admin',
      );
      await createTestParticipant(
        memberGroup.id,
        sessionJid, // Session owner is only member here
        'member',
      );
      await createTestParticipant(
        otherAdminGroup.id,
        sessionJid, // Session owner is admin here
        'admin',
      );

      // Filter by admin AND search for "alpha"
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        filter: 'admin',
        search: 'alpha',
      });

      expect(result.groups.length).toBe(1);
      expect(result.groups[0]?.name).toBe('Alpha Admins');
    });

    it('returns empty array when no groups match combined filters', async () => {
      const user = await createTestUser('combo-filter-3');
      const session = await createTestSession(user.id, 'combo-filter-3');

      await createTestGroup(session.id, '1111111111@g.us', 'Test Group');

      // Search for non-existent term
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        search: 'nonexistent',
      });

      expect(result.groups).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('handles limit of 1 correctly', async () => {
      const user = await createTestUser('limit-1');
      const session = await createTestSession(user.id, 'limit-1');

      await createTestGroup(session.id, '1111111111@g.us', 'Group 1');
      await createTestGroup(session.id, '2222222222@g.us', 'Group 2');

      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        limit: 1,
      });

      expect(result.groups.length).toBe(1);
      expect(result.nextCursor).toBeDefined();
    });
  });

  /**
   * Unit tests for getGroup authorization and not found cases
   * **Validates: Requirements 2.2**
   */
  describe('getGroup - Authorization and Not Found', () => {
    it('returns group with all participants when authorized', async () => {
      const user = await createTestUser('get-auth-1');
      const session = await createTestSession(user.id, 'get-auth-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      await createTestParticipant(
        group.id,
        '1111@s.whatsapp.net',
        'admin',
        'Admin',
      );
      await createTestParticipant(
        group.id,
        '2222@s.whatsapp.net',
        'member',
        'Member',
      );

      const result = await whatsappGroupsService.getGroup(user.id, group.id);

      expect(result.id).toBe(group.id);
      expect(result.name).toBe('Test Group');
      expect(result.participants.length).toBe(2);
    });

    it('throws GROUP_NOT_FOUND for non-existent group', async () => {
      const user = await createTestUser('get-notfound-1');
      const nonExistentId = crypto.randomUUID();

      try {
        await whatsappGroupsService.getGroup(user.id, nonExistentId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });

    it('throws GROUP_NOT_FOUND when accessing another user group', async () => {
      const user1 = await createTestUser('get-unauth-1');
      const user2 = await createTestUser('get-unauth-2');
      const session1 = await createTestSession(user1.id, 'get-unauth-1');
      const group = await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'User 1 Group',
      );

      try {
        await whatsappGroupsService.getGroup(user2.id, group.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });

    it('returns group with empty participants array when no participants exist', async () => {
      const user = await createTestUser('get-empty-1');
      const session = await createTestSession(user.id, 'get-empty-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Empty Group',
      );

      const result = await whatsappGroupsService.getGroup(user.id, group.id);

      expect(result.id).toBe(group.id);
      expect(result.participants).toEqual([]);
    });
  });

  /**
   * Unit tests for listParticipants with filters
   * **Validates: Requirements 2.2**
   */
  describe('listParticipants - Filters', () => {
    it('returns participants filtered by role and search combined', async () => {
      const user = await createTestUser('part-combo-1');
      const session = await createTestSession(user.id, 'part-combo-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      await createTestParticipant(
        group.id,
        '1111@s.whatsapp.net',
        'admin',
        'John Admin',
      );
      await createTestParticipant(
        group.id,
        '2222@s.whatsapp.net',
        'admin',
        'Jane Admin',
      );
      await createTestParticipant(
        group.id,
        '3333@s.whatsapp.net',
        'member',
        'John Member',
      );

      // Filter by admin role AND search for "john"
      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
        role: 'admin',
        search: 'john',
      });

      expect(result.participants.length).toBe(1);
      expect(result.participants[0]?.displayName).toBe('John Admin');
      expect(result.participants[0]?.role).toBe('admin');
    });

    it('searches by JID when displayName does not match', async () => {
      const user = await createTestUser('part-jid-1');
      const session = await createTestSession(user.id, 'part-jid-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      await createTestParticipant(
        group.id,
        '5551234567@s.whatsapp.net',
        'member',
        'User One',
      );
      await createTestParticipant(
        group.id,
        '5559876543@s.whatsapp.net',
        'member',
        'User Two',
      );

      // Search by JID
      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
        search: '1234567',
      });

      expect(result.participants.length).toBe(1);
      expect(result.participants[0]?.jid).toContain('1234567');
    });

    it('returns empty array when no participants match filters', async () => {
      const user = await createTestUser('part-empty-1');
      const session = await createTestSession(user.id, 'part-empty-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      await createTestParticipant(
        group.id,
        '1111@s.whatsapp.net',
        'member',
        'Test User',
      );

      // Filter by superadmin role (none exist)
      const result = await whatsappGroupsService.listParticipants(user.id, {
        groupId: group.id,
        ...defaultParticipantFilters,
        role: 'superadmin',
      });

      expect(result.participants).toEqual([]);
      expect(result.nextCursor).toBeUndefined();
    });

    it('throws GROUP_NOT_FOUND when listing participants for unauthorized group', async () => {
      const user1 = await createTestUser('part-unauth-1');
      const user2 = await createTestUser('part-unauth-2');
      const session1 = await createTestSession(user1.id, 'part-unauth-1');
      const group = await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'User 1 Group',
      );

      try {
        await whatsappGroupsService.listParticipants(user2.id, {
          groupId: group.id,
          ...defaultParticipantFilters,
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
      }
    });
  });

  /**
   * Unit tests for syncGroups error handling
   * **Validates: Requirements 4.2, 4.5, 7.1, 7.2**
   */
  describe('syncGroups - Error Handling', () => {
    it('throws SESSION_NOT_FOUND when session does not exist', async () => {
      const user = await createTestUser('sync-notfound-1');
      const nonExistentSessionId = crypto.randomUUID();

      try {
        await whatsappGroupsService.syncGroups(user.id, nonExistentSessionId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('throws SESSION_NOT_FOUND when session belongs to another user', async () => {
      const user1 = await createTestUser('sync-unauth-1');
      const user2 = await createTestUser('sync-unauth-2');
      const session1 = await createTestSession(user1.id, 'sync-unauth-1');

      try {
        await whatsappGroupsService.syncGroups(user2.id, session1.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('throws SESSION_NOT_CONNECTED when session is not connected', async () => {
      const user = await createTestUser('sync-disconnected-1');

      // Create a disconnected session
      const session = await prisma.whatsAppSession.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Disconnected Session',
          userId: user.id,
          status: 'disconnected',
        },
      });
      testSessions.push(session);

      try {
        await whatsappGroupsService.syncGroups(user.id, session.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_CONNECTED');
      }
    });

    it('throws SESSION_NOT_CONNECTED when session is pending', async () => {
      const user = await createTestUser('sync-pending-1');

      // Create a pending session
      const session = await prisma.whatsAppSession.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Pending Session',
          userId: user.id,
          status: 'pending',
        },
      });
      testSessions.push(session);

      try {
        await whatsappGroupsService.syncGroups(user.id, session.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_CONNECTED');
      }
    });
  });

  /**
   * Feature: whatsapp-groups-filter-counts, Property 1: Filter Counts Accuracy
   *
   * *For any* set of groups belonging to a user, the filter counts returned by the API
   * SHALL equal the actual count of groups matching each filter criteria:
   * - `all` equals total number of groups
   * - `admin` equals count of groups where user has admin/superadmin role
   * - `archived` equals count of groups where `isArchived` is true
   * - `muted` equals count of groups where `isMuted` is true
   *
   * **Validates: Requirements 3.2, 3.5, 3.6, 3.7, 4.2**
   */
  describe('Property: Filter Counts Accuracy', () => {
    it('getFilterCounts returns accurate counts for all filter types', async () => {
      const user = await createTestUser('filter-counts-1');
      const session = await createTestSession(user.id, 'filter-counts-1');

      // Update session with JID for admin matching
      await prisma.whatsAppSession.update({
        where: { id: session.id },
        data: { jid: '1234567890@s.whatsapp.net' },
      });

      // Create groups with various states
      const normalGroup = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Normal Group',
      );
      const archivedGroup = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Archived Group',
      );
      const mutedGroup = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Muted Group',
      );
      const adminGroup = await createTestGroup(
        session.id,
        '4444444444@g.us',
        'Admin Group',
      );

      // Set archived and muted states
      await prisma.whatsAppGroup.update({
        where: { id: archivedGroup.id },
        data: { isArchived: true },
      });
      await prisma.whatsAppGroup.update({
        where: { id: mutedGroup.id },
        data: { isMuted: true },
      });

      // Add admin participant to adminGroup (matching session JID)
      await createTestParticipant(
        adminGroup.id,
        '1234567890@s.whatsapp.net',
        'admin',
      );
      // Add member participant to other groups
      await createTestParticipant(
        normalGroup.id,
        '9999999999@s.whatsapp.net',
        'member',
      );

      // Get filter counts
      const counts = await whatsappGroupsService.getFilterCounts(user.id);

      expect(counts.all).toBe(4);
      expect(counts.archived).toBe(1);
      expect(counts.muted).toBe(1);
      expect(counts.admin).toBe(1);
    });

    it('property: filter counts match actual filtered group counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // Number of groups
          fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }), // isArchived flags
          fc.array(fc.boolean(), { minLength: 1, maxLength: 5 }), // isMuted flags
          async (numGroups, archivedFlags, mutedFlags) => {
            const user = await createTestUser(`fc-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `fc-prop-${Date.now()}`,
            );

            // Create groups with various states
            let expectedArchived = 0;
            let expectedMuted = 0;

            for (let i = 0; i < numGroups; i++) {
              const isArchived =
                archivedFlags[i % archivedFlags.length] ?? false;
              const isMuted = mutedFlags[i % mutedFlags.length] ?? false;

              const group = await prisma.whatsAppGroup.create({
                data: {
                  id: crypto.randomUUID(),
                  jid: `${Date.now()}${i}@g.us`,
                  name: `Group ${i}`,
                  sessionId: session.id,
                  memberCount: 0,
                  isArchived,
                  isMuted,
                },
              });
              testGroups.push(group);

              if (isArchived) expectedArchived++;
              if (isMuted) expectedMuted++;
            }

            // Get filter counts
            const counts = await whatsappGroupsService.getFilterCounts(user.id);

            // Verify counts match expected values
            expect(counts.all).toBe(numGroups);
            expect(counts.archived).toBe(expectedArchived);
            expect(counts.muted).toBe(expectedMuted);

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-filter-counts, Property 2: Session Filter Isolation
   *
   * *For any* sessionId filter parameter, the returned counts SHALL only include
   * groups belonging to that specific session.
   *
   * **Validates: Requirements 3.3**
   */
  describe('Property: Session Filter Isolation for Counts', () => {
    it('getFilterCounts with sessionId only counts groups from that session', async () => {
      const user = await createTestUser('session-counts-1');
      const session1 = await createTestSession(user.id, 'session-counts-1a');
      const session2 = await createTestSession(user.id, 'session-counts-1b');

      // Create groups in session1
      await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'Session 1 Group 1',
      );
      await createTestGroup(
        session1.id,
        '2222222222@g.us',
        'Session 1 Group 2',
      );

      // Create groups in session2
      await createTestGroup(
        session2.id,
        '3333333333@g.us',
        'Session 2 Group 1',
      );

      // Get counts for session1 only
      const counts1 = await whatsappGroupsService.getFilterCounts(
        user.id,
        session1.id,
      );
      expect(counts1.all).toBe(2);

      // Get counts for session2 only
      const counts2 = await whatsappGroupsService.getFilterCounts(
        user.id,
        session2.id,
      );
      expect(counts2.all).toBe(1);

      // Get counts for all sessions
      const countsAll = await whatsappGroupsService.getFilterCounts(user.id);
      expect(countsAll.all).toBe(3);
    });
  });

  /**
   * Feature: whatsapp-groups-filter-counts, Property 3: User Authorization Boundary
   *
   * *For any* authenticated user, the filter counts SHALL only include groups
   * from sessions owned by that user.
   *
   * **Validates: Requirements 3.4**
   */
  describe('Property: User Authorization Boundary for Counts', () => {
    it('getFilterCounts only counts groups from user-owned sessions', async () => {
      const user1 = await createTestUser('auth-counts-1');
      const user2 = await createTestUser('auth-counts-2');

      const session1 = await createTestSession(user1.id, 'auth-counts-1');
      const session2 = await createTestSession(user2.id, 'auth-counts-2');

      // Create groups for each user
      await createTestGroup(session1.id, '1111111111@g.us', 'User 1 Group 1');
      await createTestGroup(session1.id, '2222222222@g.us', 'User 1 Group 2');
      await createTestGroup(session2.id, '3333333333@g.us', 'User 2 Group 1');

      // User 1 should only see their 2 groups
      const counts1 = await whatsappGroupsService.getFilterCounts(user1.id);
      expect(counts1.all).toBe(2);

      // User 2 should only see their 1 group
      const counts2 = await whatsappGroupsService.getFilterCounts(user2.id);
      expect(counts2.all).toBe(1);
    });
  });

  /**
   * Feature: whatsapp-groups-filter-counts, Property 5: Sync Persistence Round-Trip
   *
   * *For any* group data synced from the Go service, the isArchived, isMuted,
   * and mutedUntil fields SHALL be correctly persisted and retrievable.
   *
   * **Validates: Requirements 6.1, 6.2, 6.3, 6.4**
   */
  describe('Property: Sync Persistence Round-Trip', () => {
    it('persisted group fields match original sync data', async () => {
      const user = await createTestUser('sync-roundtrip-1');
      const session = await createTestSession(user.id, 'sync-roundtrip-1');

      // Create a group with specific filter field values
      const mutedUntilDate = new Date('2026-06-01T00:00:00Z');
      const group = await prisma.whatsAppGroup.create({
        data: {
          id: crypto.randomUUID(),
          jid: '1234567890@g.us',
          name: 'Round Trip Test Group',
          sessionId: session.id,
          memberCount: 5,
          isArchived: true,
          isMuted: true,
          mutedUntil: mutedUntilDate,
        },
      });
      testGroups.push(group);

      // Retrieve the group and verify fields
      const retrieved = await whatsappGroupsService.getGroup(user.id, group.id);

      expect(retrieved.isArchived).toBe(true);
      expect(retrieved.isMuted).toBe(true);
      expect(retrieved.mutedUntil).toEqual(mutedUntilDate);
    });

    it('property: for any filter field combination, persistence is accurate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.boolean(),
          fc.boolean(),
          fc.option(
            fc.date({
              min: new Date('2026-01-01'),
              max: new Date('2030-01-01'),
            }),
            { nil: null },
          ),
          async (isArchived, isMuted, mutedUntil) => {
            const user = await createTestUser(`sync-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `sync-prop-${Date.now()}`,
            );

            // Create group with generated values
            const group = await prisma.whatsAppGroup.create({
              data: {
                id: crypto.randomUUID(),
                jid: `${Date.now()}@g.us`,
                name: 'Property Test Group',
                sessionId: session.id,
                memberCount: 0,
                isArchived,
                isMuted,
                mutedUntil,
              },
            });
            testGroups.push(group);

            // Retrieve and verify
            const retrieved = await whatsappGroupsService.getGroup(
              user.id,
              group.id,
            );

            expect(retrieved.isArchived).toBe(isArchived);
            expect(retrieved.isMuted).toBe(isMuted);
            if (mutedUntil === null) {
              expect(retrieved.mutedUntil).toBeNull();
            } else {
              expect(retrieved.mutedUntil?.getTime()).toBe(
                mutedUntil.getTime(),
              );
            }

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-filter-counts, Property 4: Admin Role JID Matching
   *
   * *For any* session with a JID, the admin count SHALL correctly match groups
   * where the session's JID corresponds to a participant with admin/superadmin role.
   *
   * **Validates: Requirements 4.1**
   */
  describe('Property: Admin Role JID Matching', () => {
    it('admin count matches groups where session JID is admin participant', async () => {
      const user = await createTestUser('admin-jid-1');

      // Create session with a JID
      const session = await prisma.whatsAppSession.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Admin JID Test Session',
          userId: user.id,
          status: 'connected',
          jid: '1234567890@s.whatsapp.net',
        },
      });
      testSessions.push(session);

      // Create groups
      const group1 = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Admin Group',
      );
      const group2 = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Member Group',
      );
      const group3 = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Superadmin Group',
      );

      // Add participants - user is admin in group1, member in group2, superadmin in group3
      await createTestParticipant(
        group1.id,
        '1234567890@s.whatsapp.net',
        'admin',
      );
      await createTestParticipant(
        group2.id,
        '1234567890@s.whatsapp.net',
        'member',
      );
      await createTestParticipant(
        group3.id,
        '1234567890@s.whatsapp.net',
        'superadmin',
      );

      // Get filter counts
      const counts = await whatsappGroupsService.getFilterCounts(user.id);

      // Should count 2 admin groups (admin + superadmin roles)
      expect(counts.all).toBe(3);
      expect(counts.admin).toBe(2);
    });

    it('admin count is 0 when session has no JID', async () => {
      const user = await createTestUser('admin-no-jid-1');

      // Create session without a JID
      const session = await prisma.whatsAppSession.create({
        data: {
          id: crypto.randomUUID(),
          name: 'No JID Session',
          userId: user.id,
          status: 'connected',
          jid: null,
        },
      });
      testSessions.push(session);

      // Create group with admin participant
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );
      await createTestParticipant(
        group.id,
        '9999999999@s.whatsapp.net',
        'admin',
      );

      // Get filter counts
      const counts = await whatsappGroupsService.getFilterCounts(user.id);

      // Admin count should be 0 since session has no JID to match
      expect(counts.all).toBe(1);
      expect(counts.admin).toBe(0);
    });

    it('admin count handles JID with device suffix', async () => {
      const user = await createTestUser('admin-device-1');

      // Create session with JID that has device suffix
      const session = await prisma.whatsAppSession.create({
        data: {
          id: crypto.randomUUID(),
          name: 'Device Suffix Session',
          userId: user.id,
          status: 'connected',
          jid: '1234567890:123@s.whatsapp.net', // Has device suffix :123
        },
      });
      testSessions.push(session);

      // Create group
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Add participant with base JID (no device suffix)
      await createTestParticipant(
        group.id,
        '1234567890@s.whatsapp.net',
        'admin',
      );

      // Get filter counts
      const counts = await whatsappGroupsService.getFilterCounts(user.id);

      // Should match despite device suffix difference
      expect(counts.admin).toBe(1);
    });
  });
});
