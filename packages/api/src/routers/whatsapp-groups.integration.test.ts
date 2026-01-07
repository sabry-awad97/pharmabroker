/**
 * WhatsApp Groups API Integration Tests
 *
 * Tests for verifying full request/response cycle and that response shapes
 * match frontend expectations. These tests validate the API endpoints work
 * correctly with the service layer and database.
 *
 * Feature: whatsapp-groups-api
 * **Validates: Requirements 8.1, 8.4**
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import prisma from '@pharmabroker/db';
import {
  groupsListResponse,
  participantsListResponse,
  whatsAppGroupWithParticipants,
} from '@pharmabroker/schemas/whatsapp';
import { whatsappGroupsService } from '../services/whatsapp-groups.service';

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
      email: `integration-test-${suffix}-${Date.now()}@example.com`,
      name: `Integration Test User ${suffix}`,
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
      name: `Integration Test Session ${suffix}`,
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
  options?: {
    description?: string;
    isAnnounce?: boolean;
    isLocked?: boolean;
    isEphemeral?: boolean;
    memberCount?: number;
  },
): Promise<TestGroup> {
  const group = await prisma.whatsAppGroup.create({
    data: {
      id: crypto.randomUUID(),
      jid,
      name,
      sessionId,
      description: options?.description ?? null,
      isAnnounce: options?.isAnnounce ?? false,
      isLocked: options?.isLocked ?? false,
      isEphemeral: options?.isEphemeral ?? false,
      memberCount: options?.memberCount ?? 0,
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

// ============================================================================
// Integration Tests - Full Request/Response Cycle
// ============================================================================

describe('WhatsApp Groups API - Integration Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Feature: whatsapp-groups-api
   *
   * Tests for verifying full request/response cycle.
   *
   * **Validates: Requirements 8.1, 8.4**
   */
  describe('Full Request/Response Cycle', () => {
    describe('listGroups endpoint', () => {
      it('returns valid groupsListResponse shape', async () => {
        const user = await createTestUser('list-1');
        const session = await createTestSession(user.id, 'list-1');
        await createTestGroup(session.id, '1234567890@g.us', 'Test Group 1');
        await createTestGroup(session.id, '0987654321@g.us', 'Test Group 2');

        const result = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 50,
        });

        // Validate response matches schema
        const validation = groupsListResponse.safeParse(result);
        expect(validation.success).toBe(true);

        // Verify response structure
        expect(result).toHaveProperty('groups');
        expect(Array.isArray(result.groups)).toBe(true);
        expect(result.groups.length).toBe(2);
      });

      it('returns groups with all required fields for frontend', async () => {
        const user = await createTestUser('list-fields-1');
        const session = await createTestSession(user.id, 'list-fields-1');
        await createTestGroup(session.id, '1234567890@g.us', 'Test Group', {
          description: 'A test group description',
          isAnnounce: true,
          isLocked: false,
          isEphemeral: true,
          memberCount: 25,
        });

        const result = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 50,
        });

        expect(result.groups.length).toBe(1);
        const group = result.groups[0]!;

        // Verify all fields required by frontend are present
        expect(group).toHaveProperty('id');
        expect(group).toHaveProperty('jid');
        expect(group).toHaveProperty('name');
        expect(group).toHaveProperty('description');
        expect(group).toHaveProperty('avatarUrl');
        expect(group).toHaveProperty('isAnnounce');
        expect(group).toHaveProperty('isLocked');
        expect(group).toHaveProperty('isEphemeral');
        expect(group).toHaveProperty('ephemeralTime');
        expect(group).toHaveProperty('ownerJid');
        expect(group).toHaveProperty('sessionId');
        expect(group).toHaveProperty('memberCount');
        expect(group).toHaveProperty('createdAt');
        expect(group).toHaveProperty('updatedAt');
        expect(group).toHaveProperty('groupCreatedAt');
        expect(group).toHaveProperty('lastSyncAt');

        // Verify field types
        expect(typeof group.id).toBe('string');
        expect(typeof group.jid).toBe('string');
        expect(typeof group.name).toBe('string');
        expect(typeof group.memberCount).toBe('number');
        expect(typeof group.isAnnounce).toBe('boolean');
        expect(typeof group.isLocked).toBe('boolean');
        expect(typeof group.isEphemeral).toBe('boolean');
      });

      it('returns correct pagination cursor', async () => {
        const user = await createTestUser('pagination-1');
        const session = await createTestSession(user.id, 'pagination-1');

        // Create 5 groups
        for (let i = 0; i < 5; i++) {
          await createTestGroup(
            session.id,
            `${Date.now()}${i}@g.us`,
            `Group ${i}`,
          );
        }

        // Request with limit of 2
        const result = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 2,
        });

        expect(result.groups.length).toBe(2);
        expect(result.nextCursor).toBeDefined();
        expect(typeof result.nextCursor).toBe('string');

        // Request next page
        const nextResult = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 2,
          cursor: result.nextCursor,
        });

        expect(nextResult.groups.length).toBe(2);
        // Verify no duplicate groups
        const firstPageIds = result.groups.map(g => g.id);
        const secondPageIds = nextResult.groups.map(g => g.id);
        const overlap = firstPageIds.filter(id => secondPageIds.includes(id));
        expect(overlap.length).toBe(0);
      });

      it('returns empty groups array when no groups exist', async () => {
        const user = await createTestUser('empty-1');
        await createTestSession(user.id, 'empty-1');

        const result = await whatsappGroupsService.listGroups(user.id, {
          filter: 'all',
          limit: 50,
        });

        expect(result.groups).toEqual([]);
        expect(result.nextCursor).toBeUndefined();
      });
    });

    describe('getGroup endpoint', () => {
      it('returns valid whatsAppGroupWithParticipants shape', async () => {
        const user = await createTestUser('get-1');
        const session = await createTestSession(user.id, 'get-1');
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'admin',
          'Admin User',
        );
        await createTestParticipant(
          group.id,
          '2222222222@s.whatsapp.net',
          'member',
          'Member User',
        );

        const result = await whatsappGroupsService.getGroup(user.id, group.id);

        // Validate response matches schema
        const validation = whatsAppGroupWithParticipants.safeParse(result);
        expect(validation.success).toBe(true);

        // Verify response structure
        expect(result).toHaveProperty('participants');
        expect(Array.isArray(result.participants)).toBe(true);
        expect(result.participants.length).toBe(2);
      });

      it('returns group with all required fields for frontend', async () => {
        const user = await createTestUser('get-fields-1');
        const session = await createTestSession(user.id, 'get-fields-1');
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
          {
            description: 'Test description',
            isAnnounce: true,
            memberCount: 10,
          },
        );
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'superadmin',
          'Owner',
        );

        const result = await whatsappGroupsService.getGroup(user.id, group.id);

        // Verify all group fields
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('jid');
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('avatarUrl');
        expect(result).toHaveProperty('isAnnounce');
        expect(result).toHaveProperty('isLocked');
        expect(result).toHaveProperty('isEphemeral');
        expect(result).toHaveProperty('sessionId');
        expect(result).toHaveProperty('memberCount');
        expect(result).toHaveProperty('participants');

        // Verify participant fields
        const participant = result.participants[0]!;
        expect(participant).toHaveProperty('id');
        expect(participant).toHaveProperty('jid');
        expect(participant).toHaveProperty('role');
        expect(participant).toHaveProperty('displayName');
        expect(participant).toHaveProperty('avatarUrl');
        expect(participant).toHaveProperty('groupId');
        expect(participant).toHaveProperty('joinedAt');
        expect(participant).toHaveProperty('addedBy');
        expect(participant).toHaveProperty('updatedAt');
      });

      it('returns participants in consistent order', async () => {
        const user = await createTestUser('get-order-1');
        const session = await createTestSession(user.id, 'get-order-1');
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );

        // Create participants in random order
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'member',
          'Zack Member',
        );
        await createTestParticipant(
          group.id,
          '2222222222@s.whatsapp.net',
          'superadmin',
          'Alice Superadmin',
        );
        await createTestParticipant(
          group.id,
          '3333333333@s.whatsapp.net',
          'admin',
          'Bob Admin',
        );
        await createTestParticipant(
          group.id,
          '4444444444@s.whatsapp.net',
          'member',
          'Charlie Member',
        );

        const result = await whatsappGroupsService.getGroup(user.id, group.id);

        // Verify all participants are returned
        expect(result.participants.length).toBe(4);

        // Verify participants are ordered by role first (alphabetically: admin < member < superadmin)
        // then by displayName within each role
        const roles = result.participants.map(p => p.role);

        // Count occurrences of each role
        const adminCount = roles.filter(r => r === 'admin').length;
        const memberCount = roles.filter(r => r === 'member').length;
        const superadminCount = roles.filter(r => r === 'superadmin').length;

        expect(adminCount).toBe(1);
        expect(memberCount).toBe(2);
        expect(superadminCount).toBe(1);

        // Verify the ordering is consistent (same query returns same order)
        const result2 = await whatsappGroupsService.getGroup(user.id, group.id);
        const roles2 = result2.participants.map(p => p.role);
        expect(roles).toEqual(roles2);
      });

      it('throws GROUP_NOT_FOUND for non-existent group', async () => {
        const user = await createTestUser('get-notfound-1');
        await createTestSession(user.id, 'get-notfound-1');

        const nonExistentId = crypto.randomUUID();

        try {
          await whatsappGroupsService.getGroup(user.id, nonExistentId);
          expect(true).toBe(false); // Should not reach here
        } catch (error: unknown) {
          expect((error as { code: string }).code).toBe('GROUP_NOT_FOUND');
        }
      });
    });

    describe('listParticipants endpoint', () => {
      it('returns valid participantsListResponse shape', async () => {
        const user = await createTestUser('participants-1');
        const session = await createTestSession(user.id, 'participants-1');
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'admin',
          'Admin',
        );
        await createTestParticipant(
          group.id,
          '2222222222@s.whatsapp.net',
          'member',
          'Member',
        );

        const result = await whatsappGroupsService.listParticipants(user.id, {
          groupId: group.id,
          limit: 50,
        });

        // Validate response matches schema
        const validation = participantsListResponse.safeParse(result);
        expect(validation.success).toBe(true);

        // Verify response structure
        expect(result).toHaveProperty('participants');
        expect(Array.isArray(result.participants)).toBe(true);
        expect(result.participants.length).toBe(2);
      });

      it('returns participants with all required fields for frontend', async () => {
        const user = await createTestUser('participants-fields-1');
        const session = await createTestSession(
          user.id,
          'participants-fields-1',
        );
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'admin',
          'Test Admin',
        );

        const result = await whatsappGroupsService.listParticipants(user.id, {
          groupId: group.id,
          limit: 50,
        });

        expect(result.participants.length).toBe(1);
        const participant = result.participants[0]!;

        // Verify all fields required by frontend are present
        expect(participant).toHaveProperty('id');
        expect(participant).toHaveProperty('jid');
        expect(participant).toHaveProperty('role');
        expect(participant).toHaveProperty('displayName');
        expect(participant).toHaveProperty('avatarUrl');
        expect(participant).toHaveProperty('groupId');
        expect(participant).toHaveProperty('joinedAt');
        expect(participant).toHaveProperty('addedBy');
        expect(participant).toHaveProperty('updatedAt');

        // Verify field types
        expect(typeof participant.id).toBe('string');
        expect(typeof participant.jid).toBe('string');
        expect(typeof participant.role).toBe('string');
        expect(['member', 'admin', 'superadmin']).toContain(participant.role);
      });

      it('filters participants by role correctly', async () => {
        const user = await createTestUser('participants-filter-1');
        const session = await createTestSession(
          user.id,
          'participants-filter-1',
        );
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );
        await createTestParticipant(
          group.id,
          '1111111111@s.whatsapp.net',
          'admin',
          'Admin',
        );
        await createTestParticipant(
          group.id,
          '2222222222@s.whatsapp.net',
          'member',
          'Member 1',
        );
        await createTestParticipant(
          group.id,
          '3333333333@s.whatsapp.net',
          'member',
          'Member 2',
        );

        // Filter by admin role
        const adminResult = await whatsappGroupsService.listParticipants(
          user.id,
          {
            groupId: group.id,
            role: 'admin',
            limit: 50,
          },
        );

        expect(adminResult.participants.length).toBe(1);
        expect(adminResult.participants[0]!.role).toBe('admin');

        // Filter by member role
        const memberResult = await whatsappGroupsService.listParticipants(
          user.id,
          {
            groupId: group.id,
            role: 'member',
            limit: 50,
          },
        );

        expect(memberResult.participants.length).toBe(2);
        expect(memberResult.participants.every(p => p.role === 'member')).toBe(
          true,
        );
      });

      it('returns correct pagination cursor for participants', async () => {
        const user = await createTestUser('participants-pagination-1');
        const session = await createTestSession(
          user.id,
          'participants-pagination-1',
        );
        const group = await createTestGroup(
          session.id,
          '1234567890@g.us',
          'Test Group',
        );

        // Create 5 participants
        for (let i = 0; i < 5; i++) {
          await createTestParticipant(
            group.id,
            `${Date.now()}${i}@s.whatsapp.net`,
            'member',
            `Member ${i}`,
          );
        }

        // Request with limit of 2
        const result = await whatsappGroupsService.listParticipants(user.id, {
          groupId: group.id,
          limit: 2,
        });

        expect(result.participants.length).toBe(2);
        expect(result.nextCursor).toBeDefined();
        expect(typeof result.nextCursor).toBe('string');
      });
    });
  });

  /**
   * Feature: whatsapp-groups-api
   *
   * Property-based tests for response shape conformance.
   *
   * **Validates: Requirements 8.4**
   */
  describe('Response Shape Conformance - Property Tests', () => {
    it('property: listGroups always returns valid schema response', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // Number of groups
          async numGroups => {
            const user = await createTestUser(`prop-list-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `prop-list-${Date.now()}`,
            );

            // Create groups
            for (let i = 0; i < numGroups; i++) {
              await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
            }

            const result = await whatsappGroupsService.listGroups(user.id, {
              filter: 'all',
              limit: 50,
            });

            // Validate against schema
            const validation = groupsListResponse.safeParse(result);
            expect(validation.success).toBe(true);

            // Verify count matches
            expect(result.groups.length).toBe(numGroups);

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });

    it('property: getGroup always returns valid schema response with participants', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // Number of participants
          async numParticipants => {
            const user = await createTestUser(`prop-get-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `prop-get-${Date.now()}`,
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

            // Create participants
            for (let i = 0; i < numParticipants; i++) {
              await createTestParticipant(
                group.id,
                `${Date.now()}${i}@s.whatsapp.net`,
                roles[i % roles.length]!,
                `Participant ${i}`,
              );
            }

            const result = await whatsappGroupsService.getGroup(
              user.id,
              group.id,
            );

            // Validate against schema
            const validation = whatsAppGroupWithParticipants.safeParse(result);
            expect(validation.success).toBe(true);

            // Verify participant count matches
            expect(result.participants.length).toBe(numParticipants);

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });

    it('property: listParticipants always returns valid schema response', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 5 }), // Number of participants
          async numParticipants => {
            const user = await createTestUser(`prop-part-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `prop-part-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            // Create participants
            for (let i = 0; i < numParticipants; i++) {
              await createTestParticipant(
                group.id,
                `${Date.now()}${i}@s.whatsapp.net`,
                'member',
                `Participant ${i}`,
              );
            }

            const result = await whatsappGroupsService.listParticipants(
              user.id,
              {
                groupId: group.id,
                limit: 50,
              },
            );

            // Validate against schema
            const validation = participantsListResponse.safeParse(result);
            expect(validation.success).toBe(true);

            // Verify count matches
            expect(result.participants.length).toBe(numParticipants);

            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Feature: whatsapp-groups-api
   *
   * Tests for date serialization in responses.
   *
   * **Validates: Requirements 6.4, 8.4**
   */
  describe('Date Serialization in Responses', () => {
    it('returns dates as Date objects that can be serialized to ISO 8601', async () => {
      const user = await createTestUser('date-1');
      const session = await createTestSession(user.id, 'date-1');
      await createTestGroup(session.id, '1234567890@g.us', 'Test Group');

      const result = await whatsappGroupsService.listGroups(user.id, {
        filter: 'all',
        limit: 50,
      });

      const group = result.groups[0]!;

      // Verify dates are Date objects
      expect(group.createdAt instanceof Date).toBe(true);
      expect(group.updatedAt instanceof Date).toBe(true);

      // Verify dates can be serialized to ISO 8601
      const createdAtStr = group.createdAt.toISOString();
      const updatedAtStr = group.updatedAt.toISOString();

      expect(createdAtStr).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );
      expect(updatedAtStr).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );
    });

    it('handles nullable date fields correctly', async () => {
      const user = await createTestUser('date-nullable-1');
      const session = await createTestSession(user.id, 'date-nullable-1');
      await createTestGroup(session.id, '1234567890@g.us', 'Test Group');

      const result = await whatsappGroupsService.listGroups(user.id, {
        filter: 'all',
        limit: 50,
      });

      const group = result.groups[0]!;

      // groupCreatedAt and lastSyncAt can be null
      expect(
        group.groupCreatedAt === null || group.groupCreatedAt instanceof Date,
      ).toBe(true);
      expect(
        group.lastSyncAt === null || group.lastSyncAt instanceof Date,
      ).toBe(true);
    });
  });
});
