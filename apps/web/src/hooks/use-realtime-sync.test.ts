/**
 * Real-Time Sync Hook Tests
 *
 * Tests for event invalidation mapping and sync event handling.
 */

import { describe, it, expect } from 'vitest';
import {
  getInvalidationKeys,
  extractSessionId,
  EVENT_INVALIDATION_MAP,
} from './use-realtime-sync';
import type { WhatsAppEvent } from '@pharmabroker/schemas/whatsapp';

describe('useRealtimeSync', () => {
  describe('extractSessionId', () => {
    it('should extract session_id from event', () => {
      const event = {
        type: 'connection.connected',
        session_id: 'test-session-id',
      } as WhatsAppEvent;

      const sessionId = extractSessionId(event);

      expect(sessionId).toBe('test-session-id');
    });

    it('should return undefined when session_id is not present', () => {
      const event = {
        type: 'qr',
        data: 'base64-qr-code',
      } as unknown as WhatsAppEvent;

      const sessionId = extractSessionId(event);

      expect(sessionId).toBeUndefined();
    });
  });

  describe('getInvalidationKeys', () => {
    it('should return empty array for unknown event type', () => {
      const keys = getInvalidationKeys('unknown.event', 'session-id');

      expect(keys).toEqual([]);
    });

    it('should return session keys for connection.connected event', () => {
      const keys = getInvalidationKeys('connection.connected', 'session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for connection.disconnected event', () => {
      const keys = getInvalidationKeys('connection.disconnected', 'session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for session.authenticated event', () => {
      const keys = getInvalidationKeys('session.authenticated', 'session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return message keys for message.received event', () => {
      const keys = getInvalidationKeys('message.received', 'session-id');

      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('EVENT_INVALIDATION_MAP', () => {
    it('should have handlers for all sync events', () => {
      expect(EVENT_INVALIDATION_MAP['sync.started']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['sync.progress']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['sync.completed']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['sync.failed']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['sync.skipped']).toBeDefined();
      expect(EVENT_INVALIDATION_MAP['sync.cancelled']).toBeDefined();
    });

    it('should return session keys for sync.started event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.started'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for sync.progress event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.progress'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for sync.completed event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.completed'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for sync.failed event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.failed'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for sync.skipped event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.skipped'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should return session keys for sync.cancelled event', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.cancelled'];
      const keys = mapper('session-id');

      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });

    it('should handle events without session_id', () => {
      const mapper = EVENT_INVALIDATION_MAP['sync.started'];
      const keys = mapper(undefined);

      expect(keys.length).toBeGreaterThan(0);
      // Should still return session list key
      expect(keys).toEqual(
        expect.arrayContaining([
          expect.arrayContaining(['whatsapp', 'listSessions']),
        ]),
      );
    });
  });
});
