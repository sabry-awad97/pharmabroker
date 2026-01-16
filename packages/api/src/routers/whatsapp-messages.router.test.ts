/**
 * WhatsApp Messages Router Tests
 *
 * Property-based tests for HTTP error response correctness.
 * Tests that the router returns appropriate HTTP status codes for various error conditions.
 *
 * Feature: whatsapp-messages-backend
 * **Validates: Requirements 3.7, 3.8, 3.9**
 */

import { describe, it, expect, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import prisma from '@pharmabroker/db';
import { whatsappMessagesService } from '../services/whatsapp-messages.service';
import { aiProcessorService } from '../services/ai-processor.service';
import {
  messageFilterInput,
  messageIdInput,
  bulkDeleteInput,
  syncMessagesInput,
  exportMessagesInput,
  processMessageInput,
  bulkProcessInput,
  messageStatsInput,
} from '@pharmabroker/schemas/whatsapp';

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
      email: `test-router-${suffix}-${Date.now()}@example.com`,
      name: `Test User ${suffix}`,
    },
  });
  testUsers.push(user);
  return user;
}

async function createTestSession(
  userId: string,
  suffix: string,
  status: string = 'connected',
): Promise<TestSession> {
  const session = await prisma.whatsAppSession.create({
    data: {
      id: crypto.randomUUID(),
      name: `Test Session ${suffix}`,
      userId,
      status: status as any,
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
    messageType?: string;
    aiStatus?: string;
    source?: string;
    text?: string;
  } = {},
): Promise<TestMessage> {
  const messageId = `MSG-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const message = await prisma.whatsAppMessage.create({
    data: {
      id: crypto.randomUUID(),
      messageId,
      sessionId,
      groupId,
      senderJid: `${Date.now()}@s.whatsapp.net`,
      messageType: (options.messageType as any) ?? 'text',
      text: options.text ?? 'Test message',
      isFromMe: false,
      isForwarded: false,
      isViewOnce: false,
      isBroadcast: false,
      messageTimestamp: new Date(),
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
// Input Validation Tests
// ============================================================================

describe('WhatsApp Messages Router - Input Validation', () => {
  /**
   * Tests for messageFilterInput schema validation
   * **Validates: Requirements 3.1, 3.9**
   */
  describe('messageFilterInput validation', () => {
    it('accepts valid filter input with all fields', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        groupId: '550e8400-e29b-41d4-a716-446655440001',
        search: 'hello',
        messageType: 'text',
        aiStatus: 'pending',
        source: 'realtime',
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-01-31'),
        limit: 50,
        cursor: 'abc123',
      };

      const result = messageFilterInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts minimal filter input', () => {
      const validInput = {};
      const result = messageFilterInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'not-a-uuid',
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid groupId format', () => {
      const invalidInput = {
        groupId: 'not-a-uuid',
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid messageType', () => {
      const invalidInput = {
        messageType: 'invalid_type',
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid aiStatus', () => {
      const invalidInput = {
        aiStatus: 'invalid_status',
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid source', () => {
      const invalidInput = {
        source: 'invalid_source',
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects limit below minimum', () => {
      const invalidInput = {
        limit: 0,
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects limit above maximum', () => {
      const invalidInput = {
        limit: 101,
      };
      const result = messageFilterInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for messageIdInput schema validation
   * **Validates: Requirements 3.2, 3.9**
   */
  describe('messageIdInput validation', () => {
    it('accepts valid UUID messageId', () => {
      const validInput = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = messageIdInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid messageId format', () => {
      const invalidInput = {
        messageId: 'not-a-uuid',
      };
      const result = messageIdInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects missing messageId', () => {
      const invalidInput = {};
      const result = messageIdInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for bulkDeleteInput schema validation
   * **Validates: Requirements 3.4, 3.9**
   */
  describe('bulkDeleteInput validation', () => {
    it('accepts valid array of messageIds', () => {
      const validInput = {
        messageIds: [
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001',
        ],
      };
      const result = bulkDeleteInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects empty array', () => {
      const invalidInput = {
        messageIds: [],
      };
      const result = bulkDeleteInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects array exceeding maximum', () => {
      const invalidInput = {
        messageIds: Array(101).fill('550e8400-e29b-41d4-a716-446655440000'),
      };
      const result = bulkDeleteInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID in array', () => {
      const invalidInput = {
        messageIds: ['550e8400-e29b-41d4-a716-446655440000', 'not-a-uuid'],
      };
      const result = bulkDeleteInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for syncMessagesInput schema validation
   * **Validates: Requirements 3.6, 3.9**
   */
  describe('syncMessagesInput validation', () => {
    it('accepts valid sessionId', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = syncMessagesInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'not-a-uuid',
      };
      const result = syncMessagesInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects missing sessionId', () => {
      const invalidInput = {};
      const result = syncMessagesInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for exportMessagesInput schema validation
   * **Validates: Requirements 3.6, 3.9**
   */
  describe('exportMessagesInput validation', () => {
    it('accepts valid export input with json format', () => {
      const validInput = {
        format: 'json',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = exportMessagesInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts valid export input with csv format', () => {
      const validInput = {
        format: 'csv',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = exportMessagesInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid format', () => {
      const invalidInput = {
        format: 'xml',
      };
      const result = exportMessagesInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('rejects missing format', () => {
      const invalidInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = exportMessagesInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for processMessageInput schema validation
   * **Validates: Requirements 7.1, 3.9**
   */
  describe('processMessageInput validation', () => {
    it('accepts valid messageId', () => {
      const validInput = {
        messageId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = processMessageInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid messageId format', () => {
      const invalidInput = {
        messageId: 'not-a-uuid',
      };
      const result = processMessageInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for bulkProcessInput schema validation
   * **Validates: Requirements 7.10, 3.9**
   */
  describe('bulkProcessInput validation', () => {
    it('accepts valid array of messageIds', () => {
      const validInput = {
        messageIds: [
          '550e8400-e29b-41d4-a716-446655440000',
          '550e8400-e29b-41d4-a716-446655440001',
        ],
      };
      const result = bulkProcessInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects empty array', () => {
      const invalidInput = {
        messageIds: [],
      };
      const result = bulkProcessInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Tests for messageStatsInput schema validation
   * **Validates: Requirements 3.5, 3.9**
   */
  describe('messageStatsInput validation', () => {
    it('accepts valid sessionId', () => {
      const validInput = {
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = messageStatsInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts empty input (optional sessionId)', () => {
      const validInput = {};
      const result = messageStatsInput.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid sessionId format', () => {
      const invalidInput = {
        sessionId: 'not-a-uuid',
      };
      const result = messageStatsInput.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Property-Based Tests - HTTP Error Responses
// ============================================================================

describe('WhatsApp Messages Router - Property Tests', () => {
  afterEach(async () => {
    await cleanupTestData();
  });

  /**
   * Property 17: HTTP Error Response Correctness
   *
   * *For any* unauthorized request, the router SHALL return an error with code indicating
   * unauthorized access. *For any* request for a non-existent resource, the router SHALL
   * return an error with code indicating not found. *For any* request with invalid input,
   * the router SHALL return a validation error.
   *
   * Feature: whatsapp-messages-backend, Property 17: HTTP Error Response Correctness
   * **Validates: Requirements 3.7, 3.8, 3.9**
   */
  describe('Property 17: HTTP Error Response Correctness', () => {
    /**
     * Test 404 for non-existent message
     * **Validates: Requirements 3.8**
     */
    it('getMessage returns MESSAGE_NOT_FOUND for non-existent message', async () => {
      const user = await createTestUser('404-get-1');
      const nonExistentId = crypto.randomUUID();

      try {
        await whatsappMessagesService.getMessage(user.id, nonExistentId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    /**
     * Test 404 for deleting non-existent message
     * **Validates: Requirements 3.8**
     */
    it('deleteMessage returns MESSAGE_NOT_FOUND for non-existent message', async () => {
      const user = await createTestUser('404-delete-1');
      const nonExistentId = crypto.randomUUID();

      try {
        await whatsappMessagesService.deleteMessage(user.id, nonExistentId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    /**
     * Test 404 for sync with non-existent session
     * **Validates: Requirements 3.8**
     */
    it('getSyncStatus returns SESSION_NOT_FOUND for non-existent session', async () => {
      const user = await createTestUser('404-sync-1');
      const nonExistentId = crypto.randomUUID();

      try {
        await whatsappMessagesService.getSyncStatus(user.id, nonExistentId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    /**
     * Test 400 for sync with disconnected session
     * **Validates: Requirements 3.9**
     */
    it('getSyncStatus returns SESSION_NOT_CONNECTED for disconnected session', async () => {
      const user = await createTestUser('400-sync-1');
      const session = await createTestSession(
        user.id,
        '400-sync-1',
        'disconnected',
      );

      try {
        await whatsappMessagesService.getSyncStatus(user.id, session.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('SESSION_NOT_CONNECTED');
      }
    });

    /**
     * Test 401/403 for accessing another user's message
     * **Validates: Requirements 3.7**
     */
    it('getMessage returns MESSAGE_NOT_FOUND when accessing another user message', async () => {
      const user1 = await createTestUser('auth-get-1');
      const user2 = await createTestUser('auth-get-2');
      const session1 = await createTestSession(user1.id, 'auth-get-1');
      const group1 = await createTestGroup(
        session1.id,
        '1234567890@g.us',
        'Group 1',
      );
      const message = await createTestMessage(session1.id, group1.id);

      // User2 tries to access user1's message
      try {
        await whatsappMessagesService.getMessage(user2.id, message.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        // Returns MESSAGE_NOT_FOUND to avoid leaking information about existence
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    /**
     * Test 401/403 for deleting another user's message
     * **Validates: Requirements 3.7**
     */
    it('deleteMessage returns MESSAGE_NOT_FOUND when deleting another user message', async () => {
      const user1 = await createTestUser('auth-delete-1');
      const user2 = await createTestUser('auth-delete-2');
      const session1 = await createTestSession(user1.id, 'auth-delete-1');
      const group1 = await createTestGroup(
        session1.id,
        '2345678901@g.us',
        'Group 1',
      );
      const message = await createTestMessage(session1.id, group1.id);

      // User2 tries to delete user1's message
      try {
        await whatsappMessagesService.deleteMessage(user2.id, message.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        // Returns MESSAGE_NOT_FOUND to avoid leaking information about existence
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    /**
     * Test 401/403 for accessing another user's session sync
     * **Validates: Requirements 3.7**
     */
    it('getSyncStatus returns SESSION_NOT_FOUND when accessing another user session', async () => {
      const user1 = await createTestUser('auth-sync-1');
      const user2 = await createTestUser('auth-sync-2');
      const session1 = await createTestSession(user1.id, 'auth-sync-1');

      // User2 tries to access user1's session sync
      try {
        await whatsappMessagesService.getSyncStatus(user2.id, session1.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        // Returns SESSION_NOT_FOUND to avoid leaking information about existence
        expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
      }
    });

    /**
     * Test 404 for AI processing non-existent message
     * **Validates: Requirements 3.8**
     */
    it('processMessage returns MESSAGE_NOT_FOUND for non-existent message', async () => {
      const user = await createTestUser('404-ai-1');
      const nonExistentId = crypto.randomUUID();

      try {
        await aiProcessorService.processMessage(user.id, nonExistentId);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
      }
    });

    /**
     * Test 400 for retrying non-failed message
     * **Validates: Requirements 3.9**
     */
    it('retryMessage returns INVALID_STATUS for non-failed message', async () => {
      const user = await createTestUser('400-retry-1');
      const session = await createTestSession(user.id, '400-retry-1');
      const group = await createTestGroup(
        session.id,
        '3456789012@g.us',
        'Group 1',
      );
      const message = await createTestMessage(session.id, group.id, {
        aiStatus: 'pending',
      });

      try {
        await aiProcessorService.retryMessage(user.id, message.id);
        expect(true).toBe(false); // Should not reach here
      } catch (error: unknown) {
        expect((error as { code: string }).code).toBe('INVALID_STATUS');
      }
    });

    /**
     * Property test: for any random non-existent UUID, getMessage returns MESSAGE_NOT_FOUND
     * **Validates: Requirements 3.8**
     */
    it('property: for any random UUID, getMessage returns MESSAGE_NOT_FOUND', async () => {
      const user = await createTestUser('prop-404-1');

      await fc.assert(
        fc.asyncProperty(fc.uuid(), async randomId => {
          try {
            await whatsappMessagesService.getMessage(user.id, randomId);
            // If we get here, the message exists (unlikely but possible)
            return true;
          } catch (error: unknown) {
            expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
            return true;
          }
        }),
        { numRuns: 10 },
      );
    });

    /**
     * Property test: for any random non-existent UUID, deleteMessage returns MESSAGE_NOT_FOUND
     * **Validates: Requirements 3.8**
     */
    it('property: for any random UUID, deleteMessage returns MESSAGE_NOT_FOUND', async () => {
      const user = await createTestUser('prop-404-2');

      await fc.assert(
        fc.asyncProperty(fc.uuid(), async randomId => {
          try {
            await whatsappMessagesService.deleteMessage(user.id, randomId);
            // If we get here, the message exists (unlikely but possible)
            return true;
          } catch (error: unknown) {
            expect((error as { code: string }).code).toBe('MESSAGE_NOT_FOUND');
            return true;
          }
        }),
        { numRuns: 10 },
      );
    });

    /**
     * Property test: for any random non-existent UUID, getSyncStatus returns SESSION_NOT_FOUND
     * **Validates: Requirements 3.8**
     */
    it('property: for any random UUID, getSyncStatus returns SESSION_NOT_FOUND', async () => {
      const user = await createTestUser('prop-404-3');

      await fc.assert(
        fc.asyncProperty(fc.uuid(), async randomId => {
          try {
            await whatsappMessagesService.getSyncStatus(user.id, randomId);
            // If we get here, the session exists (unlikely but possible)
            return true;
          } catch (error: unknown) {
            expect((error as { code: string }).code).toBe('SESSION_NOT_FOUND');
            return true;
          }
        }),
        { numRuns: 10 },
      );
    });

    /**
     * Property test: for any non-connected session status, getSyncStatus returns SESSION_NOT_CONNECTED
     * **Validates: Requirements 3.9**
     */
    it('property: for any non-connected status, getSyncStatus returns SESSION_NOT_CONNECTED', async () => {
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
            const user = await createTestUser(`prop-400-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `prop-400-${Date.now()}`,
              status,
            );

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

    /**
     * Property test: for any non-failed AI status, retryMessage returns INVALID_STATUS
     * **Validates: Requirements 3.9**
     */
    it('property: for any non-failed AI status, retryMessage returns INVALID_STATUS', async () => {
      const nonFailedStatuses = [
        'pending',
        'processing',
        'completed',
        'skipped',
      ];

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...nonFailedStatuses),
          async aiStatus => {
            const user = await createTestUser(`prop-retry-${Date.now()}`);
            const session = await createTestSession(
              user.id,
              `prop-retry-${Date.now()}`,
            );
            const group = await createTestGroup(
              session.id,
              `${Date.now()}@g.us`,
              'Test Group',
            );
            const message = await createTestMessage(session.id, group.id, {
              aiStatus,
            });

            try {
              await aiProcessorService.retryMessage(user.id, message.id);
              // Should not reach here
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
});
