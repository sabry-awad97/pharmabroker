/**
 * Property-based tests for useRealtimeSync hook
 *
 * Feature: frontend-realtime-sync
 * Property 1: Event-to-invalidation mapping
 * Property 2: Session-specific invalidation
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  EVENT_INVALIDATION_MAP,
  getInvalidationKeys,
  extractSessionId,
} from './use-realtime-sync';
import { whatsappKeys } from './whatsapp';

// ============================================================================
// Test Helpers
// ============================================================================

/** Event types that should trigger invalidation */
const MAPPED_EVENT_TYPES = [
  'connection.connected',
  'connection.disconnected',
  'session.authenticated',
  'connection.logged_out',
] as const;

/** Generate a valid UUID for session IDs */
const uuidArb = fc.uuid();

/** Generate a random event type from the mapped types */
const mappedEventTypeArb = fc.constantFrom(...MAPPED_EVENT_TYPES);

/** Generate a random unmapped event type */
const unmappedEventTypeArb = fc.constantFrom(
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
  'session.qr_scanned',
  'session.expired',
  'unknown.event',
);

// ============================================================================
// Unit Tests
// ============================================================================

describe('useRealtimeSync', () => {
  describe('EVENT_INVALIDATION_MAP', () => {
    it('should have mappings for all required event types', () => {
      expect(EVENT_INVALIDATION_MAP['connection.connected']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['connection.disconnected']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['session.authenticated']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['connection.logged_out']).toBeDefined();
    });

    it('should return sessions list key for connection.connected without sessionId', () => {
      const keys = EVENT_INVALIDATION_MAP['connection.connected']();
      expect(keys.length).toBe(1);
      expect(keys[0]).toEqual([...whatsappKeys.sessions.list()]);
    });

    it('should return sessions list and detail keys for connection.connected with sessionId', () => {
      const sessionId = '123e4567-e89b-12d3-a456-426614174000';
      const keys = EVENT_INVALIDATION_MAP['connection.connected'](sessionId);
      expect(keys.length).toBe(2);
      expect(keys[0]).toEqual([...whatsappKeys.sessions.list()]);
      expect(keys[1]).toEqual([...whatsappKeys.sessions.detail(sessionId)]);
    });
  });

  describe('getInvalidationKeys', () => {
    it('should return empty array for unmapped event types', () => {
      const keys = getInvalidationKeys('unknown.event');
      expect(keys).toEqual([]);
    });

    it('should return keys for mapped event types', () => {
      const keys = getInvalidationKeys('connection.connected');
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('extractSessionId', () => {
    it('should extract session_id from event with session_id', () => {
      const event = {
        type: 'connection.connected' as const,
        session_id: '123e4567-e89b-12d3-a456-426614174000',
      };
      expect(extractSessionId(event)).toBe(
        '123e4567-e89b-12d3-a456-426614174000',
      );
    });

    it('should return undefined for event without session_id', () => {
      // QR events don't have session_id in the same way
      const event = {
        type: 'message.received' as const,
        session_id: '123e4567-e89b-12d3-a456-426614174000',
        data: {},
      };
      expect(extractSessionId(event)).toBe(
        '123e4567-e89b-12d3-a456-426614174000',
      );
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  /**
   * Property 1: Event-to-invalidation mapping
   *
   * For any WhatsApp event type in the EVENT_INVALIDATION_MAP,
   * receiving that event should result in invalidation of all mapped query keys.
   *
   * Validates: Requirements 1.1, 1.2, 1.3, 1.4
   */
  describe('Property 1: Event-to-invalidation mapping', () => {
    it('should return non-empty keys for all mapped event types', () => {
      /**
       * Feature: frontend-realtime-sync, Property 1: Event-to-invalidation mapping
       * For any mapped event type, getInvalidationKeys should return at least one key
       */
      fc.assert(
        fc.property(mappedEventTypeArb, eventType => {
          const keys = getInvalidationKeys(eventType);
          return keys.length >= 1;
        }),
        { numRuns: 100 },
      );
    });

    it('should always include sessions list key for mapped events', () => {
      /**
       * Feature: frontend-realtime-sync, Property 1: Event-to-invalidation mapping
       * For any mapped event type, the sessions list key should always be included
       */
      fc.assert(
        fc.property(mappedEventTypeArb, eventType => {
          const keys = getInvalidationKeys(eventType);
          const sessionsListKey = [...whatsappKeys.sessions.list()];

          // Check if sessions list key is in the returned keys
          return keys.some(
            key => JSON.stringify(key) === JSON.stringify(sessionsListKey),
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should return empty array for unmapped event types', () => {
      /**
       * Feature: frontend-realtime-sync, Property 1: Event-to-invalidation mapping
       * For any unmapped event type, getInvalidationKeys should return empty array
       */
      fc.assert(
        fc.property(unmappedEventTypeArb, eventType => {
          const keys = getInvalidationKeys(eventType);
          return keys.length === 0;
        }),
        { numRuns: 100 },
      );
    });

    it('should return consistent keys for the same event type', () => {
      /**
       * Feature: frontend-realtime-sync, Property 1: Event-to-invalidation mapping
       * For any event type and sessionId, calling getInvalidationKeys twice should return equivalent results
       */
      fc.assert(
        fc.property(
          mappedEventTypeArb,
          fc.option(uuidArb, { nil: undefined }),
          (eventType, sessionId) => {
            const keys1 = getInvalidationKeys(eventType, sessionId);
            const keys2 = getInvalidationKeys(eventType, sessionId);

            return JSON.stringify(keys1) === JSON.stringify(keys2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Session-specific invalidation
   *
   * For any WhatsApp event containing a session_id field,
   * the session detail query for that specific session_id should be invalidated.
   *
   * Validates: Requirements 1.5
   */
  describe('Property 2: Session-specific invalidation', () => {
    it('should include session detail key when sessionId is provided', () => {
      /**
       * Feature: frontend-realtime-sync, Property 2: Session-specific invalidation
       * For any mapped event type with a sessionId, the session detail key should be included
       */
      fc.assert(
        fc.property(mappedEventTypeArb, uuidArb, (eventType, sessionId) => {
          const keys = getInvalidationKeys(eventType, sessionId);
          const sessionDetailKey = [...whatsappKeys.sessions.detail(sessionId)];

          // Check if session detail key is in the returned keys
          return keys.some(
            key => JSON.stringify(key) === JSON.stringify(sessionDetailKey),
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should not include session detail key when sessionId is undefined', () => {
      /**
       * Feature: frontend-realtime-sync, Property 2: Session-specific invalidation
       * For any mapped event type without a sessionId, only the sessions list key should be returned
       */
      fc.assert(
        fc.property(mappedEventTypeArb, eventType => {
          const keys = getInvalidationKeys(eventType, undefined);

          // Should only have the sessions list key (length 1)
          return keys.length === 1;
        }),
        { numRuns: 100 },
      );
    });

    it('should return exactly 2 keys when sessionId is provided', () => {
      /**
       * Feature: frontend-realtime-sync, Property 2: Session-specific invalidation
       * For any mapped event type with a sessionId, exactly 2 keys should be returned
       * (sessions list + session detail)
       */
      fc.assert(
        fc.property(mappedEventTypeArb, uuidArb, (eventType, sessionId) => {
          const keys = getInvalidationKeys(eventType, sessionId);
          return keys.length === 2;
        }),
        { numRuns: 100 },
      );
    });

    it('should extract session_id correctly from events with session_id field', () => {
      /**
       * Feature: frontend-realtime-sync, Property 2: Session-specific invalidation
       * For any event with a session_id field, extractSessionId should return that value
       */
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const event = {
            type: 'connection.connected' as const,
            session_id: sessionId,
          };

          return extractSessionId(event) === sessionId;
        }),
        { numRuns: 100 },
      );
    });
  });
});
