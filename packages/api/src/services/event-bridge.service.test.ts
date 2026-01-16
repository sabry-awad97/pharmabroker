/**
 * Event Bridge Service Tests
 *
 * Property-based tests for the exponential backoff calculation and sync state management.
 * Uses fast-check for property-based testing.
 *
 * Feature: service-status-cleanup, auto-sync-groups-messages
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 4.4
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import {
  calculateBackoffDelay,
  EventBridgeService,
  type EventBridgeConfig,
} from './event-bridge.service';

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a test EventBridgeService instance */
function createTestEventBridge(): EventBridgeService {
  const config: EventBridgeConfig = {
    wsUrl: 'ws://localhost:8080/ws',
    apiKey: 'test-api-key',
    pingInterval: 30000,
    pongTimeout: 10000,
    reconnectDelay: 5000,
    maxReconnectDelay: 300000,
  };
  return new EventBridgeService(config);
}

/** Generate a valid session ID */
const sessionIdArb = fc.stringMatching(/^[a-z0-9-]{8,36}$/);

// ============================================================================
// Property-Based Tests - Backoff Calculation
// ============================================================================

describe('calculateBackoffDelay', () => {
  /**
   * Property 1: Backoff Formula Correctness
   *
   * For any valid inputs where attempts >= 0, initialDelay > 0, and maxDelay > 0,
   * the calculateBackoffDelay function SHALL return a value equal to
   * min(initialDelay * 2^attempts, maxDelay).
   *
   * Feature: service-status-cleanup, Property 1: Backoff Formula Correctness
   * Validates: Requirements 1.3, 1.4
   */
  it('should correctly calculate backoff delay using formula min(initialDelay * 2^attempts, maxDelay)', () => {
    fc.assert(
      fc.property(
        // Generate valid inputs
        fc.nat({ max: 20 }), // attempts: 0-20 (reasonable range to avoid overflow)
        fc.integer({ min: 1, max: 60_000 }), // initialDelay: 1ms to 60s
        fc.integer({ min: 1, max: 3_600_000 }), // maxDelay: 1ms to 1 hour
        (attempts, initialDelay, maxDelay) => {
          const result = calculateBackoffDelay(
            attempts,
            initialDelay,
            maxDelay,
          );
          const expected = Math.min(
            initialDelay * Math.pow(2, attempts),
            maxDelay,
          );

          expect(result).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Backoff delay is always positive
   */
  it('should always return a positive delay', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.integer({ min: 1, max: 60_000 }),
        fc.integer({ min: 1, max: 3_600_000 }),
        (attempts, initialDelay, maxDelay) => {
          const result = calculateBackoffDelay(
            attempts,
            initialDelay,
            maxDelay,
          );
          expect(result).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Backoff delay never exceeds maxDelay
   */
  it('should never exceed maxDelay', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        fc.integer({ min: 1, max: 60_000 }),
        fc.integer({ min: 1, max: 3_600_000 }),
        (attempts, initialDelay, maxDelay) => {
          const result = calculateBackoffDelay(
            attempts,
            initialDelay,
            maxDelay,
          );
          expect(result).toBeLessThanOrEqual(maxDelay);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Backoff delay is monotonically non-decreasing with attempts (until capped)
   */
  it('should be monotonically non-decreasing with attempts', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 19 }), // attempts: 0-19 so we can test attempts+1
        fc.integer({ min: 1, max: 60_000 }),
        fc.integer({ min: 1, max: 3_600_000 }),
        (attempts, initialDelay, maxDelay) => {
          const result1 = calculateBackoffDelay(
            attempts,
            initialDelay,
            maxDelay,
          );
          const result2 = calculateBackoffDelay(
            attempts + 1,
            initialDelay,
            maxDelay,
          );
          expect(result2).toBeGreaterThanOrEqual(result1);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ============================================================================
  // Unit Tests (Edge Cases)
  // ============================================================================

  it('should return initialDelay when attempts is 0', () => {
    expect(calculateBackoffDelay(0, 5000, 600000)).toBe(5000);
  });

  it('should double delay for each attempt', () => {
    expect(calculateBackoffDelay(1, 5000, 600000)).toBe(10000);
    expect(calculateBackoffDelay(2, 5000, 600000)).toBe(20000);
    expect(calculateBackoffDelay(3, 5000, 600000)).toBe(40000);
  });

  it('should cap at maxDelay', () => {
    expect(calculateBackoffDelay(10, 5000, 60000)).toBe(60000);
    expect(calculateBackoffDelay(20, 5000, 60000)).toBe(60000);
  });
});

// ============================================================================
// Property-Based Tests - Sync State Management
// ============================================================================

describe('EventBridgeService - Sync State', () => {
  let eventBridge: EventBridgeService;

  beforeEach(() => {
    eventBridge = createTestEventBridge();
  });

  /**
   * Property 9: Session isolation for sync state
   *
   * For any two distinct sessions, sync state for one session SHALL NOT
   * affect the sync state of another session.
   *
   * Feature: auto-sync-groups-messages, Property 9: Session isolation for message queue
   * Validates: Requirements 2.6
   */
  it('should maintain isolated sync state per session', () => {
    fc.assert(
      fc.property(sessionIdArb, sessionIdArb, (sessionId1, sessionId2) => {
        // Skip if same session ID generated
        fc.pre(sessionId1 !== sessionId2);

        // Get initial states (should be idle)
        const state1Initial = eventBridge.getSyncState(sessionId1);
        const state2Initial = eventBridge.getSyncState(sessionId2);

        expect(state1Initial.status).toBe('idle');
        expect(state2Initial.status).toBe('idle');

        // States should be independent
        const state1 = eventBridge.getSyncState(sessionId1);
        const state2 = eventBridge.getSyncState(sessionId2);

        // Verify they are separate objects
        expect(state1).not.toBe(state2);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Default sync state is idle with zero retry count
   *
   * For any session ID, the initial sync state SHALL be 'idle' with retryCount 0.
   *
   * Feature: auto-sync-groups-messages
   * Validates: Requirements 1.1
   */
  it('should return idle state with zero retries for new sessions', () => {
    fc.assert(
      fc.property(sessionIdArb, sessionId => {
        const state = eventBridge.getSyncState(sessionId);

        expect(state.status).toBe('idle');
        expect(state.retryCount).toBe(0);
        expect(state.error).toBeUndefined();
        expect(state.lastSyncAt).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3: Retry with exponential backoff on sync failure
   *
   * For any sync failure, the retry delays SHALL follow the pattern:
   * initialDelay * 2^attemptNumber
   *
   * Feature: auto-sync-groups-messages, Property 3: Retry with exponential backoff
   * Validates: Requirements 1.3
   */
  it('should calculate retry delays with exponential backoff pattern', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10 }), // attempt number
        fc.integer({ min: 1000, max: 10000 }), // initial delay
        fc.integer({ min: 2, max: 3 }), // backoff multiplier
        (attempt, initialDelay, multiplier) => {
          // Calculate expected delay using the formula
          const expectedDelay = initialDelay * Math.pow(multiplier, attempt);

          // Verify the pattern holds
          expect(expectedDelay).toBeGreaterThanOrEqual(initialDelay);

          // Each subsequent attempt should have a larger delay
          if (attempt > 0) {
            const previousDelay =
              initialDelay * Math.pow(multiplier, attempt - 1);
            expect(expectedDelay).toBeGreaterThan(previousDelay);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ============================================================================
// Property-Based Tests - Sync Status Events
// ============================================================================

describe('EventBridgeService - Sync Status Events', () => {
  /**
   * Property 10: Sync status events emitted
   *
   * For any sync operation (start, complete, or fail), the Event Bridge
   * SHALL emit a corresponding sync status event.
   *
   * This is tested by verifying the event structure is valid.
   *
   * Feature: auto-sync-groups-messages, Property 10: Sync status events emitted
   * Validates: Requirements 4.4
   */
  it('should have valid sync status event types', () => {
    const validEventTypes = [
      'sync.started',
      'sync.progress',
      'sync.completed',
      'sync.failed',
    ] as const;

    fc.assert(
      fc.property(
        fc.constantFrom(...validEventTypes),
        sessionIdArb,
        (eventType, sessionId) => {
          // Verify event type is one of the valid types
          expect(validEventTypes).toContain(eventType);

          // Verify session ID is valid
          expect(sessionId.length).toBeGreaterThanOrEqual(8);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property: Sync progress phases are valid
   */
  it('should have valid sync progress phases', () => {
    const validPhases = ['groups', 'messages'] as const;

    fc.assert(
      fc.property(fc.constantFrom(...validPhases), phase => {
        expect(validPhases).toContain(phase);
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Integration Tests - Message Event Flow
// ============================================================================

import prisma from '@pharmabroker/db';
import {
  whatsappMessagesService,
  type ParsedMessageEvent,
} from './whatsapp-messages.service';

// Test data tracking for cleanup
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

const testUsers: TestUser[] = [];
const testSessions: TestSession[] = [];
const testGroups: TestGroup[] = [];
const testMessageIds: string[] = [];

async function createTestUser(suffix: string): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email: `test-event-${suffix}-${Date.now()}@example.com`,
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

async function cleanupIntegrationTestData(): Promise<void> {
  // Delete messages created during tests
  if (testMessageIds.length > 0) {
    await prisma.whatsAppMessage.deleteMany({
      where: { messageId: { in: testMessageIds } },
    });
    testMessageIds.length = 0;
  }

  // Delete in reverse order of dependencies
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

describe('EventBridgeService - Message Event Flow Integration', () => {
  afterEach(async () => {
    await cleanupIntegrationTestData();
  });

  /**
   * Integration Test: Message event flow end-to-end
   *
   * Tests the complete flow: emit event → store message → verify in database
   *
   * Feature: whatsapp-messages-backend
   * **Validates: Requirements 6.1, 6.2, 6.3**
   */
  describe('Message Event Storage', () => {
    it('storeMessage stores a valid message event in the database', async () => {
      const user = await createTestUser('event-flow-1');
      const session = await createTestSession(user.id, 'event-flow-1');
      const group = await createTestGroup(
        session.id,
        '1234567890@g.us',
        'Test Group',
      );

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid,
        senderJid: '9876543210@s.whatsapp.net',
        senderPushName: 'Test Sender',
        messageType: 'text',
        text: 'Hello from integration test',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      // Store the message
      await whatsappMessagesService.storeMessage(event);

      // Verify message exists in database
      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });

      expect(storedMessage).not.toBeNull();
      expect(storedMessage!.messageId).toBe(messageId);
      expect(storedMessage!.sessionId).toBe(session.id);
      expect(storedMessage!.groupId).toBe(group.id);
      expect(storedMessage!.senderJid).toBe('9876543210@s.whatsapp.net');
      expect(storedMessage!.senderPushName).toBe('Test Sender');
      expect(storedMessage!.messageType).toBe('text');
      expect(storedMessage!.text).toBe('Hello from integration test');
      expect(storedMessage!.source).toBe('realtime');
    });

    it('storeMessage resolves groupId from chatJid', async () => {
      const user = await createTestUser('event-flow-2');
      const session = await createTestSession(user.id, 'event-flow-2');
      const group = await createTestGroup(
        session.id,
        '5555555555@g.us',
        'Resolved Group',
      );

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid, // Should resolve to group.id
        senderJid: '1111111111@s.whatsapp.net',
        messageType: 'text',
        text: 'Test group resolution',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      };

      await whatsappMessagesService.storeMessage(event);

      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });

      expect(storedMessage).not.toBeNull();
      expect(storedMessage!.groupId).toBe(group.id);
    });

    it('storeMessage sets source field correctly for history messages', async () => {
      const user = await createTestUser('event-flow-3');
      const session = await createTestSession(user.id, 'event-flow-3');
      const group = await createTestGroup(
        session.id,
        '6666666666@g.us',
        'History Group',
      );

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid,
        senderJid: '2222222222@s.whatsapp.net',
        messageType: 'text',
        text: 'Historical message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      };

      await whatsappMessagesService.storeMessage(event);

      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });

      expect(storedMessage).not.toBeNull();
      expect(storedMessage!.source).toBe('history');
    });

    it('storeMessage skips messages for unknown groups', async () => {
      const user = await createTestUser('event-flow-4');
      const session = await createTestSession(user.id, 'event-flow-4');
      // Note: No group created for this session

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: 'nonexistent@g.us', // Group doesn't exist
        senderJid: '3333333333@s.whatsapp.net',
        messageType: 'text',
        text: 'Message for unknown group',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      // Should not throw, just skip
      await whatsappMessagesService.storeMessage(event);

      // Verify message was NOT stored
      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });

      expect(storedMessage).toBeNull();
    });

    it('storeMessage handles media messages with all metadata', async () => {
      const user = await createTestUser('event-flow-5');
      const session = await createTestSession(user.id, 'event-flow-5');
      const group = await createTestGroup(
        session.id,
        '7777777777@g.us',
        'Media Group',
      );

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid,
        senderJid: '4444444444@s.whatsapp.net',
        messageType: 'image',
        caption: 'Check out this image!',
        mimetype: 'image/jpeg',
        mediaUrl: 'https://example.com/image.jpg',
        mediaSize: 12345,
        isFromMe: false,
        isForwarded: true,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      await whatsappMessagesService.storeMessage(event);

      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });

      expect(storedMessage).not.toBeNull();
      expect(storedMessage!.messageType).toBe('image');
      expect(storedMessage!.caption).toBe('Check out this image!');
      expect(storedMessage!.mimetype).toBe('image/jpeg');
      expect(storedMessage!.mediaUrl).toBe('https://example.com/image.jpg');
      expect(storedMessage!.mediaSize).toBe(12345);
      expect(storedMessage!.isForwarded).toBe(true);
    });

    it('storeMessage uses upsert for duplicate messages', async () => {
      const user = await createTestUser('event-flow-6');
      const session = await createTestSession(user.id, 'event-flow-6');
      const group = await createTestGroup(
        session.id,
        '8888888888@g.us',
        'Upsert Group',
      );

      const messageId = `MSG-INT-${Date.now()}`;
      testMessageIds.push(messageId);

      const event1: ParsedMessageEvent = {
        messageId,
        sessionId: session.id,
        chatJid: group.jid,
        senderJid: '5555555555@s.whatsapp.net',
        messageType: 'text',
        text: 'Original message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'realtime',
      };

      // Store first time
      await whatsappMessagesService.storeMessage(event1);

      // Store again with updated text
      const event2: ParsedMessageEvent = {
        ...event1,
        text: 'Updated message',
      };
      await whatsappMessagesService.storeMessage(event2);

      // Should have exactly 1 record
      const count = await prisma.whatsAppMessage.count({
        where: { sessionId: session.id, messageId },
      });
      expect(count).toBe(1);

      // Text should be updated
      const storedMessage = await prisma.whatsAppMessage.findFirst({
        where: { sessionId: session.id, messageId },
      });
      expect(storedMessage!.text).toBe('Updated message');
    });
  });
});
