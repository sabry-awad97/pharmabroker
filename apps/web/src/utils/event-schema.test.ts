/**
 * Property-based tests for WhatsApp Event Schema
 *
 * Feature: session-connection-flow
 * Property 7: Event Schema Validation Round-Trip
 * Validates: Requirements 2.1
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  connectionConnectingEvent,
  connectionFailedEvent,
  connectionConnectedEvent,
  connectionDisconnectedEvent,
  connectionLoggedOutEvent,
  whatsappEvent,
  type ConnectionConnectingEvent,
  type ConnectionFailedEvent,
} from '@pharmabroker/schemas/whatsapp';

describe('Event Schema', () => {
  describe('connectionConnectingEvent', () => {
    it('parses valid connecting event', () => {
      const event = {
        type: 'connection.connecting' as const,
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-01-07T12:00:00.000Z',
      };
      const result = connectionConnectingEvent.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects event with missing timestamp', () => {
      const event = {
        type: 'connection.connecting' as const,
        session_id: '550e8400-e29b-41d4-a716-446655440000',
      };
      const result = connectionConnectingEvent.safeParse(event);
      expect(result.success).toBe(false);
    });

    it('rejects event with invalid session_id', () => {
      const event = {
        type: 'connection.connecting' as const,
        session_id: 'not-a-uuid',
        timestamp: '2026-01-07T12:00:00.000Z',
      };
      const result = connectionConnectingEvent.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  describe('connectionFailedEvent', () => {
    it('parses valid failed event', () => {
      const event = {
        type: 'connection.failed' as const,
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-01-07T12:00:00.000Z',
        data: {
          error_code: 'CONNECTION_TIMEOUT',
          error_message: 'Connection timed out',
        },
      };
      const result = connectionFailedEvent.safeParse(event);
      expect(result.success).toBe(true);
    });

    it('rejects event with missing error data', () => {
      const event = {
        type: 'connection.failed' as const,
        session_id: '550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-01-07T12:00:00.000Z',
      };
      const result = connectionFailedEvent.safeParse(event);
      expect(result.success).toBe(false);
    });
  });

  /**
   * Property 7: Event Schema Validation Round-Trip
   *
   * For any valid connection event object, serializing to JSON and parsing
   * back through the Zod schema SHALL produce an equivalent object.
   *
   * Validates: Requirements 2.1
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for valid UUIDs
    const uuidArb = fc.uuid();

    // Arbitrary for ISO datetime strings (generate valid ISO 8601 format directly)
    const datetimeArb = fc
      .tuple(
        fc.integer({ min: 1970, max: 2099 }), // year
        fc.integer({ min: 1, max: 12 }), // month
        fc.integer({ min: 1, max: 28 }), // day (use 28 to avoid month-specific issues)
        fc.integer({ min: 0, max: 23 }), // hour
        fc.integer({ min: 0, max: 59 }), // minute
        fc.integer({ min: 0, max: 59 }), // second
        fc.integer({ min: 0, max: 999 }), // millisecond
      )
      .map(([year, month, day, hour, minute, second, ms]) => {
        const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
        return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}.${pad(ms, 3)}Z`;
      });

    // Arbitrary for error codes
    const errorCodeArb = fc.stringMatching(/^[A-Z][A-Z0-9_]{2,30}$/);

    // Arbitrary for error messages
    const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 });

    // Arbitrary for connection.connecting events
    const connectingEventArb = fc.tuple(uuidArb, datetimeArb).map(
      ([session_id, timestamp]): ConnectionConnectingEvent => ({
        type: 'connection.connecting',
        session_id,
        timestamp,
      }),
    );

    // Arbitrary for connection.failed events
    const failedEventArb = fc
      .tuple(uuidArb, datetimeArb, errorCodeArb, errorMessageArb)
      .map(
        ([
          session_id,
          timestamp,
          error_code,
          error_message,
        ]): ConnectionFailedEvent => ({
          type: 'connection.failed',
          session_id,
          timestamp,
          data: { error_code, error_message },
        }),
      );

    it('Property 7: connection.connecting event round-trip preserves data', () => {
      /**
       * Feature: session-connection-flow, Property 7: Event Schema Validation Round-Trip
       * For any valid connecting event, JSON serialization and parsing should preserve all fields
       */
      fc.assert(
        fc.property(connectingEventArb, event => {
          // Serialize to JSON
          const json = JSON.stringify(event);
          // Parse back
          const parsed = JSON.parse(json);
          // Validate through schema
          const result = connectionConnectingEvent.safeParse(parsed);

          if (!result.success) return false;

          // Verify all fields match
          return (
            result.data.type === event.type &&
            result.data.session_id === event.session_id &&
            result.data.timestamp === event.timestamp
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: connection.failed event round-trip preserves data', () => {
      /**
       * Feature: session-connection-flow, Property 7: Event Schema Validation Round-Trip
       * For any valid failed event, JSON serialization and parsing should preserve all fields
       */
      fc.assert(
        fc.property(failedEventArb, event => {
          // Serialize to JSON
          const json = JSON.stringify(event);
          // Parse back
          const parsed = JSON.parse(json);
          // Validate through schema
          const result = connectionFailedEvent.safeParse(parsed);

          if (!result.success) return false;

          // Verify all fields match
          return (
            result.data.type === event.type &&
            result.data.session_id === event.session_id &&
            result.data.timestamp === event.timestamp &&
            result.data.data.error_code === event.data.error_code &&
            result.data.data.error_message === event.data.error_message
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: whatsappEvent discriminated union correctly identifies new event types', () => {
      /**
       * Feature: session-connection-flow, Property 7: Event Schema Validation Round-Trip
       * For any valid connecting or failed event, the whatsappEvent union should correctly parse it
       */
      const newEventArb = fc.oneof(connectingEventArb, failedEventArb);

      fc.assert(
        fc.property(newEventArb, event => {
          // Serialize to JSON
          const json = JSON.stringify(event);
          // Parse back
          const parsed = JSON.parse(json);
          // Validate through discriminated union
          const result = whatsappEvent.safeParse(parsed);

          if (!result.success) return false;

          // Verify type discrimination works
          return result.data.type === event.type;
        }),
        { numRuns: 100 },
      );
    });
  });
});
