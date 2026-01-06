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
): Promise<TestSession> {
  const session = await prisma.whatsAppSession.create({
    data: {
      id: crypto.randomUUID(),
      name: `Test Session ${suffix}`,
      userId,
      status: 'connected',
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
   * SHALL have at least one participant with role 'admin' or 'superadmin'.
   *
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: Admin Filter Correctness', () => {
    it('listGroups with admin filter returns only groups where user is admin', async () => {
      const user = await createTestUser('admin-filter-1');
      const session = await createTestSession(user.id, 'admin-filter-1');

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

      // Add participants with different roles
      await createTestParticipant(
        adminGroup.id,
        '1111111111@s.whatsapp.net',
        'admin',
      );
      await createTestParticipant(
        memberGroup.id,
        '2222222222@s.whatsapp.net',
        'member',
      );
      await createTestParticipant(
        superadminGroup.id,
        '3333333333@s.whatsapp.net',
        'superadmin',
      );

      // Filter by admin
      const result = await whatsappGroupsService.listGroups(user.id, {
        ...defaultFilters,
        filter: 'admin',
      });

      // Should return only groups with admin or superadmin participants
      expect(result.groups.length).toBe(2);
      const groupIds = result.groups.map(g => g.id);
      expect(groupIds).toContain(adminGroup.id);
      expect(groupIds).toContain(superadminGroup.id);
      expect(groupIds).not.toContain(memberGroup.id);
    });

    it('property: for admin filter, all returned groups have admin/superadmin participant', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Number of groups
          async numGroups => {
            const user = await createTestUser(`admin-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `admin-prop-${Date.now()}`,
            );

            const roles: Array<'member' | 'admin' | 'superadmin'> = [
              'member',
              'admin',
              'superadmin',
            ];

            // Create groups with random participant roles
            for (let i = 0; i < numGroups; i++) {
              const group = await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
              // Assign a random role
              const role = roles[i % roles.length]!;
              await createTestParticipant(
                group.id,
                `${Date.now()}${i}@s.whatsapp.net`,
                role,
              );
            }

            // Filter by admin
            const result = await whatsappGroupsService.listGroups(user.id, {
              ...defaultFilters,
              filter: 'admin',
            });

            // Verify all returned groups have admin or superadmin participant
            for (const group of result.groups) {
              const participants =
                await prisma.whatsAppGroupParticipant.findMany({
                  where: { groupId: group.id },
                });
              const hasAdminRole = participants.some(
                p => p.role === 'admin' || p.role === 'superadmin',
              );
              expect(hasAdminRole).toBe(true);
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
});
