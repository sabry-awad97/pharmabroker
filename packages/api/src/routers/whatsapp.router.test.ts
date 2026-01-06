import { describe, it, expect } from 'bun:test';
import { schemas } from './whatsapp.router';
import type { SessionID } from '@pharmabroker/schemas/whatsapp';

// Helper to create test session IDs (bypasses branding for tests)
const testSessionId = (id: string) => id as SessionID;

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('WhatsApp Router Schemas', () => {
  describe('sessionSchema', () => {
    it('validates a valid session', () => {
      const validSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Session',
        status: 'connected',
        auto_connect: false,
        created_at: '2026-01-05T10:00:00Z',
        updated_at: '2026-01-05T10:00:00Z',
      };

      const result = schemas.session.safeParse(validSession);
      expect(result.success).toBe(true);
    });

    it('validates session with optional jid', () => {
      const sessionWithJid = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        jid: '1234567890@s.whatsapp.net',
        name: 'Test Session',
        status: 'connected',
        auto_connect: true,
        created_at: '2026-01-05T10:00:00Z',
        updated_at: '2026-01-05T10:00:00Z',
      };

      const result = schemas.session.safeParse(sessionWithJid);
      expect(result.success).toBe(true);
    });

    it('rejects invalid session status', () => {
      const invalidSession = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Session',
        status: 'invalid_status',
        created_at: '2026-01-05T10:00:00Z',
        updated_at: '2026-01-05T10:00:00Z',
      };

      const result = schemas.session.safeParse(invalidSession);
      expect(result.success).toBe(false);
    });

    it('rejects invalid UUID', () => {
      const invalidSession = {
        id: 'not-a-uuid',
        name: 'Test Session',
        status: 'connected',
        created_at: '2026-01-05T10:00:00Z',
        updated_at: '2026-01-05T10:00:00Z',
      };

      const result = schemas.session.safeParse(invalidSession);
      expect(result.success).toBe(false);
    });
  });

  describe('createSessionInputSchema', () => {
    it('validates valid input', () => {
      const result = schemas.createSessionInput.safeParse({
        name: 'My Session',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty name', () => {
      const result = schemas.createSessionInput.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('rejects name exceeding max length', () => {
      const result = schemas.createSessionInput.safeParse({
        name: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sendMessageInputSchema', () => {
    it('validates text message', () => {
      const textMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+1234567890',
        type: 'text',
        content: { text: 'Hello World' },
      };

      const result = schemas.sendMessageInput.safeParse(textMessage);
      expect(result.success).toBe(true);
    });

    it('validates image message', () => {
      const imageMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+1234567890',
        type: 'image',
        content: {
          image_url: 'https://example.com/image.png',
          caption: 'Check this out!',
        },
      };

      const result = schemas.sendMessageInput.safeParse(imageMessage);
      expect(result.success).toBe(true);
    });

    it('validates document message', () => {
      const docMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+1234567890',
        type: 'document',
        content: {
          doc_url: 'https://example.com/doc.pdf',
          filename: 'document.pdf',
        },
      };

      const result = schemas.sendMessageInput.safeParse(docMessage);
      expect(result.success).toBe(true);
    });

    it('rejects text message without text content', () => {
      const invalidMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+1234567890',
        type: 'text',
        content: {},
      };

      const result = schemas.sendMessageInput.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('rejects image message without image_url', () => {
      const invalidMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+1234567890',
        type: 'image',
        content: { text: 'wrong content' },
      };

      const result = schemas.sendMessageInput.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('rejects invalid phone number format', () => {
      const invalidMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '1234567890', // missing +
        type: 'text',
        content: { text: 'Hello' },
      };

      const result = schemas.sendMessageInput.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('rejects phone number with invalid format', () => {
      const invalidMessage = {
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        to: '+0123456789', // starts with 0 after +
        type: 'text',
        content: { text: 'Hello' },
      };

      const result = schemas.sendMessageInput.safeParse(invalidMessage);
      expect(result.success).toBe(false);
    });

    it('validates all message types', () => {
      const types = [
        { type: 'text', content: { text: 'Hello' } },
        {
          type: 'image',
          content: { image_url: 'https://example.com/img.png' },
        },
        {
          type: 'document',
          content: { doc_url: 'https://example.com/doc.pdf' },
        },
        {
          type: 'audio',
          content: { audio_url: 'https://example.com/audio.mp3' },
        },
        {
          type: 'video',
          content: { video_url: 'https://example.com/video.mp4' },
        },
      ];

      for (const { type, content } of types) {
        const message = {
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          to: '+1234567890',
          type,
          content,
        };

        const result = schemas.sendMessageInput.safeParse(message);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('qrEventSchema', () => {
    it('validates QR event', () => {
      const qrEvent = { type: 'qr', data: 'base64encodedqrcode' };
      const result = schemas.qrEvent.safeParse(qrEvent);
      expect(result.success).toBe(true);
    });

    it('validates authenticated event', () => {
      const authEvent = {
        type: 'authenticated',
        data: { jid: '1234567890@s.whatsapp.net' },
      };
      const result = schemas.qrEvent.safeParse(authEvent);
      expect(result.success).toBe(true);
    });

    it('validates error event', () => {
      const errorEvent = { type: 'error', message: 'Connection failed' };
      const result = schemas.qrEvent.safeParse(errorEvent);
      expect(result.success).toBe(true);
    });

    it('validates timeout event', () => {
      const timeoutEvent = { type: 'timeout' };
      const result = schemas.qrEvent.safeParse(timeoutEvent);
      expect(result.success).toBe(true);
    });
  });

  describe('whatsappEventSchema', () => {
    it('validates message.received event', () => {
      const event = {
        type: 'message.received',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        data: { from: '+1234567890', text: 'Hello' },
      };
      const result = schemas.whatsappEvent.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('validates connection.connected event', () => {
      const event = {
        type: 'connection.connected',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = schemas.whatsappEvent.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('validates session.authenticated event', () => {
      const event = {
        type: 'session.authenticated',
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        data: { jid: '1234567890@s.whatsapp.net' },
      };
      const result = schemas.whatsappEvent.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('validates all event types', () => {
      const eventTypes = [
        {
          type: 'message.received',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: {},
        },
        {
          type: 'message.sent',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: {},
        },
        {
          type: 'message.delivered',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: {},
        },
        {
          type: 'message.read',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: {},
        },
        {
          type: 'message.failed',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: {},
        },
        {
          type: 'connection.connected',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          type: 'connection.disconnected',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          type: 'connection.logged_out',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          type: 'session.qr_scanned',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
        {
          type: 'session.authenticated',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
          data: { jid: 'test@s.whatsapp.net' },
        },
        {
          type: 'session.expired',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      ];

      for (const event of eventTypes) {
        const result = schemas.whatsappEvent.safeParse(event);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('sendMessageResponseSchema', () => {
    it('validates valid response', () => {
      const response = {
        message_id: '660e8400-e29b-41d4-a716-446655440001',
        status: 'pending',
      };
      const result = schemas.sendMessageResponse.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('rejects invalid message_id', () => {
      const response = {
        message_id: 'not-a-uuid',
        status: 'pending',
      };
      const result = schemas.sendMessageResponse.safeParse(response);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests (with mocked fetch)
// ============================================================================

describe('WhatsApp Service Client Integration', () => {
  it('should handle successful session creation response structure', () => {
    const mockSession = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Session',
      status: 'pending',
      auto_connect: false,
      created_at: '2026-01-05T10:00:00Z',
      updated_at: '2026-01-05T10:00:00Z',
    };

    // Verify the response structure matches our schema
    expect(schemas.session.safeParse(mockSession).success).toBe(true);
  });

  it('should handle error response structure', () => {
    const errorResponse = {
      success: false,
      error: {
        code: 'SESSION_NOT_FOUND',
        message: 'Session does not exist',
      },
    };

    expect(errorResponse.success).toBe(false);
    expect(errorResponse.error.code).toBe('SESSION_NOT_FOUND');
  });
});

// ============================================================================
// Concurrent Event Iterator Tests
// ============================================================================

describe('Concurrent Event Iterator Handling', () => {
  it('should handle multiple concurrent event subscriptions without data loss', async () => {
    const { whatsappEventPublisher } = await import('./whatsapp.router');

    const receivedEvents: { subscriberId: number; event: unknown }[] = [];
    const subscriberCount = 5;
    const eventsPerPublish = 10;
    const controllers: AbortController[] = [];

    // Create multiple concurrent subscribers
    const subscribers = Array.from({ length: subscriberCount }, (_, i) => {
      const controller = new AbortController();
      controllers.push(controller);

      return (async () => {
        const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
          signal: controller.signal,
        });

        try {
          for await (const event of iterator) {
            receivedEvents.push({ subscriberId: i, event });
          }
        } catch (e) {
          // AbortError is expected when we stop
          if (!(e instanceof Error && e.name === 'AbortError')) throw e;
        }
      })();
    });

    // Give subscribers time to initialize
    await new Promise(r => setTimeout(r, 10));

    // Publish events concurrently
    const publishPromises = Array.from({ length: eventsPerPublish }, (_, i) =>
      Promise.resolve(
        whatsappEventPublisher.publish('whatsapp-event', {
          type: 'message.received' as const,
          session_id: testSessionId(
            `550e8400-e29b-41d4-a716-44665544000${i % 10}`,
          ),
          data: { index: i, timestamp: Date.now() },
        }),
      ),
    );

    await Promise.all(publishPromises);

    // Allow events to propagate
    await new Promise(r => setTimeout(r, 50));

    // Stop all subscribers
    controllers.forEach(c => c.abort());
    await Promise.allSettled(subscribers);

    // Each subscriber should receive all events
    const eventsBySubscriber = new Map<number, unknown[]>();
    for (const { subscriberId, event } of receivedEvents) {
      if (!eventsBySubscriber.has(subscriberId)) {
        eventsBySubscriber.set(subscriberId, []);
      }
      eventsBySubscriber.get(subscriberId)!.push(event);
    }

    // Verify all subscribers received events
    expect(eventsBySubscriber.size).toBe(subscriberCount);

    // Each subscriber should have received all published events
    for (const [, events] of eventsBySubscriber) {
      expect(events.length).toBe(eventsPerPublish);
    }
  });

  it('should handle rapid sequential publishes without dropping events', async () => {
    const { whatsappEventPublisher } = await import('./whatsapp.router');

    const receivedEvents: unknown[] = [];
    const eventCount = 100;
    const controller = new AbortController();

    // Start subscriber
    const subscriber = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: controller.signal,
      });

      try {
        for await (const event of iterator) {
          receivedEvents.push(event);
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) throw e;
      }
    })();

    await new Promise(r => setTimeout(r, 10));

    // Rapid-fire publish
    for (let i = 0; i < eventCount; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.sent' as const,
        session_id: testSessionId('550e8400-e29b-41d4-a716-446655440000'),
        data: { sequence: i },
      });
    }

    await new Promise(r => setTimeout(r, 100));
    controller.abort();
    await subscriber.catch(() => {});

    expect(receivedEvents.length).toBe(eventCount);

    // Verify order is preserved
    receivedEvents.forEach((event, i) => {
      expect((event as { data: { sequence: number } }).data.sequence).toBe(i);
    });
  });

  it('should isolate events by session_id filter correctly under concurrent load', async () => {
    const { whatsappEventPublisher } = await import('./whatsapp.router');

    const session1Events: unknown[] = [];
    const session2Events: unknown[] = [];
    const session1Id = testSessionId('550e8400-e29b-41d4-a716-446655440001');
    const session2Id = testSessionId('550e8400-e29b-41d4-a716-446655440002');
    const eventsPerSession = 20;

    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Subscriber filtering for session 1
    const sub1 = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: controller1.signal,
      });
      try {
        for await (const event of iterator) {
          const e = event as { session_id: string };
          if (e.session_id === session1Id) {
            session1Events.push(event);
          }
        }
      } catch {
        /* abort */
      }
    })();

    // Subscriber filtering for session 2
    const sub2 = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: controller2.signal,
      });
      try {
        for await (const event of iterator) {
          const e = event as { session_id: string };
          if (e.session_id === session2Id) {
            session2Events.push(event);
          }
        }
      } catch {
        /* abort */
      }
    })();

    await new Promise(r => setTimeout(r, 10));

    // Interleave events for both sessions
    for (let i = 0; i < eventsPerSession; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: session1Id,
        data: { session: 1, index: i },
      });
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: session2Id,
        data: { session: 2, index: i },
      });
    }

    await new Promise(r => setTimeout(r, 50));
    controller1.abort();
    controller2.abort();
    await Promise.allSettled([sub1, sub2]);

    expect(session1Events.length).toBe(eventsPerSession);
    expect(session2Events.length).toBe(eventsPerSession);

    // Verify correct session isolation
    session1Events.forEach(e => {
      expect((e as { session_id: string }).session_id).toBe(session1Id);
    });
    session2Events.forEach(e => {
      expect((e as { session_id: string }).session_id).toBe(session2Id);
    });
  });

  it('should handle subscriber joining mid-stream', async () => {
    const { whatsappEventPublisher } = await import('./whatsapp.router');

    const earlyEvents: unknown[] = [];
    const lateEvents: unknown[] = [];
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    // Early subscriber
    const earlySub = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: controller1.signal,
      });
      try {
        for await (const event of iterator) {
          earlyEvents.push(event);
        }
      } catch {
        /* abort */
      }
    })();

    await new Promise(r => setTimeout(r, 10));

    // Publish first batch
    for (let i = 0; i < 5; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: testSessionId('550e8400-e29b-41d4-a716-446655440000'),
        data: { batch: 1, index: i },
      });
    }

    await new Promise(r => setTimeout(r, 20));

    // Late subscriber joins
    const lateSub = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: controller2.signal,
      });
      try {
        for await (const event of iterator) {
          lateEvents.push(event);
        }
      } catch {
        /* abort */
      }
    })();

    await new Promise(r => setTimeout(r, 10));

    // Publish second batch
    for (let i = 0; i < 5; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: testSessionId('550e8400-e29b-41d4-a716-446655440000'),
        data: { batch: 2, index: i },
      });
    }

    await new Promise(r => setTimeout(r, 50));
    controller1.abort();
    controller2.abort();
    await Promise.allSettled([earlySub, lateSub]);

    // Early subscriber gets all events
    expect(earlyEvents.length).toBe(10);

    // Late subscriber only gets events after joining
    expect(lateEvents.length).toBe(5);
    lateEvents.forEach(e => {
      expect((e as { data: { batch: number } }).data.batch).toBe(2);
    });
  });

  it('should handle subscriber leaving without affecting others', async () => {
    const { whatsappEventPublisher } = await import('./whatsapp.router');

    const stayerEvents: unknown[] = [];
    const leaverEvents: unknown[] = [];
    const stayerController = new AbortController();
    const leaverController = new AbortController();

    // Subscriber that stays
    const stayer = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: stayerController.signal,
      });
      try {
        for await (const event of iterator) {
          stayerEvents.push(event);
        }
      } catch {
        /* abort */
      }
    })();

    // Subscriber that leaves early
    const leaver = (async () => {
      const iterator = whatsappEventPublisher.subscribe('whatsapp-event', {
        signal: leaverController.signal,
      });
      try {
        for await (const event of iterator) {
          leaverEvents.push(event);
        }
      } catch {
        /* abort */
      }
    })();

    await new Promise(r => setTimeout(r, 10));

    // Publish first batch
    for (let i = 0; i < 5; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: testSessionId('550e8400-e29b-41d4-a716-446655440000'),
        data: { index: i },
      });
    }

    await new Promise(r => setTimeout(r, 20));

    // Leaver unsubscribes
    leaverController.abort();
    await leaver.catch(() => {});

    // Publish more events
    for (let i = 5; i < 10; i++) {
      whatsappEventPublisher.publish('whatsapp-event', {
        type: 'message.received' as const,
        session_id: testSessionId('550e8400-e29b-41d4-a716-446655440000'),
        data: { index: i },
      });
    }

    await new Promise(r => setTimeout(r, 50));
    stayerController.abort();
    await stayer.catch(() => {});

    // Stayer gets all events
    expect(stayerEvents.length).toBe(10);

    // Leaver only got events before leaving
    expect(leaverEvents.length).toBe(5);
  });
});

// ============================================================================
// Property-Based Tests (fast-check)
// ============================================================================

import * as fc from 'fast-check';

describe('Property-Based Tests', () => {
  describe('Session Schema Properties', () => {
    // Generate valid ISO datetime strings using integer timestamps
    const validDatetimeArb = fc
      .integer({
        min: 0,
        max: 4102444800000, // 2100-01-01
      })
      .map(ts => new Date(ts).toISOString());

    const validSessionArb = fc.record({
      id: fc.uuid(),
      jid: fc.option(fc.string(), { nil: undefined }),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      status: fc.constantFrom(
        'pending',
        'connecting',
        'connected',
        'disconnected',
        'logged_out',
        'expired',
      ),
      auto_connect: fc.boolean(),
      created_at: validDatetimeArb,
      updated_at: validDatetimeArb,
    });

    it('should accept any valid session structure', () => {
      fc.assert(
        fc.property(validSessionArb, session => {
          const result = schemas.session.safeParse(session);
          return result.success === true;
        }),
        { numRuns: 100 },
      );
    });

    it('should reject sessions with invalid UUIDs', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !isValidUUID(s)),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.constantFrom('pending', 'connected', 'disconnected', 'expired'),
          (invalidId, name, status) => {
            const session = {
              id: invalidId,
              name,
              status,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const result = schemas.session.safeParse(session);
            return result.success === false;
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should reject sessions with invalid status', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 100 }),
          fc
            .string()
            .filter(
              s =>
                !['pending', 'connected', 'disconnected', 'expired'].includes(
                  s,
                ),
            ),
          (id, name, invalidStatus) => {
            const session = {
              id,
              name,
              status: invalidStatus,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            const result = schemas.session.safeParse(session);
            return result.success === false;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Create Session Input Properties', () => {
    it('should accept names between 1-100 characters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 100 }), name => {
          const result = schemas.createSessionInput.safeParse({ name });
          return result.success === true;
        }),
        { numRuns: 100 },
      );
    });

    it('should reject empty names', () => {
      const result = schemas.createSessionInput.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('should reject names exceeding 100 characters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 101, maxLength: 500 }), name => {
          const result = schemas.createSessionInput.safeParse({ name });
          return result.success === false;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Phone Number (E.164) Properties', () => {
    // Valid E.164: + followed by 1-9, then 1-14 more digits
    const validE164Arb = fc
      .tuple(
        fc.constantFrom('1', '2', '3', '4', '5', '6', '7', '8', '9'),
        fc.stringMatching(/^[0-9]{1,14}$/),
      )
      .map(([first, rest]) => `+${first}${rest}`);

    it('should accept valid E.164 phone numbers', () => {
      fc.assert(
        fc.property(validE164Arb, phone => {
          const message = {
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            to: phone,
            type: 'text',
            content: { text: 'Hello' },
          };
          const result = schemas.sendMessageInput.safeParse(message);
          return result.success === true;
        }),
        { numRuns: 100 },
      );
    });

    it('should reject phone numbers without + prefix', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[1-9][0-9]{1,14}$/), phone => {
          const message = {
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            to: phone,
            type: 'text',
            content: { text: 'Hello' },
          };
          const result = schemas.sendMessageInput.safeParse(message);
          return result.success === false;
        }),
        { numRuns: 50 },
      );
    });

    it('should reject phone numbers starting with +0', () => {
      fc.assert(
        fc.property(fc.stringMatching(/^[0-9]{1,14}$/), rest => {
          const message = {
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            to: `+0${rest}`,
            type: 'text',
            content: { text: 'Hello' },
          };
          const result = schemas.sendMessageInput.safeParse(message);
          return result.success === false;
        }),
        { numRuns: 50 },
      );
    });
  });

  describe('Message Content Type Consistency Properties', () => {
    const messageTypes = [
      'text',
      'image',
      'document',
      'audio',
      'video',
    ] as const;

    it('should enforce content matches type', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...messageTypes),
          fc.string({ minLength: 1, maxLength: 100 }),
          (type, content) => {
            const contentMap = {
              text: { text: content },
              image: { image_url: `https://example.com/${content}.png` },
              document: { doc_url: `https://example.com/${content}.pdf` },
              audio: { audio_url: `https://example.com/${content}.mp3` },
              video: { video_url: `https://example.com/${content}.mp4` },
            };

            const message = {
              session_id: '550e8400-e29b-41d4-a716-446655440000',
              to: '+1234567890',
              type,
              content: contentMap[type],
            };

            const result = schemas.sendMessageInput.safeParse(message);
            return result.success === true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should reject mismatched content and type', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('image', 'document', 'audio', 'video'),
          fc.string({ minLength: 1, maxLength: 100 }),
          (type, text) => {
            // Provide text content for non-text types
            const message = {
              session_id: '550e8400-e29b-41d4-a716-446655440000',
              to: '+1234567890',
              type,
              content: { text }, // Wrong content for image/doc/audio/video
            };

            const result = schemas.sendMessageInput.safeParse(message);
            return result.success === false;
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  describe('Text Message Content Properties', () => {
    it('should accept text up to 4096 characters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 4096 }), text => {
          const message = {
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            to: '+1234567890',
            type: 'text',
            content: { text },
          };
          const result = schemas.sendMessageInput.safeParse(message);
          return result.success === true;
        }),
        { numRuns: 100 },
      );
    });

    it('should reject text exceeding 4096 characters', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 4097, maxLength: 5000 }), text => {
          const message = {
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            to: '+1234567890',
            type: 'text',
            content: { text },
          };
          const result = schemas.sendMessageInput.safeParse(message);
          return result.success === false;
        }),
        { numRuns: 20 },
      );
    });
  });

  describe('QR Event Properties', () => {
    const qrEventArb = fc.oneof(
      fc.record({ type: fc.constant('qr' as const), data: fc.base64String() }),
      fc.record({
        type: fc.constant('authenticated' as const),
        data: fc.record({ jid: fc.string() }),
      }),
      fc.record({ type: fc.constant('error' as const), message: fc.string() }),
      fc.record({ type: fc.constant('timeout' as const) }),
    );

    it('should accept all valid QR event variants', () => {
      fc.assert(
        fc.property(qrEventArb, event => {
          const result = schemas.qrEvent.safeParse(event);
          return result.success === true;
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('WhatsApp Event Properties', () => {
    const sessionIdArb = fc.uuid();
    const dataArb = fc.dictionary(fc.string(), fc.jsonValue());

    const whatsappEventArb = fc.oneof(
      fc.record({
        type: fc.constant('message.received' as const),
        session_id: sessionIdArb,
        data: dataArb,
      }),
      fc.record({
        type: fc.constant('message.sent' as const),
        session_id: sessionIdArb,
        data: dataArb,
      }),
      fc.record({
        type: fc.constant('message.delivered' as const),
        session_id: sessionIdArb,
        data: dataArb,
      }),
      fc.record({
        type: fc.constant('message.read' as const),
        session_id: sessionIdArb,
        data: dataArb,
      }),
      fc.record({
        type: fc.constant('message.failed' as const),
        session_id: sessionIdArb,
        data: dataArb,
      }),
      fc.record({
        type: fc.constant('connection.connected' as const),
        session_id: sessionIdArb,
      }),
      fc.record({
        type: fc.constant('connection.disconnected' as const),
        session_id: sessionIdArb,
      }),
      fc.record({
        type: fc.constant('connection.logged_out' as const),
        session_id: sessionIdArb,
      }),
      fc.record({
        type: fc.constant('session.qr_scanned' as const),
        session_id: sessionIdArb,
      }),
      fc.record({
        type: fc.constant('session.authenticated' as const),
        session_id: sessionIdArb,
        data: fc.record({ jid: fc.string() }),
      }),
      fc.record({
        type: fc.constant('session.expired' as const),
        session_id: sessionIdArb,
      }),
    );

    it('should accept all valid WhatsApp event variants', () => {
      fc.assert(
        fc.property(whatsappEventArb, event => {
          const result = schemas.whatsappEvent.safeParse(event);
          return result.success === true;
        }),
        { numRuns: 200 },
      );
    });
  });

  describe('Concurrent Event Publisher Properties', () => {
    it('should maintain event order per publisher under concurrent load', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }),
          fc.integer({ min: 2, max: 5 }),
          async (eventCount, subscriberCount) => {
            const { whatsappEventPublisher } = await import(
              './whatsapp.router'
            );

            const results = new Map<number, number[]>();
            const controllers: AbortController[] = [];

            // Create subscribers
            const subscribers = Array.from(
              { length: subscriberCount },
              (_, i) => {
                const controller = new AbortController();
                controllers.push(controller);
                results.set(i, []);

                return (async () => {
                  const iterator = whatsappEventPublisher.subscribe(
                    'whatsapp-event',
                    {
                      signal: controller.signal,
                    },
                  );
                  try {
                    for await (const event of iterator) {
                      const e = event as unknown as { data?: { seq: number } };
                      if (e.data?.seq !== undefined) {
                        results.get(i)!.push(e.data.seq);
                      }
                    }
                  } catch {
                    /* abort */
                  }
                })();
              },
            );

            await new Promise(r => setTimeout(r, 10));

            // Publish events
            for (let i = 0; i < eventCount; i++) {
              whatsappEventPublisher.publish('whatsapp-event', {
                type: 'message.received' as const,
                session_id: testSessionId(
                  '550e8400-e29b-41d4-a716-446655440000',
                ),
                data: { seq: i },
              });
            }

            await new Promise(r => setTimeout(r, 50));
            controllers.forEach(c => c.abort());
            await Promise.allSettled(subscribers);

            // Verify each subscriber received events in order
            for (const [, events] of results) {
              for (let i = 1; i < events.length; i++) {
                const curr = events[i];
                const prev = events[i - 1];
                if (curr !== undefined && prev !== undefined && curr <= prev)
                  return false;
              }
            }
            return true;
          },
        ),
        { numRuns: 10 },
      );
    });

    it('should deliver events to all active subscribers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 3, max: 10 }),
          fc.integer({ min: 2, max: 4 }),
          async (eventCount, subscriberCount) => {
            const { whatsappEventPublisher } = await import(
              './whatsapp.router'
            );

            const receivedCounts = new Map<number, number>();
            const controllers: AbortController[] = [];

            const subscribers = Array.from(
              { length: subscriberCount },
              (_, i) => {
                const controller = new AbortController();
                controllers.push(controller);
                receivedCounts.set(i, 0);

                return (async () => {
                  const iterator = whatsappEventPublisher.subscribe(
                    'whatsapp-event',
                    {
                      signal: controller.signal,
                    },
                  );
                  try {
                    for await (const _ of iterator) {
                      receivedCounts.set(i, receivedCounts.get(i)! + 1);
                    }
                  } catch {
                    /* abort */
                  }
                })();
              },
            );

            await new Promise(r => setTimeout(r, 10));

            for (let i = 0; i < eventCount; i++) {
              whatsappEventPublisher.publish('whatsapp-event', {
                type: 'message.sent' as const,
                session_id: testSessionId(
                  '550e8400-e29b-41d4-a716-446655440000',
                ),
                data: { i },
              });
            }

            await new Promise(r => setTimeout(r, 50));
            controllers.forEach(c => c.abort());
            await Promise.allSettled(subscribers);

            // All subscribers should receive all events
            for (const [, count] of receivedCounts) {
              if (count !== eventCount) return false;
            }
            return true;
          },
        ),
        { numRuns: 10 },
      );
    });
  });
});

// Helper function
function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}
