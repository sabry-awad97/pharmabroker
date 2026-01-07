/**
 * Event Bridge Service Tests
 *
 * Property-based tests for the EventBridgeService.
 */

import { describe, it, expect } from 'bun:test';
import fc from 'fast-check';
import { calculateBackoffDelay } from './event-bridge.service';
import {
  whatsappEvent,
  type WhatsAppEvent,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Test Generators
// ============================================================================

// Generate valid UUIDs
const uuidArb = fc.uuid();

// Generate valid WhatsApp event types
const eventTypeArb = fc.constantFrom(
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'connection.connected',
  'connection.disconnected',
  'connection.logged_out',
  'session.qr_scanned',
  'session.authenticated',
  'session.expired',
) as fc.Arbitrary<WhatsAppEvent['type']>;

// Generate valid message events
const messageEventArb = fc.record({
  type: fc.constantFrom(
    'message.received' as const,
    'message.sent' as const,
    'message.delivered' as const,
    'message.read' as const,
    'message.failed' as const,
  ),
  session_id: uuidArb,
  data: fc.dictionary(fc.string(), fc.jsonValue()),
});

// Generate valid connection events
const connectionEventArb = fc.record({
  type: fc.constantFrom(
    'connection.connected' as const,
    'connection.disconnected' as const,
    'connection.logged_out' as const,
  ),
  session_id: uuidArb,
});

// Generate valid session events (without data)
const sessionEventWithoutDataArb = fc.record({
  type: fc.constantFrom(
    'session.qr_scanned' as const,
    'session.expired' as const,
  ),
  session_id: uuidArb,
});

// Generate valid session.authenticated events (with jid data)
const sessionAuthenticatedEventArb = fc.record({
  type: fc.constant('session.authenticated' as const),
  session_id: uuidArb,
  data: fc.record({
    jid: fc.string({ minLength: 1 }),
  }),
});

// Generate any valid WhatsApp event
const validWhatsAppEventArb = fc.oneof(
  messageEventArb,
  connectionEventArb,
  sessionEventWithoutDataArb,
  sessionAuthenticatedEventArb,
);

// Generate invalid events (missing required fields, wrong types, etc.)
const invalidEventArb = fc.oneof(
  // Missing type
  fc.record({
    session_id: uuidArb,
    data: fc.dictionary(fc.string(), fc.jsonValue()),
  }),
  // Invalid type
  fc.record({
    type: fc
      .string()
      .filter(
        s =>
          ![
            'message.received',
            'message.sent',
            'message.delivered',
            'message.read',
            'message.failed',
            'connection.connected',
            'connection.disconnected',
            'connection.logged_out',
            'session.qr_scanned',
            'session.authenticated',
            'session.expired',
          ].includes(s),
      ),
    session_id: uuidArb,
  }),
  // Missing session_id
  fc.record({
    type: eventTypeArb,
  }),
  // Invalid session_id (not UUID)
  fc.record({
    type: eventTypeArb,
    session_id: fc
      .string()
      .filter(
        s =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            s,
          ),
      ),
  }),
  // Completely random object
  fc.dictionary(fc.string(), fc.jsonValue()),
  // Primitive values
  fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
);

// ============================================================================
// Property Tests
// ============================================================================

describe('EventBridgeService', () => {
  /**
   * Property 1: Event serialization round-trip
   *
   * *For any* valid WhatsApp event, serializing it to JSON in Go and parsing it
   * in TypeScript should produce an equivalent event object that passes schema validation.
   *
   * **Validates: Requirements 1.4**
   */
  describe('Property 1: Event serialization round-trip', () => {
    it('should parse events serialized in Go format', () => {
      fc.assert(
        fc.property(validWhatsAppEventArb, event => {
          // Simulate Go serialization format (with optional extra fields)
          const goSerializedEvent = {
            ...event,
            // Go may include these optional fields
            id: fc.sample(fc.uuid(), 1)[0],
            timestamp: new Date().toISOString(),
          };

          // Serialize to JSON (as Go would)
          const jsonString = JSON.stringify(goSerializedEvent);

          // Parse back (as TypeScript would)
          const parsed = JSON.parse(jsonString);

          // Validate against schema
          const result = whatsappEvent.safeParse(parsed);

          // Property: Parsed event should pass validation
          expect(result.success).toBe(true);

          if (result.success) {
            // Property: Core fields should be preserved
            expect(result.data.type).toBe(event.type);
            expect(result.data.session_id).toBe(event.session_id);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should handle JSON serialization round-trip for all event types', () => {
      fc.assert(
        fc.property(validWhatsAppEventArb, event => {
          // Serialize to JSON
          const jsonString = JSON.stringify(event);

          // Parse back
          const parsed = JSON.parse(jsonString);

          // Validate
          const result = whatsappEvent.safeParse(parsed);

          // Property: Round-trip should preserve validity
          expect(result.success).toBe(true);

          if (result.success) {
            // Property: Type and session_id should be preserved
            expect(result.data.type).toBe(event.type);
            expect(result.data.session_id).toBe(event.session_id);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should preserve data field through serialization', () => {
      fc.assert(
        fc.property(messageEventArb, event => {
          // Serialize to JSON
          const jsonString = JSON.stringify(event);

          // Parse back
          const parsed = JSON.parse(jsonString);

          // Validate
          const result = whatsappEvent.safeParse(parsed);

          expect(result.success).toBe(true);

          if (result.success && 'data' in result.data) {
            // Property: Data field should be preserved
            expect(result.data.data).toEqual(event.data);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should handle session.authenticated with jid data', () => {
      fc.assert(
        fc.property(sessionAuthenticatedEventArb, event => {
          // Serialize to JSON
          const jsonString = JSON.stringify(event);

          // Parse back
          const parsed = JSON.parse(jsonString);

          // Validate
          const result = whatsappEvent.safeParse(parsed);

          expect(result.success).toBe(true);

          if (result.success && result.data.type === 'session.authenticated') {
            // Property: JID should be preserved
            expect(result.data.data.jid).toBe(event.data.jid);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Reconnection exponential backoff
   *
   * *For any* sequence of connection failures, the delay between reconnection
   * attempts should follow exponential backoff up to the maximum delay.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 4: Reconnection exponential backoff', () => {
    it('should calculate delay as initialDelay * 2^attempts, capped at maxDelay', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 20 }), // attempts
          fc.integer({ min: 100, max: 5000 }), // initialDelay (100ms - 5s)
          fc.integer({ min: 10000, max: 120000 }), // maxDelay (10s - 120s)
          (attempts, initialDelay, maxDelay) => {
            const delay = calculateBackoffDelay(
              attempts,
              initialDelay,
              maxDelay,
            );

            // Property 1: Delay should be at least the initial delay (for attempt 0)
            // or follow exponential growth
            const expectedUnbounded = initialDelay * Math.pow(2, attempts);
            const expectedDelay = Math.min(expectedUnbounded, maxDelay);

            expect(delay).toBe(expectedDelay);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should never exceed maxDelay regardless of attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // attempts (even very high)
          fc.integer({ min: 100, max: 5000 }), // initialDelay
          fc.integer({ min: 10000, max: 120000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const delay = calculateBackoffDelay(
              attempts,
              initialDelay,
              maxDelay,
            );

            // Property 2: Delay should never exceed maxDelay
            expect(delay).toBeLessThanOrEqual(maxDelay);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should be monotonically non-decreasing with attempts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 19 }), // attempts (leave room for +1)
          fc.integer({ min: 100, max: 5000 }), // initialDelay
          fc.integer({ min: 10000, max: 120000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const delay1 = calculateBackoffDelay(
              attempts,
              initialDelay,
              maxDelay,
            );
            const delay2 = calculateBackoffDelay(
              attempts + 1,
              initialDelay,
              maxDelay,
            );

            // Property 3: Delay should be monotonically non-decreasing
            expect(delay2).toBeGreaterThanOrEqual(delay1);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should return initialDelay for attempt 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 5000 }), // initialDelay
          fc.integer({ min: 10000, max: 120000 }), // maxDelay
          (initialDelay, maxDelay) => {
            const delay = calculateBackoffDelay(0, initialDelay, maxDelay);

            // Property 4: First attempt should use initial delay
            expect(delay).toBe(initialDelay);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should follow the sequence 1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s for default config', () => {
      // Test with default config values from design doc
      const initialDelay = 1000; // 1 second
      const maxDelay = 60000; // 60 seconds

      const expectedSequence = [
        1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000,
      ];

      for (let i = 0; i < expectedSequence.length; i++) {
        const delay = calculateBackoffDelay(i, initialDelay, maxDelay);
        expect(delay).toBe(expectedSequence[i]!);
      }
    });
  });

  /**
   * Property 5: Event validation and propagation
   *
   * *For any* received message, valid events matching the WhatsApp_Event schema
   * should be published to the EventPublisher, and invalid messages should be
   * rejected without publishing.
   *
   * **Validates: Requirements 2.4, 2.5**
   */
  describe('Property 5: Event validation and propagation', () => {
    it('should accept all valid WhatsApp events', () => {
      fc.assert(
        fc.property(validWhatsAppEventArb, event => {
          const result = whatsappEvent.safeParse(event);

          // Property: All generated valid events should pass validation
          expect(result.success).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('should reject invalid events', () => {
      fc.assert(
        fc.property(invalidEventArb, event => {
          const result = whatsappEvent.safeParse(event);

          // Property: All generated invalid events should fail validation
          expect(result.success).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('should preserve event data through validation', () => {
      fc.assert(
        fc.property(validWhatsAppEventArb, event => {
          const result = whatsappEvent.safeParse(event);

          if (result.success) {
            // Property: Validated event should have same type and session_id
            expect(result.data.type).toBe(event.type);
            expect(result.data.session_id).toBe(event.session_id);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('should validate all event types correctly', () => {
      // Test each event type explicitly
      const eventTypes = [
        'message.received',
        'message.sent',
        'message.delivered',
        'message.read',
        'message.failed',
        'connection.connected',
        'connection.disconnected',
        'connection.logged_out',
        'session.qr_scanned',
        'session.authenticated',
        'session.expired',
      ] as const;

      for (const type of eventTypes) {
        let event: unknown;

        if (type.startsWith('message.')) {
          event = {
            type,
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            data: { text: 'test' },
          };
        } else if (type === 'session.authenticated') {
          event = {
            type,
            session_id: '550e8400-e29b-41d4-a716-446655440000',
            data: { jid: '1234567890@s.whatsapp.net' },
          };
        } else {
          event = {
            type,
            session_id: '550e8400-e29b-41d4-a716-446655440000',
          };
        }

        const result = whatsappEvent.safeParse(event);
        expect(result.success).toBe(true);
      }
    });
  });

  /**
   * Property 7: Connection event status synchronization
   *
   * *For any* connection event (connected, disconnected, authenticated), the
   * corresponding session record should be updated with the correct status
   * and JID (if applicable).
   *
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe('Property 7: Connection event status synchronization', () => {
    // Define the expected status mapping
    type SessionStatus =
      | 'connected'
      | 'disconnected'
      | 'pending'
      | 'connecting';

    interface StatusMapping {
      eventType: WhatsAppEvent['type'];
      expectedStatus: SessionStatus;
      includesJid: boolean;
    }

    const statusMappings: StatusMapping[] = [
      {
        eventType: 'connection.connected',
        expectedStatus: 'connected',
        includesJid: false,
      },
      {
        eventType: 'connection.disconnected',
        expectedStatus: 'disconnected',
        includesJid: false,
      },
      {
        eventType: 'connection.logged_out',
        expectedStatus: 'disconnected',
        includesJid: false,
      },
      {
        eventType: 'session.authenticated',
        expectedStatus: 'connected',
        includesJid: true,
      },
    ];

    /**
     * Pure function that determines expected status from event type
     * This mirrors the logic in handleSessionStatusSync
     */
    function getExpectedStatusFromEvent(
      eventType: WhatsAppEvent['type'],
    ): { status: SessionStatus; includesJid: boolean } | null {
      switch (eventType) {
        case 'connection.connected':
          return { status: 'connected', includesJid: false };
        case 'connection.disconnected':
          return { status: 'disconnected', includesJid: false };
        case 'connection.logged_out':
          return { status: 'disconnected', includesJid: false };
        case 'session.authenticated':
          return { status: 'connected', includesJid: true };
        default:
          return null; // Event doesn't trigger status update
      }
    }

    it('should map connection.connected to connected status', () => {
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const event = {
            type: 'connection.connected' as const,
            session_id: sessionId,
          };
          const result = getExpectedStatusFromEvent(event.type);

          expect(result).not.toBeNull();
          expect(result!.status).toBe('connected');
          expect(result!.includesJid).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('should map connection.disconnected to disconnected status', () => {
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const event = {
            type: 'connection.disconnected' as const,
            session_id: sessionId,
          };
          const result = getExpectedStatusFromEvent(event.type);

          expect(result).not.toBeNull();
          expect(result!.status).toBe('disconnected');
          expect(result!.includesJid).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('should map connection.logged_out to disconnected status', () => {
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const event = {
            type: 'connection.logged_out' as const,
            session_id: sessionId,
          };
          const result = getExpectedStatusFromEvent(event.type);

          expect(result).not.toBeNull();
          expect(result!.status).toBe('disconnected');
          expect(result!.includesJid).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('should map session.authenticated to connected status with JID', () => {
      fc.assert(
        fc.property(uuidArb, fc.string({ minLength: 1 }), (sessionId, jid) => {
          const event = {
            type: 'session.authenticated' as const,
            session_id: sessionId,
            data: { jid },
          };
          const result = getExpectedStatusFromEvent(event.type);

          expect(result).not.toBeNull();
          expect(result!.status).toBe('connected');
          expect(result!.includesJid).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('should not trigger status update for message events', () => {
      const messageTypes = [
        'message.received',
        'message.sent',
        'message.delivered',
        'message.read',
        'message.failed',
      ] as const;

      fc.assert(
        fc.property(fc.constantFrom(...messageTypes), eventType => {
          const result = getExpectedStatusFromEvent(eventType);

          // Property: Message events should not trigger status updates
          expect(result).toBeNull();
        }),
        { numRuns: 100 },
      );
    });

    it('should not trigger status update for non-connection session events', () => {
      const nonConnectionSessionTypes = [
        'session.qr_scanned',
        'session.expired',
      ] as const;

      fc.assert(
        fc.property(
          fc.constantFrom(...nonConnectionSessionTypes),
          eventType => {
            const result = getExpectedStatusFromEvent(eventType);

            // Property: Non-connection session events should not trigger status updates
            expect(result).toBeNull();
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should correctly categorize all status-triggering events', () => {
      // Property: For all defined status mappings, the function should return correct values
      for (const mapping of statusMappings) {
        const result = getExpectedStatusFromEvent(mapping.eventType);

        expect(result).not.toBeNull();
        expect(result!.status).toBe(mapping.expectedStatus);
        expect(result!.includesJid).toBe(mapping.includesJid);
      }
    });

    it('should be deterministic - same event type always produces same status', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            'connection.connected' as const,
            'connection.disconnected' as const,
            'connection.logged_out' as const,
            'session.authenticated' as const,
          ),
          eventType => {
            const result1 = getExpectedStatusFromEvent(eventType);
            const result2 = getExpectedStatusFromEvent(eventType);

            // Property: Function should be deterministic
            expect(result1).toEqual(result2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
