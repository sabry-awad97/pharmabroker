/**
 * Message Queue Service Tests
 *
 * Property-based tests for the message queue service.
 * Tests verify queue behavior, timeout handling, and session isolation.
 *
 * Feature: auto-sync-groups-messages
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fc from 'fast-check';
import {
  MessageQueueService,
  type QueuedMessage,
} from './message-queue.service';
import type { ParsedMessageEvent } from './whatsapp-messages.service';

// ============================================================================
// Arbitraries
// ============================================================================

/** Generate a valid UUID */
const uuidArb = fc.uuid();

/** Generate a valid session ID */
const sessionIdArb = uuidArb;

/** Generate a valid message ID */
const messageIdArb = fc.stringMatching(/^[A-Z0-9]{20,32}$/);

/** Generate a valid JID */
const jidArb = fc.oneof(
  fc.stringMatching(/^\d{10,15}@s\.whatsapp\.net$/),
  fc.stringMatching(/^\d{10,15}-\d{10,15}@g\.us$/),
);

/** Generate a valid message type */
const messageTypeArb = fc.constantFrom(
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contact',
  'poll',
  'reaction',
  'protocol',
  'unknown',
);

/** Generate a valid source */
const sourceArb = fc.constantFrom('realtime', 'history') as fc.Arbitrary<
  'realtime' | 'history'
>;

/** Generate a valid ParsedMessageEvent */
const parsedMessageEventArb: fc.Arbitrary<ParsedMessageEvent> = fc.record({
  messageId: messageIdArb,
  sessionId: sessionIdArb,
  chatJid: jidArb,
  senderJid: jidArb,
  senderPushName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
  messageType: messageTypeArb,
  text: fc.option(fc.string({ minLength: 1, maxLength: 1000 }), { nil: null }),
  caption: fc.option(fc.string({ minLength: 1, maxLength: 500 }), {
    nil: null,
  }),
  filename: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: null,
  }),
  mimetype: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: null,
  }),
  mediaUrl: fc.option(fc.constant('https://example.com/media'), { nil: null }),
  mediaKey: fc.option(
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 32 }),
    { nil: null },
  ),
  mediaSha256: fc.option(
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 1, maxLength: 32 }),
    {
      nil: null,
    },
  ),
  mediaSize: fc.option(fc.integer({ min: 0, max: 100000000 }), { nil: null }),
  latitude: fc.option(fc.double({ min: -90, max: 90, noNaN: true }), {
    nil: null,
  }),
  longitude: fc.option(fc.double({ min: -180, max: 180, noNaN: true }), {
    nil: null,
  }),
  address: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
    nil: null,
  }),
  vcard: fc.option(fc.string({ minLength: 1, maxLength: 1000 }), { nil: null }),
  pollName: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: null,
  }),
  pollOptions: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 50 }), {
      minLength: 2,
      maxLength: 5,
    }),
    { nil: null },
  ),
  reactionEmoji: fc.option(fc.string({ minLength: 1, maxLength: 10 }), {
    nil: null,
  }),
  reactionMessageId: fc.option(messageIdArb, { nil: null }),
  isFromMe: fc.boolean(),
  isForwarded: fc.boolean(),
  isViewOnce: fc.boolean(),
  isBroadcast: fc.boolean(),
  quotedMessageId: fc.option(messageIdArb, { nil: null }),
  messageTimestamp: fc
    .integer({ min: 1577836800000, max: 1893456000000 })
    .map(ts => new Date(ts).toISOString()),
  source: sourceArb,
  rawPayload: fc.option(fc.constant({}), { nil: undefined }),
});

// ============================================================================
// Unit Tests
// ============================================================================

describe('MessageQueueService', () => {
  let service: MessageQueueService;

  beforeEach(() => {
    service = new MessageQueueService({
      messageTimeoutMs: 5 * 60 * 1000, // 5 minutes
      maxMessagesPerSession: 100,
    });
  });

  afterEach(() => {
    service.stopCleanup();
    service.clearAll();
  });

  describe('enqueue', () => {
    it('adds message to queue', () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';
      const event: ParsedMessageEvent = {
        messageId: 'MSG123456789012345678901',
        sessionId,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Hello',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      };

      const result = service.enqueue(sessionId, event);

      expect(result).toBe(true);
      expect(service.size(sessionId)).toBe(1);
    });

    it('drops oldest message when queue is full', () => {
      const smallService = new MessageQueueService({
        messageTimeoutMs: 5 * 60 * 1000,
        maxMessagesPerSession: 3,
      });

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Add 4 messages to a queue with max 3
      for (let i = 0; i < 4; i++) {
        smallService.enqueue(sessionId, {
          messageId: `MSG${i.toString().padStart(20, '0')}`,
          sessionId,
          chatJid: '1234567890-9876543210@g.us',
          senderJid: '1234567890@s.whatsapp.net',
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

      expect(smallService.size(sessionId)).toBe(3);

      // Drain and verify oldest was dropped
      const messages = smallService.drain(sessionId);
      expect(messages.length).toBe(3);
      expect(messages[0].text).toBe('Message 1'); // Message 0 was dropped
    });
  });

  describe('drain', () => {
    it('returns all messages and clears queue', () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      for (let i = 0; i < 5; i++) {
        service.enqueue(sessionId, {
          messageId: `MSG${i.toString().padStart(20, '0')}`,
          sessionId,
          chatJid: '1234567890-9876543210@g.us',
          senderJid: '1234567890@s.whatsapp.net',
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

      const messages = service.drain(sessionId);

      expect(messages.length).toBe(5);
      expect(service.size(sessionId)).toBe(0);
    });

    it('returns empty array for non-existent session', () => {
      const messages = service.drain('non-existent-session');
      expect(messages).toEqual([]);
    });

    it('filters out expired messages', () => {
      const shortTimeoutService = new MessageQueueService({
        messageTimeoutMs: 100, // 100ms timeout
        maxMessagesPerSession: 100,
      });

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Add a message
      shortTimeoutService.enqueue(sessionId, {
        messageId: 'MSG12345678901234567890',
        sessionId,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Old message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      });

      // Wait for timeout
      return new Promise<void>(resolve => {
        setTimeout(() => {
          const messages = shortTimeoutService.drain(sessionId);
          expect(messages.length).toBe(0);
          resolve();
        }, 150);
      });
    });
  });

  describe('cleanup', () => {
    it('removes expired messages from all queues', async () => {
      const shortTimeoutService = new MessageQueueService({
        messageTimeoutMs: 50, // 50ms timeout
        maxMessagesPerSession: 100,
      });

      const session1 = '550e8400-e29b-41d4-a716-446655440001';
      const session2 = '550e8400-e29b-41d4-a716-446655440002';

      // Add messages to both sessions
      shortTimeoutService.enqueue(session1, {
        messageId: 'MSG12345678901234567890',
        sessionId: session1,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Session 1 message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      });

      shortTimeoutService.enqueue(session2, {
        messageId: 'MSG12345678901234567891',
        sessionId: session2,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Session 2 message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      });

      expect(shortTimeoutService.totalSize()).toBe(2);

      // Wait for timeout and cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      const removed = shortTimeoutService.cleanup();

      expect(removed).toBe(2);
      expect(shortTimeoutService.totalSize()).toBe(0);
    });
  });

  describe('session isolation', () => {
    it('keeps messages separate per session', () => {
      const session1 = '550e8400-e29b-41d4-a716-446655440001';
      const session2 = '550e8400-e29b-41d4-a716-446655440002';

      service.enqueue(session1, {
        messageId: 'MSG12345678901234567890',
        sessionId: session1,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Session 1 message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      });

      service.enqueue(session2, {
        messageId: 'MSG12345678901234567891',
        sessionId: session2,
        chatJid: '1234567890-9876543210@g.us',
        senderJid: '1234567890@s.whatsapp.net',
        messageType: 'text',
        text: 'Session 2 message',
        isFromMe: false,
        isForwarded: false,
        isViewOnce: false,
        isBroadcast: false,
        messageTimestamp: new Date().toISOString(),
        source: 'history',
      });

      expect(service.size(session1)).toBe(1);
      expect(service.size(session2)).toBe(1);

      const messages1 = service.drain(session1);
      expect(messages1.length).toBe(1);
      expect(messages1[0].text).toBe('Session 1 message');

      // Session 2 should still have its message
      expect(service.size(session2)).toBe(1);
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  /**
   * Property 4: Unknown group messages are queued
   * For any message arriving for a group that doesn't exist in the database,
   * the message SHALL be added to the session's pending queue.
   *
   * Feature: auto-sync-groups-messages, Property 4: Unknown group messages are queued
   * Validates: Requirements 2.1
   */
  describe('Property 4: Unknown group messages are queued', () => {
    it('all enqueued messages are retrievable via drain', () => {
      fc.assert(
        fc.property(
          sessionIdArb,
          fc.array(parsedMessageEventArb, { minLength: 1, maxLength: 50 }),
          (sessionId, events) => {
            const testService = new MessageQueueService({
              messageTimeoutMs: 60000,
              maxMessagesPerSession: 1000,
            });

            // Enqueue all messages
            for (const event of events) {
              testService.enqueue(sessionId, event);
            }

            // Drain should return all messages
            const drained = testService.drain(sessionId);
            expect(drained.length).toBe(events.length);

            // Queue should be empty after drain
            expect(testService.size(sessionId)).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Queue retains messages until timeout
   * For any queued message, it SHALL remain in the queue until either:
   * (a) it is processed after sync, or (b) the configured timeout expires.
   *
   * Feature: auto-sync-groups-messages, Property 5: Queue retains messages until timeout
   * Validates: Requirements 2.2
   */
  describe('Property 5: Queue retains messages until timeout', () => {
    it('messages remain in queue until drained or expired', () => {
      fc.assert(
        fc.property(
          sessionIdArb,
          fc.array(parsedMessageEventArb, { minLength: 1, maxLength: 20 }),
          (sessionId, events) => {
            const testService = new MessageQueueService({
              messageTimeoutMs: 60000, // Long timeout
              maxMessagesPerSession: 1000,
            });

            // Enqueue all messages
            for (const event of events) {
              testService.enqueue(sessionId, event);
            }

            // Messages should still be there
            expect(testService.size(sessionId)).toBe(events.length);

            // Cleanup should not remove non-expired messages
            const removed = testService.cleanup();
            expect(removed).toBe(0);
            expect(testService.size(sessionId)).toBe(events.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 8: Expired messages discarded
   * For any queued message that exceeds the timeout period,
   * the message SHALL be discarded regardless of sync state.
   *
   * Feature: auto-sync-groups-messages, Property 8: Expired messages discarded
   * Validates: Requirements 2.5
   */
  describe('Property 8: Expired messages discarded', () => {
    it('expired messages are removed during cleanup', async () => {
      const shortTimeoutService = new MessageQueueService({
        messageTimeoutMs: 10, // Very short timeout
        maxMessagesPerSession: 1000,
      });

      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      // Add some messages
      for (let i = 0; i < 5; i++) {
        shortTimeoutService.enqueue(sessionId, {
          messageId: `MSG${i.toString().padStart(20, '0')}`,
          sessionId,
          chatJid: '1234567890-9876543210@g.us',
          senderJid: '1234567890@s.whatsapp.net',
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

      expect(shortTimeoutService.size(sessionId)).toBe(5);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 50));

      // Cleanup should remove all expired messages
      const removed = shortTimeoutService.cleanup();
      expect(removed).toBe(5);
      expect(shortTimeoutService.size(sessionId)).toBe(0);
    });
  });

  /**
   * Property 9: Session isolation for message queue
   * For any two distinct sessions, messages queued for one session
   * SHALL NOT be accessible or processed by the other session.
   *
   * Feature: auto-sync-groups-messages, Property 9: Session isolation for message queue
   * Validates: Requirements 2.6
   */
  describe('Property 9: Session isolation for message queue', () => {
    it('messages from different sessions are isolated', () => {
      fc.assert(
        fc.property(
          sessionIdArb,
          sessionIdArb,
          fc.array(parsedMessageEventArb, { minLength: 1, maxLength: 10 }),
          fc.array(parsedMessageEventArb, { minLength: 1, maxLength: 10 }),
          (session1, session2, events1, events2) => {
            // Skip if sessions are the same
            fc.pre(session1 !== session2);

            const testService = new MessageQueueService({
              messageTimeoutMs: 60000,
              maxMessagesPerSession: 1000,
            });

            // Enqueue messages for both sessions
            for (const event of events1) {
              testService.enqueue(session1, event);
            }
            for (const event of events2) {
              testService.enqueue(session2, event);
            }

            // Verify sizes are independent
            expect(testService.size(session1)).toBe(events1.length);
            expect(testService.size(session2)).toBe(events2.length);

            // Drain session1 should not affect session2
            const drained1 = testService.drain(session1);
            expect(drained1.length).toBe(events1.length);
            expect(testService.size(session1)).toBe(0);
            expect(testService.size(session2)).toBe(events2.length);

            // Session2 messages should still be intact
            const drained2 = testService.drain(session2);
            expect(drained2.length).toBe(events2.length);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
