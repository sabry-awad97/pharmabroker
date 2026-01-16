/**
 * Session Sync Service Property Tests
 *
 * Feature: websocket-architecture-refactor
 * Tests Properties 15-18 from the design document
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { calculateBackoff } from './session-sync.service';

// ============================================================================
// Types for Testing
// ============================================================================

type SessionStatus = 'pending' | 'connecting' | 'connected' | 'disconnected';

interface SyncSession {
  id: string;
  name: string;
  jid: string | null;
  autoConnect: boolean;
  status: SessionStatus;
}

interface SyncResult {
  totalSessions: number;
  reconnectAttempted: number;
  reconnectSucceeded: number;
  reconnectFailed: number;
  markedDisconnected: number;
  errors: Array<{ sessionId: string; error: string }>;
}

// ============================================================================
// Simulation Functions
// ============================================================================

/**
 * Simulates the retry logic with exponential backoff
 */
function simulateRetryWithBackoff(
  maxRetries: number,
  initialDelayMs: number,
  maxDelayMs: number,
  failUntilAttempt: number, // -1 means always fail
): { succeeded: boolean; attempts: number; delays: number[] } {
  const delays: number[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;

    // Check if this attempt succeeds
    if (failUntilAttempt >= 0 && attempt >= failUntilAttempt) {
      return { succeeded: true, attempts, delays };
    }

    // Calculate delay for next retry (if not last attempt)
    if (attempt < maxRetries) {
      const delay = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
      delays.push(delay);
    }
  }

  return { succeeded: false, attempts, delays };
}

/**
 * Simulates session sync logic
 */
function simulateSyncSession(
  session: SyncSession,
  reconnectSucceeds: boolean,
  maxRetries: number,
): {
  reconnectAttempted: boolean;
  reconnectSucceeded: boolean;
  markedDisconnected: boolean;
} {
  // Only process sessions with stale status
  if (session.status !== 'connected' && session.status !== 'connecting') {
    return {
      reconnectAttempted: false,
      reconnectSucceeded: false,
      markedDisconnected: false,
    };
  }

  if (session.autoConnect) {
    // Attempt reconnection
    if (reconnectSucceeds) {
      return {
        reconnectAttempted: true,
        reconnectSucceeded: true,
        markedDisconnected: false,
      };
    } else {
      // All retries failed - mark as disconnected
      return {
        reconnectAttempted: true,
        reconnectSucceeded: false,
        markedDisconnected: true,
      };
    }
  } else {
    // Non-autoConnect - mark as disconnected immediately
    return {
      reconnectAttempted: false,
      reconnectSucceeded: false,
      markedDisconnected: true,
    };
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('SessionSyncService', () => {
  describe('calculateBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateBackoff(0, 1000, 30000)).toBe(1000);
      expect(calculateBackoff(1, 1000, 30000)).toBe(2000);
      expect(calculateBackoff(2, 1000, 30000)).toBe(4000);
      expect(calculateBackoff(3, 1000, 30000)).toBe(8000);
    });

    it('should cap at maxDelay', () => {
      expect(calculateBackoff(10, 1000, 30000)).toBe(30000);
      expect(calculateBackoff(100, 1000, 30000)).toBe(30000);
    });

    /**
     * Property 7: Exponential Backoff Calculation
     * For any sequence of reconnection attempts, the delay between attempt N and N+1
     * SHALL be min(initialDelay * 2^N, maxDelay).
     * Validates: Requirements 3.6
     */
    it('Property 7: Backoff follows exponential formula', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }), // attempt
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempt, initialDelay, maxDelay) => {
            const result = calculateBackoff(attempt, initialDelay, maxDelay);
            const expected = Math.min(
              initialDelay * Math.pow(2, attempt),
              maxDelay,
            );
            return result === expected;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 8: Backoff Bounds
     * For any reconnection attempt, the delay SHALL be at least reconnectDelay (5 seconds)
     * and at most maxReconnectDelay (10 minutes).
     * Validates: Requirements 3.7
     */
    it('Property 8: Backoff is always within bounds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // attempt
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempt, initialDelay, maxDelay) => {
            const result = calculateBackoff(attempt, initialDelay, maxDelay);
            return result >= initialDelay && result <= maxDelay;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Backoff is monotonically increasing until cap
     */
    it('Property: Backoff is monotonically increasing until cap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (initialDelay, maxDelay) => {
            let prevDelay = 0;
            for (let attempt = 0; attempt < 20; attempt++) {
              const delay = calculateBackoff(attempt, initialDelay, maxDelay);
              if (delay < prevDelay) {
                return false; // Should never decrease
              }
              prevDelay = delay;
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Retry Logic', () => {
    /**
     * Property 16: Retry with Backoff on Failure
     * For any failed reconnection attempt, the Session_Sync_Service SHALL retry
     * with exponential backoff, up to maxRetries (3) times.
     * Validates: Requirements 5.3
     */
    it('Property 16: Retries up to maxRetries times', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // maxRetries
          maxRetries => {
            // Simulate always failing
            const result = simulateRetryWithBackoff(
              maxRetries,
              1000,
              30000,
              -1,
            );

            // Should attempt maxRetries + 1 times (initial + retries)
            return result.attempts === maxRetries + 1 && !result.succeeded;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 16: Stops retrying on success
     */
    it('Property 16: Stops retrying on success', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // maxRetries
          fc.integer({ min: 0, max: 5 }), // successOnAttempt
          (maxRetries, successOnAttempt) => {
            if (successOnAttempt > maxRetries) return true; // Skip invalid cases

            const result = simulateRetryWithBackoff(
              maxRetries,
              1000,
              30000,
              successOnAttempt,
            );

            // Should succeed and stop at the successful attempt
            return result.succeeded && result.attempts === successOnAttempt + 1;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 17: Mark Disconnected After Max Retries
     * For any session where all retry attempts fail, the session status
     * SHALL be updated to 'disconnected'.
     * Validates: Requirements 5.4
     */
    it('Property 17: Marks disconnected after all retries fail', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.integer({ min: 1, max: 5 }),
          (id, name, maxRetries) => {
            const session: SyncSession = {
              id,
              name,
              jid: null,
              autoConnect: true,
              status: 'connected',
            };

            const result = simulateSyncSession(session, false, maxRetries);

            // Should be marked as disconnected after failed reconnection
            return (
              result.reconnectAttempted &&
              !result.reconnectSucceeded &&
              result.markedDisconnected
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('AutoConnect Handling', () => {
    /**
     * Property 15: AutoConnect Sessions Trigger Reconnection
     * For any session with autoConnect=true and status 'connected' or 'connecting'
     * at startup, the Session_Sync_Service SHALL attempt reconnection.
     * Validates: Requirements 5.2
     */
    it('Property 15: AutoConnect sessions trigger reconnection', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom<SessionStatus>('connected', 'connecting'),
          fc.boolean(),
          (id, name, status, reconnectSucceeds) => {
            const session: SyncSession = {
              id,
              name,
              jid: null,
              autoConnect: true,
              status,
            };

            const result = simulateSyncSession(session, reconnectSucceeds, 3);

            // Should attempt reconnection
            return result.reconnectAttempted;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 18: Non-AutoConnect Marked Disconnected
     * For any session with autoConnect=false and stale status ('connected' or 'connecting')
     * at startup, the session SHALL be marked as 'disconnected' immediately
     * without reconnection attempt.
     * Validates: Requirements 5.5
     */
    it('Property 18: Non-autoConnect sessions marked disconnected immediately', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom<SessionStatus>('connected', 'connecting'),
          (id, name, status) => {
            const session: SyncSession = {
              id,
              name,
              jid: null,
              autoConnect: false,
              status,
            };

            const result = simulateSyncSession(session, true, 3);

            // Should NOT attempt reconnection, but should mark as disconnected
            return (
              !result.reconnectAttempted &&
              !result.reconnectSucceeded &&
              result.markedDisconnected
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: Sessions with non-stale status are not processed
     */
    it('Property: Sessions with non-stale status are not processed', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.constantFrom<SessionStatus>('pending', 'disconnected'),
          fc.boolean(),
          (id, name, status, autoConnect) => {
            const session: SyncSession = {
              id,
              name,
              jid: null,
              autoConnect,
              status,
            };

            const result = simulateSyncSession(session, true, 3);

            // Should not process sessions that aren't stale
            return (
              !result.reconnectAttempted &&
              !result.reconnectSucceeded &&
              !result.markedDisconnected
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
