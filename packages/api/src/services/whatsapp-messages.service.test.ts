/**
 * WhatsApp Messages Service Tests
 *
 * Property-based tests and unit tests for the WhatsApp Messages Service.
 * Uses fast-check for property-based testing.
 *
 * Feature: whatsapp-messages-backend
 * **Validates: Requirements 2.1-2.12, 6.1-6.8, 8.1-8.5**
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import prisma from '@pharmabroker/db';
import {
  whatsappMessagesService,
  type ParsedMessageEvent,
} from './whatsapp-messages.service';

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
  groupId: string;
}

interface TestMessage {
  id: string;
  messageId: string;
  sessionId: string;
  groupId: string;
}

// Store created test data for cleanup
const testUsers: TestUser[] = [];
const testSessions: TestSession[] = [];
const testGroups: TestGroup[] = [];
const testParticipants: TestParticipant[] = [];
const testMessages: TestMessage[] = [];

async function createTestUser(suffix: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `test-msg-${suffix}-${Date.now()}@example.com`,
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
): Promise<TestParticipant> {
  const participant = await prisma.whatsAppGroupParticipant.create({
    data: {
      id: crypto.randomUUID(),
      jid,
      role: 'member',
      groupId,
    },
  });
  testParticipants.push(participant);
  return participant;
}

async function createTestMessage(
  sessionId: string,
  groupId: string,
  options: {
    messageType?: string;
    aiStatus?: string;
    source?: string;
    text?: string;
    senderJid?: string;
    messageTimestamp?: Date;
  } = {},
): Promise<TestMessage> {
  const messageId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = await prisma.whatsAppMessage.create({
    data: {
      id: crypto.randomUUID(),
      messageId,
      sessionId,
      groupId,
      senderJid: options.senderJid ?? `${Date.now()}@s.whatsapp.net`,
      messageType: (options.messageType as any) ?? 'text',
      text: options.text ?? 'Test message',
      isFromMe: false,
      isForwarded: false,
      isViewOnce: false,
      isBroadcast: false,
      messageTimestamp: options.messageTimestamp ?? new Date(),
      source: (options.source as any) ?? 'realtime',
      aiStatus: (options.aiStatus as any) ?? 'pending',
    },
  });
  testMessages.push(message);
  return message;
}

async function cleanupTestData(): Promise<void> {
  // Delete in reverse order of dependencies
  if (testMessages.length > 0) {
    await prisma.whatsAppMessage.deleteMany({
      where: { id: { in: testMessages.map(m => m.id) } },
    });
    testMessages.length = 0;
  }

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
const defaultFilters = { limit: 50 };

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('WhatsApp Messages Service - Property Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Property 1: User Authorization Invariant
   *
   * *For any* user and any message query (list or get), all returned messages
   * SHALL belong to sessions owned by that user. No message from another
   * user's session shall ever be returned.
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 8.5**
   */
  describe('Property 1: User Authorization Invariant', () => {
    it('listMessages only returns messages from sessions owned by the requesting user', async () => {
      // Create two users with their own sessions, groups, and messages
      const user1 = await createTestUser('auth-1');
      const user2 = await createTestUser('auth-2');

      const session1 = await createTestSession(user1.id, 'auth-1');
      const session2 = await createTestSession(user2.id, 'auth-2');

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

      // Create messages for each user
      const msg1 = await createTestMessage(session1.id, group1.id, {
        text: 'User 1 message',
      });
      const msg2 = await createTestMessage(session2.id, group2.id, {
        text: 'User 2 message',
      });

      // Property: User 1 should only see their own messages
      const result1 = await whatsappMessagesService.listMessages(
        user1.id,
        defaultFilters,
      );
      expect(result1.messages.length).toBe(1);
      expect(result1.messages[0]?.id).toBe(msg1.id);

      // Property: User 2 should only see their own messages
      const result2 = await whatsappMessagesService.listMessages(
        user2.id,
        defaultFilters,
      );
      expect(result2.messages.length).toBe(1);
      expect(result2.messages[0]?.id).toBe(msg2.id);
    });

    it('getMessage returns MESSAGE_NOT_FOUND for messages belonging to other users', async () => {
      const user1 = await createTestUser('get-auth-1');
      const user2 = await createTestUser('get-auth-2');

      const session1 = await createTestSession(user1.id, 'get-auth-1');
      const group1 = await createTestGroup(
        session1.id,
        '1111111111@g.us',
        'User 1 Group',
      );

      // Create a message owned by user1
      const msg = await createTestMessage(session1.id, group1.id);

      // User1 can access their own message
      const result = await whatsappMessagesService.getMessage(user1.id, msg.id);
      expect(result.id).toBe(msg.id);

      // User2 cannot access user1's message
      try {
        await whatsappMessagesService.getMessage(user2.id, msg.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    it('property: for any number of users and messages, each user only sees their own messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }), // Number of users
          fc.integer({ min: 1, max: 3 }), // Messages per user
          async (numUsers, messagesPerUser) => {
            const users: Array<{
              user: TestUser;
              session: TestSession;
              group: TestGroup;
              messages: TestMessage[];
            }> = [];

            for (let i = 0; i < numUsers; i++) {
              const user = await createTestUser(`prop-${i}-${Date.now()}`);
              const session = await createTestSession(
                user.id,
                `prop-${i}-${Date.now()}`,
              );
              const group = await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
              const messages: TestMessage[] = [];

              for (let j = 0; j < messagesPerUser; j++) {
                const msg = await createTestMessage(session.id, group.id, {
                  text: `Message ${i}-${j}`,
                });
                messages.push(msg);
              }

              users.push({ user, session, group, messages });
            }

            // Verify each user only sees their own messages
            for (const { user, messages } of users) {
              const result = await whatsappMessagesService.listMessages(
                user.id,
                defaultFilters,
              );

              // Should have exactly the number of messages created for this user
              expect(result.messages.length).toBe(messages.length);

              // All returned messages should belong to this user
              const returnedIds = new Set(result.messages.map(m => m.id));
              for (const msg of messages) {
                expect(returnedIds.has(msg.id)).toBe(true);
              }
            }

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 2: Filter Correctness
   *
   * *For any* messages list query with filters, all returned messages
   * SHALL match all specified filter criteria exactly.
   *
   * **Validates: Requirements 2.5, 2.6, 2.7, 2.8**
   */
  describe('Property 2: Filter Correctness', () => {
    it('listMessages with messageType filter returns only matching messages', async () => {
      const user = await createTestUser('type-filter-1');
      const session = await createTestSession(user.id, 'type-filter-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      // Create messages with different types
      await createTestMessage(session.id, group.id, {
        messageType: 'text',
        text: 'Text message',
      });
      await createTestMessage(session.id, group.id, {
        messageType: 'image',
        text: null,
      });
      await createTestMessage(session.id, group.id, {
        messageType: 'text',
        text: 'Another text',
      });

      // Filter by text type
      const result = await whatsappMessagesService.listMessages(user.id, {
        ...defaultFilters,
        messageType: 'text',
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages.every(m => m.messageType === 'text')).toBe(true);
    });

    it('listMessages with aiStatus filter returns only matching messages', async () => {
      const user = await createTestUser('ai-filter-1');
      const session = await createTestSession(user.id, 'ai-filter-1');
      const group = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Test Group',
      );

      // Create messages with different AI statuses
      await createTestMessage(session.id, group.id, { aiStatus: 'pending' });
      await createTestMessage(session.id, group.id, { aiStatus: 'completed' });
      await createTestMessage(session.id, group.id, { aiStatus: 'pending' });

      // Filter by pending status
      const result = await whatsappMessagesService.listMessages(user.id, {
        ...defaultFilters,
        aiStatus: 'pending',
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages.every(m => m.aiStatus === 'pending')).toBe(true);
    });

    it('listMessages with source filter returns only matching messages', async () => {
      const user = await createTestUser('source-filter-1');
      const session = await createTestSession(user.id, 'source-filter-1');
      const group = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Test Group',
      );

      // Create messages with different sources
      await createTestMessage(session.id, group.id, { source: 'realtime' });
      await createTestMessage(session.id, group.id, { source: 'history' });
      await createTestMessage(session.id, group.id, { source: 'realtime' });

      // Filter by realtime source
      const result = await whatsappMessagesService.listMessages(user.id, {
        ...defaultFilters,
        source: 'realtime',
      });

      expect(result.messages.length).toBe(2);
      expect(result.messages.every(m => m.source === 'realtime')).toBe(true);
    });

    it('listMessages with date range filter returns only matching messages', async () => {
      const user = await createTestUser('date-filter-1');
      const session = await createTestSession(user.id, 'date-filter-1');
      const group = await createTestGroup(
        session.id,
        '4444444444@g.us',
        'Test Group',
      );

      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

      // Create messages with different timestamps
      await createTestMessage(session.id, group.id, {
        messageTimestamp: twoDaysAgo,
      });
      await createTestMessage(session.id, group.id, {
        messageTimestamp: yesterday,
      });
      await createTestMessage(session.id, group.id, { messageTimestamp: now });

      // Filter by date range (yesterday to now)
      const result = await whatsappMessagesService.listMessages(user.id, {
        ...defaultFilters,
        dateFrom: yesterday,
        dateTo: now,
      });

      expect(result.messages.length).toBe(2);
      for (const msg of result.messages) {
        expect(msg.messageTimestamp.getTime()).toBeGreaterThanOrEqual(
          yesterday.getTime(),
        );
        expect(msg.messageTimestamp.getTime()).toBeLessThanOrEqual(
          now.getTime(),
        );
      }
    });

    it('property: for any combination of filters, all returned messages match all criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('text', 'image', 'video') as fc.Arbitrary<
            'text' | 'image' | 'video'
          >,
          fc.constantFrom('pending', 'completed', 'failed') as fc.Arbitrary<
            'pending' | 'completed' | 'failed'
          >,
          fc.constantFrom('realtime', 'history') as fc.Arbitrary<
            'realtime' | 'history'
          >,
          async (messageType, aiStatus, source) => {
            const user = await createTestUser(`filter-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `filter-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            // Create messages with various combinations
            const types = ['text', 'image', 'video'];
            const statuses = ['pending', 'completed', 'failed'];
            const sources = ['realtime', 'history'];

            for (const t of types) {
              for (const s of statuses) {
                for (const src of sources) {
                  await createTestMessage(session.id, group.id, {
                    messageType: t,
                    aiStatus: s,
                    source: src,
                  });
                }
              }
            }

            // Apply all filters
            const result = await whatsappMessagesService.listMessages(user.id, {
              ...defaultFilters,
              messageType,
              aiStatus,
              source,
            });

            // All returned messages should match all filters
            for (const msg of result.messages) {
              expect(msg.messageType).toBe(messageType);
              expect(msg.aiStatus).toBe(aiStatus);
              expect(msg.source).toBe(source);
            }

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 10: Message Storage Idempotence
   *
   * *For any* message event, storing the same message twice (same sessionId + messageId)
   * SHALL result in exactly one record in the database (upsert behavior).
   *
   * **Validates: Requirements 6.4**
   */
  describe('Property 10: Message Storage Idempotence', () => {
    it('storeMessage with same sessionId and messageId creates only one record', async () => {
      const user = await createTestUser('idempotent-1');
      const session = await createTestSession(user.id, 'idempotent-1');
      const group = await createTestGroup(
        session.id,
        '5555555555@g.us',
        'Test Group',
      );

      const messageId = `MSG-IDEM-${Date.now()}`;
      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid,
        senderJid: '1234567890@s.whatsapp.net',
        senderPushName: 'Test User',
        messageType: 'text',
        text: 'First version',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      // Store the message first time
      await whatsappMessagesService.storeMessage(event);

      // Count messages
      const countBefore = await prisma.whatsAppMessage.count({
        where: { sessionId: session.id, messageId },
      });
      expect(countBefore).toBe(1);

      // Store the same message again (with updated text)
      await whatsappMessagesService.storeMessage({
        ...event,
        text: 'Updated version',
      });

      // Count should still be 1
      const countAfter = await prisma.whatsAppMessage.count({
        where: { sessionId: session.id, messageId },
      });
      expect(countAfter).toBe(1);

      // Clean up
      await prisma.whatsAppMessage.deleteMany({
        where: { sessionId: session.id, messageId },
      });
    });

    it('property: storing same message N times results in exactly 1 record', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 5 }), // Number of times to store
          async storeCount => {
            const user = await createTestUser(`idem-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `idem-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const messageId = `MSG-IDEM-PROP-${Date.now()}`;
            const event: ParsedMessageEvent = {
              messageId,
              sessionId: session.id,
              chatJid: group.jid,
              senderJid: '1234567890@s.whatsapp.net',
              messageType: 'text',
              text: 'Test message',
              isFromMe: false,
              isForwarded: false,
              isViewOnce: false,
              isBroadcast: false,
              messageTimestamp: new Date().toISOString(),
              source: 'realtime',
            };

            // Store the message multiple times
            for (let i = 0; i < storeCount; i++) {
              await whatsappMessagesService.storeMessage({
                ...event,
                text: `Version ${i}`,
              });
            }

            // Should have exactly 1 record
            const count = await prisma.whatsAppMessage.count({
              where: { sessionId: session.id, messageId },
            });
            expect(count).toBe(1);

            // Clean up
            await prisma.whatsAppMessage.deleteMany({
              where: { sessionId: session.id, messageId },
            });

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });

    it('storeMessage skips messages for unknown groups', async () => {
      const user = await createTestUser('unknown-group-1');
      const session = await createTestSession(user.id, 'unknown-group-1');

      const messageId = `MSG-UNKNOWN-${Date.now()}`;
      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: 'nonexistent@g.us', // Group doesn't exist
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Test message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      // Should not throw, just skip
      await whatsappMessagesService.storeMessage(event);

      // No message should be created
      const count = await prisma.whatsAppMessage.count({
        where: { sessionId: session.id, messageId },
      });
      expect(count).toBe(0);
    });
  });

  /**
   * Property 3: Search Filter Correctness
   *
   * *For any* messages list query with a search term, all returned messages
   * SHALL contain the search term in text, caption, or senderPushName (case-insensitive).
   *
   * **Validates: Requirements 2.9**
   */
  describe('Property 3: Search Filter Correctness', () => {
    it('listMessages with search filter returns only matching messages', async () => {
      const user = await createTestUser('search-1');
      const session = await createTestSession(user.id, 'search-1');
      const group = await createTestGroup(
        session.id,
        '6666666666@g.us',
        'Test Group',
      );

      // Create messages with different content
      await createTestMessage(session.id, group.id, { text: 'Hello world' });
      await createTestMessage(session.id, group.id, { text: 'Goodbye world' });
      await createTestMessage(session.id, group.id, { text: 'HELLO again' });

      // Search for "hello" (case-insensitive)
      const result = await whatsappMessagesService.listMessages(user.id, {
        ...defaultFilters,
        search: 'hello',
      });

      expect(result.messages.length).toBe(2);
      for (const msg of result.messages) {
        expect(msg.text?.toLowerCase()).toContain('hello');
      }
    });

    it('property: for any search term, all returned messages contain the term', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 5, maxLength: 20 }), {
            minLength: 3,
            maxLength: 5,
          }),
          async texts => {
            const user = await createTestUser(`search-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `search-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            // Create messages with the generated texts
            for (const text of texts) {
              await createTestMessage(session.id, group.id, { text });
            }

            // Pick a search term from one of the texts (first 3 chars)
            const searchTerm = (texts[0] ?? 'test').substring(0, 3);

            const result = await whatsappMessagesService.listMessages(user.id, {
              ...defaultFilters,
              search: searchTerm,
            });

            // All returned messages should contain the search term
            for (const msg of result.messages) {
              const textMatch =
                msg.text?.toLowerCase().includes(searchTerm.toLowerCase()) ??
                false;
              const captionMatch =
                msg.caption?.toLowerCase().includes(searchTerm.toLowerCase()) ??
                false;
              const senderMatch =
                msg.senderPushName
                  ?.toLowerCase()
                  .includes(searchTerm.toLowerCase()) ?? false;
              expect(textMatch || captionMatch || senderMatch).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 4: Pagination Completeness
   *
   * *For any* paginated query, iterating through all pages using the nextCursor
   * SHALL return all items exactly once with no duplicates and no missing items.
   *
   * **Validates: Requirements 2.10**
   */
  describe('Property 4: Pagination Completeness', () => {
    it('listMessages pagination returns all messages exactly once', async () => {
      const user = await createTestUser('pagination-1');
      const session = await createTestSession(user.id, 'pagination-1');
      const group = await createTestGroup(
        session.id,
        '7777777777@g.us',
        'Test Group',
      );

      // Create 7 messages
      const createdMessages: TestMessage[] = [];
      for (let i = 0; i < 7; i++) {
        const msg = await createTestMessage(session.id, group.id, {
          text: `Message ${i}`,
        });
        createdMessages.push(msg);
      }

      // Paginate with limit of 3
      const allMessages: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await whatsappMessagesService.listMessages(user.id, {
          limit: 3,
          cursor,
        });

        for (const msg of result.messages) {
          allMessages.push(msg.id);
        }

        cursor = result.nextCursor;
      } while (cursor);

      // Should have all 7 messages
      expect(allMessages.length).toBe(7);

      // No duplicates
      const uniqueIds = new Set(allMessages);
      expect(uniqueIds.size).toBe(7);

      // All created messages should be present
      for (const msg of createdMessages) {
        expect(uniqueIds.has(msg.id)).toBe(true);
      }
    });

    it('property: for any number of messages and page size, pagination returns all messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 10 }), // Number of messages
          fc.integer({ min: 2, max: 4 }), // Page size
          async (numMessages, pageSize) => {
            const user = await createTestUser(`page-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `page-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            // Create messages
            const createdIds: string[] = [];
            for (let i = 0; i < numMessages; i++) {
              const msg = await createTestMessage(session.id, group.id, {
                text: `Message ${i}`,
              });
              createdIds.push(msg.id);
            }

            // Paginate
            const allIds: string[] = [];
            let cursor: string | undefined;

            do {
              const result = await whatsappMessagesService.listMessages(
                user.id,
                {
                  limit: pageSize,
                  cursor,
                },
              );

              for (const msg of result.messages) {
                allIds.push(msg.id);
              }

              cursor = result.nextCursor;
            } while (cursor);

            // Should have all messages
            expect(allIds.length).toBe(numMessages);

            // No duplicates
            const uniqueIds = new Set(allIds);
            expect(uniqueIds.size).toBe(numMessages);

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 5: Delete Authorization
   *
   * *For any* delete operation, only messages belonging to the requesting user's
   * sessions can be deleted. Attempting to delete another user's message SHALL fail.
   *
   * **Validates: Requirements 2.11, 2.12**
   */
  describe('Property 5: Delete Authorization', () => {
    it('deleteMessage fails for messages belonging to other users', async () => {
      const user1 = await createTestUser('delete-auth-1');
      const user2 = await createTestUser('delete-auth-2');

      const session1 = await createTestSession(user1.id, 'delete-auth-1');
      const group1 = await createTestGroup(
        session1.id,
        '8888888888@g.us',
        'User 1 Group',
      );

      // Create a message owned by user1
      const msg = await createTestMessage(session1.id, group1.id);

      // User2 cannot delete user1's message
      try {
        await whatsappMessagesService.deleteMessage(user2.id, msg.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }

      // Message should still exist
      const exists = await prisma.whatsAppMessage.findUnique({
        where: { id: msg.id },
      });
      expect(exists).not.toBeNull();

      // User1 can delete their own message
      await whatsappMessagesService.deleteMessage(user1.id, msg.id);

      // Message should be deleted
      const deleted = await prisma.whatsAppMessage.findUnique({
        where: { id: msg.id },
      });
      expect(deleted).toBeNull();

      // Remove from test tracking since it's deleted
      const idx = testMessages.findIndex(m => m.id === msg.id);
      if (idx >= 0) testMessages.splice(idx, 1);
    });

    it('bulkDeleteMessages only deletes messages owned by the user', async () => {
      const user1 = await createTestUser('bulk-delete-1');
      const user2 = await createTestUser('bulk-delete-2');

      const session1 = await createTestSession(user1.id, 'bulk-delete-1');
      const session2 = await createTestSession(user2.id, 'bulk-delete-2');

      const group1 = await createTestGroup(
        session1.id,
        '9999999991@g.us',
        'User 1 Group',
      );
      const group2 = await createTestGroup(
        session2.id,
        '9999999992@g.us',
        'User 2 Group',
      );

      // Create messages for both users
      const msg1 = await createTestMessage(session1.id, group1.id);
      const msg2 = await createTestMessage(session2.id, group2.id);

      // User1 tries to bulk delete both messages
      const result = await whatsappMessagesService.bulkDeleteMessages(
        user1.id,
        [msg1.id, msg2.id],
      );

      // Should only delete 1 (user1's message)
      expect(result.deleted).toBe(1);

      // User1's message should be deleted
      const deleted1 = await prisma.whatsAppMessage.findUnique({
        where: { id: msg1.id },
      });
      expect(deleted1).toBeNull();

      // User2's message should still exist
      const exists2 = await prisma.whatsAppMessage.findUnique({
        where: { id: msg2.id },
      });
      expect(exists2).not.toBeNull();

      // Remove deleted message from test tracking
      const idx = testMessages.findIndex(m => m.id === msg1.id);
      if (idx >= 0) testMessages.splice(idx, 1);
    });
  });

  /**
   * Property 6: Statistics Accuracy
   *
   * *For any* user's messages, the statistics SHALL accurately reflect
   * the counts by type, AI status, and source.
   *
   * **Validates: Requirements 2.4**
   */
  describe('Property 6: Statistics Accuracy', () => {
    it('getMessageStats returns accurate counts', async () => {
      const user = await createTestUser('stats-1');
      const session = await createTestSession(user.id, 'stats-1');
      const group = await createTestGroup(
        session.id,
        '1010101010@g.us',
        'Test Group',
      );

      // Create messages with known distribution
      await createTestMessage(session.id, group.id, {
        messageType: 'text',
        aiStatus: 'pending',
        source: 'realtime',
      });
      await createTestMessage(session.id, group.id, {
        messageType: 'text',
        aiStatus: 'completed',
        source: 'realtime',
      });
      await createTestMessage(session.id, group.id, {
        messageType: 'image',
        aiStatus: 'pending',
        source: 'history',
      });

      const stats = await whatsappMessagesService.getMessageStats(user.id);

      expect(stats.total).toBe(3);
      expect(stats.byType['text']).toBe(2);
      expect(stats.byType['image']).toBe(1);
      expect(stats.byAIStatus['pending']).toBe(2);
      expect(stats.byAIStatus['completed']).toBe(1);
      expect(stats.bySource['realtime']).toBe(2);
      expect(stats.bySource['history']).toBe(1);
    });

    it('property: stats counts match actual message counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }), // Number of messages
          async numMessages => {
            const user = await createTestUser(`stats-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `stats-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const types = ['text', 'image', 'video'];
            const statuses = ['pending', 'completed', 'failed'];
            const sources = ['realtime', 'history'];

            // Track expected counts
            const expectedByType: Record<string, number> = {};
            const expectedByStatus: Record<string, number> = {};
            const expectedBySource: Record<string, number> = {};

            // Create messages with random attributes
            for (let i = 0; i < numMessages; i++) {
              const type = types[i % types.length]!;
              const status = statuses[i % statuses.length]!;
              const source = sources[i % sources.length]!;

              await createTestMessage(session.id, group.id, {
                messageType: type,
                aiStatus: status,
                source: source,
              });

              expectedByType[type] = (expectedByType[type] ?? 0) + 1;
              expectedByStatus[status] = (expectedByStatus[status] ?? 0) + 1;
              expectedBySource[source] = (expectedBySource[source] ?? 0) + 1;
            }

            const stats = await whatsappMessagesService.getMessageStats(
              user.id,
            );

            expect(stats.total).toBe(numMessages);

            // Verify type counts
            for (const [type, count] of Object.entries(expectedByType)) {
              expect(stats.byType[type]).toBe(count);
            }

            // Verify status counts
            for (const [status, count] of Object.entries(expectedByStatus)) {
              expect(stats.byAIStatus[status]).toBe(count);
            }

            // Verify source counts
            for (const [source, count] of Object.entries(expectedBySource)) {
              expect(stats.bySource[source]).toBe(count);
            }

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 18: Session Connection Validation
   *
   * *For any* sync operation on a session, if the session status is not 'connected',
   * the operation SHALL fail with an error indicating the session must be connected.
   *
   * **Validates: Requirements 9.2, 9.4**
   */
  describe('Property 18: Session Connection Validation', () => {
    it('getSyncStatus fails for disconnected sessions', async () => {
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

      // Sync should fail
      try {
        await whatsappMessagesService.getSyncStatus(user.id, session.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_CONNECTED');
      }
    });

    it('getSyncStatus succeeds for connected sessions', async () => {
      const user = await createTestUser('sync-connected-1');
      const session = await createTestSession(user.id, 'sync-connected-1'); // Creates with status 'connected'
      const group = await createTestGroup(
        session.id,
        '9999999999@g.us',
        'Test Group',
      );

      // Create some history messages
      await createTestMessage(session.id, group.id, { source: 'history' });
      await createTestMessage(session.id, group.id, { source: 'history' });
      await createTestMessage(session.id, group.id, { source: 'realtime' });

      // Sync should succeed and return history count
      const result = await whatsappMessagesService.getSyncStatus(
        user.id,
        session.id,
      );

      expect(result.synced).toBe(2); // Only history messages
      expect(result.errors).toEqual([]);
    });

    it('getSyncStatus fails for non-existent sessions', async () => {
      const user = await createTestUser('sync-nonexistent-1');

      try {
        await whatsappMessagesService.getSyncStatus(
          user.id,
          crypto.randomUUID(),
        );
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('getSyncStatus fails for sessions belonging to other users', async () => {
      const user1 = await createTestUser('sync-auth-1');
      const user2 = await createTestUser('sync-auth-2');

      const session1 = await createTestSession(user1.id, 'sync-auth-1');

      // User2 cannot get sync status for user1's session
      try {
        await whatsappMessagesService.getSyncStatus(user2.id, session1.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    it('property: for any non-connected session status, sync fails', async () => {
      const nonConnectedStatuses = [
        'pending',
        'connecting',
        'disconnected',
        'logged_out',
        'expired',
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...nonConnectedStatuses),
          async status => {
            const user = await createTestUser(`sync-status-${Date.now()}`);

            const session = await prisma.whatsAppSession.create({
              data: {
                id: crypto.randomUUID(),
                name: `Session ${status}`,
                userId: user.id,
                status: status as any,
              },
            });
            testSessions.push(session);

            // Sync should fail for non-connected status
            try {
              await whatsappMessagesService.getSyncStatus(user.id, session.id);
              // Should not reach here
              return false;
            } catch (error: unknown) {
              expect((error as { code: string }).code).toBe(
                'SESSION_NOT_CONNECTED',
              );
              return true;
            }
          },
        ),
        { numRuns: 5 },
      );
    });
  });
});

// ============================================================================
// Property-Based Tests - Message Queueing (auto-sync-groups-messages)
// ============================================================================

describe('WhatsApp Messages Service - Queueing Property Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Property 6: Queued messages processed after sync
   *
   * *For any* session where group sync completes successfully, all queued messages
   * for groups that now exist SHALL be stored in the database.
   *
   * Feature: auto-sync-groups-messages, Property 6: Queued messages processed after sync
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: Queued messages processed after sync', () => {
    it('processQueuedMessages stores messages for existing groups', async () => {
      const user = await createTestUser('queue-process-1');
      const session = await createTestSession(user.id, 'queue-process-1');
      const group = await createTestGroup(
        session.id,
        '1234567890@g.us',
        'Test Group',
      );

      // Create queued messages for the existing group
      const queuedMessages: ParsedMessageEvent[] = [
        {
          messageId: `MSG-Q1-${Date.now()}`,
          sessionId: session.id,
          chatJid: group.jid,
          senderJid: '1111111111@s.whatsapp.net',
          messageType: 'text',
          text: 'Queued message 1',
          isFromMe: false,
          isForwarded: false,
          isViewOnce: false,
          isBroadcast: false,
          messageTimestamp: new Date().toISOString(),
          source: 'history',
        },
        {
          messageId: `MSG-Q2-${Date.now()}`,
          sessionId: session.id,
          chatJid: group.jid,
          senderJid: '2222222222@s.whatsapp.net',
          messageType: 'text',
          text: 'Queued message 2',
          isFromMe: false,
          isForwarded: false,
          isViewOnce: false,
          isBroadcast: false,
          messageTimestamp: new Date().toISOString(),
          source: 'history',
        },
      ];

      // Process the queued messages
      const result =
        await whatsappMessagesService.processQueuedMessages(queuedMessages);

      // All messages should be stored
      expect(result.stored).toBe(2);
      expect(result.dropped).toBe(0);

      // Verify messages exist in database
      const storedMessages = await prisma.whatsAppMessage.findMany({
        where: {
          sessionId: session.id,
          messageId: { in: queuedMessages.map(m => m.messageId) },
        },
      });
      expect(storedMessages.length).toBe(2);

      // Clean up
      await prisma.whatsAppMessage.deleteMany({
        where: {
          sessionId: session.id,
          messageId: { in: queuedMessages.map(m => m.messageId) },
        },
      });
    });

    it('property: for any number of queued messages with existing groups, all are stored', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 5 }), // Number of messages
          async numMessages => {
            const user = await createTestUser(`queue-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `queue-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            // Create queued messages
            const queuedMessages: ParsedMessageEvent[] = [];
            for (let i = 0; i < numMessages; i++) {
              queuedMessages.push({
                messageId: `MSG-PROP-${Date.now()}-${i}`,
                sessionId: session.id,
                chatJid: group.jid,
                senderJid: `${Date.now()}${i}@s.whatsapp.net`,
                messageType: 'text',
                text: `Message ${i}`,
                isFromMe: false,
                isForwarded: false,
                isViewOnce: false,
                isBroadcast: false,
                messageTimestamp: new Date().toISOString(),
                source: 'history',
              });
            }

            // Process the queued messages
            const result =
              await whatsappMessagesService.processQueuedMessages(
                queuedMessages,
              );

            // All messages should be stored
            expect(result.stored).toBe(numMessages);
            expect(result.dropped).toBe(0);

            // Clean up
            await prisma.whatsAppMessage.deleteMany({
              where: {
                sessionId: session.id,
                messageId: { in: queuedMessages.map(m => m.messageId) },
              },
            });

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 7: Orphan messages discarded after sync
   *
   * *For any* queued message whose group is still unknown after sync completes,
   * the message SHALL be discarded and a warning logged.
   *
   * Feature: auto-sync-groups-messages, Property 7: Orphan messages discarded after sync
   * **Validates: Requirements 2.4**
   */
  describe('Property 7: Orphan messages discarded after sync', () => {
    it('processQueuedMessages drops messages for non-existent groups', async () => {
      const user = await createTestUser('queue-orphan-1');
      const session = await createTestSession(user.id, 'queue-orphan-1');

      // Create queued messages for a non-existent group
      const queuedMessages: ParsedMessageEvent[] = [
        {
          messageId: `MSG-ORPHAN-${Date.now()}`,
          sessionId: session.id,
          chatJid: 'nonexistent@g.us', // Group doesn't exist
          senderJid: '1111111111@s.whatsapp.net',
          messageType: 'text',
          text: 'Orphan message',
          isFromMe: false,
          isForwarded: false,
          isViewOnce: false,
          isBroadcast: false,
          messageTimestamp: new Date().toISOString(),
          source: 'history',
        },
      ];

      // Process the queued messages
      const result =
        await whatsappMessagesService.processQueuedMessages(queuedMessages);

      // Message should be dropped
      expect(result.stored).toBe(0);
      expect(result.dropped).toBe(1);

      // Verify message does not exist in database
      const storedMessages = await prisma.whatsAppMessage.findMany({
        where: {
          sessionId: session.id,
          messageId: queuedMessages[0]!.messageId,
        },
      });
      expect(storedMessages.length).toBe(0);
    });

    it('processQueuedMessages handles mixed existing and non-existent groups', async () => {
      const user = await createTestUser('queue-mixed-1');
      const session = await createTestSession(user.id, 'queue-mixed-1');
      const existingGroup = await createTestGroup(
        session.id,
        '1234567890@g.us',
        'Existing Group',
      );

      // Create queued messages - some for existing group, some for non-existent
      const queuedMessages: ParsedMessageEvent[] = [
        {
          messageId: `MSG-EXIST-${Date.now()}`,
          sessionId: session.id,
          chatJid: existingGroup.jid, // Exists
          senderJid: '1111111111@s.whatsapp.net',
          messageType: 'text',
          text: 'Message for existing group',
          isFromMe: false,
          isForwarded: false,
          isViewOnce: false,
          isBroadcast: false,
          messageTimestamp: new Date().toISOString(),
          source: 'history',
        },
        {
          messageId: `MSG-ORPHAN-${Date.now()}`,
          sessionId: session.id,
          chatJid: 'nonexistent@g.us', // Doesn't exist
          senderJid: '2222222222@s.whatsapp.net',
          messageType: 'text',
          text: 'Orphan message',
          isFromMe: false,
          isForwarded: false,
          isViewOnce: false,
          isBroadcast: false,
          messageTimestamp: new Date().toISOString(),
          source: 'history',
        },
      ];

      // Process the queued messages
      const result =
        await whatsappMessagesService.processQueuedMessages(queuedMessages);

      // One stored, one dropped
      expect(result.stored).toBe(1);
      expect(result.dropped).toBe(1);

      // Clean up
      await prisma.whatsAppMessage.deleteMany({
        where: {
          sessionId: session.id,
          messageId: queuedMessages[0]!.messageId,
        },
      });
    });

    it('property: for any mix of existing and non-existent groups, counts are accurate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // Messages for existing groups
          fc.integer({ min: 1, max: 3 }), // Messages for non-existent groups
          async (existingCount, orphanCount) => {
            const user = await createTestUser(`queue-mix-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `queue-mix-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const queuedMessages: ParsedMessageEvent[] = [];

            // Messages for existing group
            for (let i = 0; i < existingCount; i++) {
              queuedMessages.push({
                messageId: `MSG-EXIST-${Date.now()}-${i}`,
                sessionId: session.id,
                chatJid: group.jid,
                senderJid: `${Date.now()}${i}@s.whatsapp.net`,
                messageType: 'text',
                text: `Existing ${i}`,
                isFromMe: false,
                isForwarded: false,
                isViewOnce: false,
                isBroadcast: false,
                messageTimestamp: new Date().toISOString(),
                source: 'history',
              });
            }

            // Messages for non-existent group
            for (let i = 0; i < orphanCount; i++) {
              queuedMessages.push({
                messageId: `MSG-ORPHAN-${Date.now()}-${i}`,
                sessionId: session.id,
                chatJid: `nonexistent-${i}@g.us`,
                senderJid: `${Date.now()}${i}@s.whatsapp.net`,
                messageType: 'text',
                text: `Orphan ${i}`,
                isFromMe: false,
                isForwarded: false,
                isViewOnce: false,
                isBroadcast: false,
                messageTimestamp: new Date().toISOString(),
                source: 'history',
              });
            }

            // Process the queued messages
            const result =
              await whatsappMessagesService.processQueuedMessages(
                queuedMessages,
              );

            // Verify counts
            expect(result.stored).toBe(existingCount);
            expect(result.dropped).toBe(orphanCount);

            // Clean up
            await prisma.whatsAppMessage.deleteMany({
              where: {
                sessionId: session.id,
                messageId: {
                  in: queuedMessages
                    .filter(m => m.chatJid === group.jid)
                    .map(m => m.messageId),
                },
              },
            });

            return true;
          },
        ),
        { numRuns: 5 },
      );
    });
  });
});
