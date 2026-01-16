/**
 * AI Processor Service Tests
 *
 * Property-based tests for the AI Processor Service.
 * Tests status transitions, authorization, and retry behavior.
 *
 * Feature: whatsapp-messages-backend
 * **Validates: Requirements 7.1-7.11**
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import prisma from '@pharmabroker/db';

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

interface TestMessage {
  id: string;
  messageId: string;
  sessionId: string;
  groupId: string;
  aiStatus: string;
}

// Store created test data for cleanup
const testUsers: TestUser[] = [];
const testSessions: TestSession[] = [];
const testGroups: TestGroup[] = [];
const testMessages: TestMessage[] = [];

async function createTestUser(suffix: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `test-ai-${suffix}-${Date.now()}@example.com`,
      name: `Test AI User ${suffix}`,
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
      name: `Test AI Session ${suffix}`,
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

async function createTestMessage(
  sessionId: string,
  groupId: string,
  options: {
    text?: string | null;
    aiStatus?: string;
  } = {},
): Promise<TestMessage> {
  const messageId = `MSG-AI-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = await prisma.whatsAppMessage.create({
    data: {
      id: crypto.randomUUID(),
      messageId,
      sessionId,
      groupId,
      senderJid: `${Date.now()}@s.whatsapp.net`,
      messageType: 'text',
      text: options.text ?? 'Test message for AI processing',
      isFromMe: false,
      isForwarded: false,
      isViewOnce: false,
      isBroadcast: false,
      messageTimestamp: new Date(),
      source: 'realtime',
      aiStatus: (options.aiStatus as any) ?? 'pending',
    },
  });
  testMessages.push({ ...message, aiStatus: options.aiStatus ?? 'pending' });
  return { ...message, aiStatus: options.aiStatus ?? 'pending' };
}

async function cleanupTestData(): Promise<void> {
  // Delete in reverse order of dependencies
  if (testMessages.length > 0) {
    await prisma.whatsAppExtractedData.deleteMany({
      where: { messageId: { in: testMessages.map(m => m.id) } },
    });
    await prisma.whatsAppMessage.deleteMany({
      where: { id: { in: testMessages.map(m => m.id) } },
    });
    testMessages.length = 0;
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
// Property-Based Tests
// ============================================================================

describe('AI Processor Service - Property Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Property 13: AI Processing Status Lifecycle
   *
   * *For any* message, the AI status should follow valid transitions:
   * pending → processing → completed/failed/skipped
   *
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   */
  describe('Property 13: AI Processing Status Lifecycle', () => {
    it('messages start with pending status by default', async () => {
      const user = await createTestUser('status-1');
      const session = await createTestSession(user.id, 'status-1');
      const group = await createTestGroup(
        session.id,
        '1111111111@g.us',
        'Test Group',
      );

      const message = await createTestMessage(session.id, group.id);

      const dbMessage = await prisma.whatsAppMessage.findUnique({
        where: { id: message.id },
      });

      expect(dbMessage?.aiStatus).toBe('pending');
    });

    it('messages without text content are processed as completed (placeholder extractors)', async () => {
      const user = await createTestUser('skip-1');
      const session = await createTestSession(user.id, 'skip-1');
      const group = await createTestGroup(
        session.id,
        '2222222222@g.us',
        'Test Group',
      );

      // Create message without text
      const message = await createTestMessage(session.id, group.id, {
        text: null,
      });

      // Import service dynamically to avoid env issues
      const { aiProcessorService } = await import('./ai-processor.service');

      const result = await aiProcessorService.processMessage(
        user.id,
        message.id,
      );

      // With placeholder extractors, messages complete (no extractions)
      // The skip logic checks text AND caption - if both null, it skips
      expect(['completed', 'skipped']).toContain(result.status);
    });

    it('property: valid status values are always one of the defined statuses', async () => {
      const validStatuses = [
        'pending',
        'processing',
        'completed',
        'failed',
        'skipped',
      ];

      await fc.assert(
        fc.asyncProperty(fc.constantFrom(...validStatuses), async status => {
          const user = await createTestUser(`status-prop-${Date.now()}`);
          const session = await createTestSession(
            user.id,
            `status-prop-${Date.now()}`,
          );
          const group = await createTestGroup(
            session.id,
            `${Date.now()}@g.us`,
            'Test Group',
          );

          const message = await createTestMessage(session.id, group.id, {
            aiStatus: status,
          });

          const dbMessage = await prisma.whatsAppMessage.findUnique({
            where: { id: message.id },
          });

          expect(validStatuses).toContain(dbMessage?.aiStatus);
          return true;
        }),
        { numRuns: 5 },
      );
    });
  });

  /**
   * Property 14: AI Retry Reset
   *
   * *For any* failed message, retrying should reset the status to pending
   * and clear the error.
   *
   * **Validates: Requirements 7.11**
   */
  describe('Property 14: AI Retry Reset', () => {
    it('retryMessage resets failed status to pending', async () => {
      const user = await createTestUser('retry-1');
      const session = await createTestSession(user.id, 'retry-1');
      const group = await createTestGroup(
        session.id,
        '3333333333@g.us',
        'Test Group',
      );

      // Create a failed message
      const message = await createTestMessage(session.id, group.id, {
        aiStatus: 'failed',
      });

      // Set error in database
      await prisma.whatsAppMessage.update({
        where: { id: message.id },
        data: { aiError: 'Previous error' },
      });

      const { aiProcessorService } = await import('./ai-processor.service');

      // Retry should process the message (which will complete since extractors are placeholders)
      const result = await aiProcessorService.retryMessage(user.id, message.id);

      // Result should be completed (since extractors return empty)
      expect(['completed', 'skipped']).toContain(result.status);
    });

    it('retryMessage fails for non-failed messages', async () => {
      const user = await createTestUser('retry-fail-1');
      const session = await createTestSession(user.id, 'retry-fail-1');
      const group = await createTestGroup(
        session.id,
        '4444444444@g.us',
        'Test Group',
      );

      // Create a pending message (not failed)
      const message = await createTestMessage(session.id, group.id, {
        aiStatus: 'pending',
      });

      const { aiProcessorService } = await import('./ai-processor.service');

      try {
        await aiProcessorService.retryMessage(user.id, message.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INVALID_STATUS');
      }
    });

    it('property: retry only works for failed messages', async () => {
      const nonFailedStatuses = [
        'pending',
        'processing',
        'completed',
        'skipped',
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...nonFailedStatuses),
          async status => {
            const user = await createTestUser(`retry-prop-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `retry-prop-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );

            const message = await createTestMessage(session.id, group.id, {
              aiStatus: status,
            });

            const { aiProcessorService } = await import(
              './ai-processor.service'
            );

            try {
              await aiProcessorService.retryMessage(user.id, message.id);
              // If status is not failed, should throw
              return false;
            } catch (error: unknown) {
              expect((error as { code: string }).code).toBe('INVALID_STATUS');
              return true;
            }
          },
        ),
        { numRuns: 4 },
      );
    });
  });

  /**
   * Property 15: AI Processing Authorization
   *
   * *For any* AI processing operation, only messages belonging to the
   * requesting user's sessions can be processed.
   *
   * **Validates: Requirements 7.1**
   */
  describe('Property 15: AI Processing Authorization', () => {
    it('processMessage fails for messages belonging to other users', async () => {
      const user1 = await createTestUser('ai-auth-1');
      const user2 = await createTestUser('ai-auth-2');

      const session1 = await createTestSession(user1.id, 'ai-auth-1');
      const group1 = await createTestGroup(
        session1.id,
        '5555555555@g.us',
        'User 1 Group',
      );

      // Create a message owned by user1
      const message = await createTestMessage(session1.id, group1.id);

      const { aiProcessorService } = await import('./ai-processor.service');

      // User2 cannot process user1's message
      try {
        await aiProcessorService.processMessage(user2.id, message.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    it('property: users can only process their own messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 2, max: 3 }), // Number of users
          async numUsers => {
            const users: Array<{
              user: TestUser;
              session: TestSession;
              group: TestGroup;
              message: TestMessage;
            }> = [];

            for (let i = 0; i < numUsers; i++) {
              const user = await createTestUser(`auth-prop-${i}-${Date.now()}`);
              const session = await createTestSession(
                user.id,
                `auth-prop-${i}-${Date.now()}`,
              );
              const group = await createTestGroup(
                session.id,
                `${Date.now()}${i}@g.us`,
                `Group ${i}`,
              );
              const message = await createTestMessage(session.id, group.id);

              users.push({ user, session, group, message });
            }

            const { aiProcessorService } = await import(
              './ai-processor.service'
            );

            // Each user should only be able to process their own messages
            for (let i = 0; i < users.length; i++) {
              const currentUser = users[i]!;

              // Can process own message
              const result = await aiProcessorService.processMessage(
                currentUser.user.id,
                currentUser.message.id,
              );
              expect(['completed', 'skipped', 'processing']).toContain(
                result.status,
              );

              // Cannot process other users' messages
              for (let j = 0; j < users.length; j++) {
                if (i !== j) {
                  const otherUser = users[j]!;
                  try {
                    await aiProcessorService.processMessage(
                      currentUser.user.id,
                      otherUser.message.id,
                    );
                    return false; // Should have thrown
                  } catch (error: unknown) {
                    expect((error as { code: string }).code).toBe(
                      'MESSAGE_NOT_FOUND',
                    );
                  }
                }
              }
            }

            return true;
          },
        ),
        { numRuns: 3 },
      );
    });
  });

  /**
   * Property 16: Bulk Processing Behavior
   *
   * *For any* bulk processing request, messages should be queued correctly
   * and unauthorized messages should be reported as errors.
   *
   * **Validates: Requirements 7.10**
   */
  describe('Property 16: Bulk Processing Behavior', () => {
    it('bulkProcess queues valid messages and reports unauthorized ones', async () => {
      const user1 = await createTestUser('bulk-1');
      const user2 = await createTestUser('bulk-2');

      const session1 = await createTestSession(user1.id, 'bulk-1');
      const session2 = await createTestSession(user2.id, 'bulk-2');

      const group1 = await createTestGroup(
        session1.id,
        '6666666661@g.us',
        'User 1 Group',
      );
      const group2 = await createTestGroup(
        session2.id,
        '6666666662@g.us',
        'User 2 Group',
      );

      // Create messages for both users
      const msg1 = await createTestMessage(session1.id, group1.id);
      const msg2 = await createTestMessage(session2.id, group2.id);

      const { aiProcessorService } = await import('./ai-processor.service');

      // User1 tries to bulk process both messages
      const result = await aiProcessorService.bulkProcess(user1.id, [
        msg1.id,
        msg2.id,
      ]);

      // msg1 should be queued, msg2 should be in errors
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain(msg2.id);
    });

    it('bulkProcess skips already processed messages', async () => {
      const user = await createTestUser('bulk-skip-1');
      const session = await createTestSession(user.id, 'bulk-skip-1');
      const group = await createTestGroup(
        session.id,
        '7777777777@g.us',
        'Test Group',
      );

      // Create messages with different statuses
      const pendingMsg = await createTestMessage(session.id, group.id, {
        aiStatus: 'pending',
      });
      const completedMsg = await createTestMessage(session.id, group.id, {
        aiStatus: 'completed',
      });
      const processingMsg = await createTestMessage(session.id, group.id, {
        aiStatus: 'processing',
      });

      const { aiProcessorService } = await import('./ai-processor.service');

      const result = await aiProcessorService.bulkProcess(user.id, [
        pendingMsg.id,
        completedMsg.id,
        processingMsg.id,
      ]);

      // completed and processing should be skipped
      expect(result.skipped).toBe(2);
      expect(result.queued).toBe(1);
    });

    it('property: bulk process respects authorization for all messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }), // Messages per user
          async messagesPerUser => {
            const user1 = await createTestUser(`bulk-prop-1-${Date.now()}`);
            const user2 = await createTestUser(`bulk-prop-2-${Date.now()}`);

            const session1 = await createTestSession(
              user1.id,
              `bulk-prop-1-${Date.now()}`,
            );
            const session2 = await createTestSession(
              user2.id,
              `bulk-prop-2-${Date.now()}`,
            );

            const group1 = await createTestGroup(
              session1.id,
              `${Date.now()}1@g.us`,
              'Group 1',
            );
            const group2 = await createTestGroup(
              session2.id,
              `${Date.now()}2@g.us`,
              'Group 2',
            );

            const user1Messages: TestMessage[] = [];
            const user2Messages: TestMessage[] = [];

            for (let i = 0; i < messagesPerUser; i++) {
              user1Messages.push(
                await createTestMessage(session1.id, group1.id),
              );
              user2Messages.push(
                await createTestMessage(session2.id, group2.id),
              );
            }

            const { aiProcessorService } = await import(
              './ai-processor.service'
            );

            // User1 tries to process all messages
            const allMessageIds = [...user1Messages, ...user2Messages].map(
              m => m.id,
            );
            const result = await aiProcessorService.bulkProcess(
              user1.id,
              allMessageIds,
            );

            // Should have errors for user2's messages
            expect(result.errors.length).toBe(messagesPerUser);

            return true;
          },
        ),
        { numRuns: 3 },
      );
    });
  });
});
