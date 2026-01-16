/**
 * Backoff Utility Property Tests
 *
 * Feature: websocket-architecture-refactor
 * Tests Properties 7-8 from the design document
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  calculateBackoff,
  calculateBackoffWithJitter,
  DEFAULT_BACKOFF_CONFIG,
} from './backoff';

describe('Backoff Utility', () => {
  describe('calculateBackoff', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateBackoff(0, 1000, 30000)).toBe(1000);
      expect(calculateBackoff(1, 1000, 30000)).toBe(2000);
      expect(calculateBackoff(2, 1000, 30000)).toBe(4000);
      expect(calculateBackoff(3, 1000, 30000)).toBe(8000);
      expect(calculateBackoff(4, 1000, 30000)).toBe(16000);
    });

    it('should cap at maxDelay', () => {
      expect(calculateBackoff(10, 1000, 30000)).toBe(30000);
      expect(calculateBackoff(100, 1000, 30000)).toBe(30000);
    });

    it('should handle zero attempts', () => {
      expect(calculateBackoff(0, 1000, 30000)).toBe(1000);
    });

    it('should handle negative attempts as zero', () => {
      expect(calculateBackoff(-1, 1000, 30000)).toBe(1000);
      expect(calculateBackoff(-10, 1000, 30000)).toBe(1000);
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
          fc.integer({ min: 0, max: 20 }), // attempts
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const result = calculateBackoff(attempts, initialDelay, maxDelay);
            const expected = Math.min(
              initialDelay * Math.pow(2, attempts),
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
     * For any reconnection attempt, the delay SHALL be at least reconnectDelay
     * and at most maxReconnectDelay.
     * Validates: Requirements 3.7
     */
    it('Property 8: Backoff is always within bounds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // attempts
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const result = calculateBackoff(attempts, initialDelay, maxDelay);
            return result >= initialDelay && result <= maxDelay;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property: Backoff is monotonically increasing until cap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (initialDelay, maxDelay) => {
            let prevDelay = 0;
            for (let attempt = 0; attempt < 30; attempt++) {
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

    it('Property: Backoff eventually reaches maxDelay', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (initialDelay, maxDelay) => {
            // With enough attempts, should reach maxDelay
            const delay = calculateBackoff(100, initialDelay, maxDelay);
            return delay === maxDelay;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property: Doubling pattern holds before cap', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }), // attempts (small to avoid cap)
          fc.integer({ min: 100, max: 1000 }), // initialDelay
          (attempts, initialDelay) => {
            const maxDelay = 1_000_000; // Large enough to not cap
            const delay1 = calculateBackoff(attempts, initialDelay, maxDelay);
            const delay2 = calculateBackoff(
              attempts + 1,
              initialDelay,
              maxDelay,
            );

            // Next delay should be double (if not capped)
            return delay2 === delay1 * 2;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('calculateBackoffWithJitter', () => {
    it('should return value within jitter range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 }), // attempts
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const baseDelay = calculateBackoff(
              attempts,
              initialDelay,
              maxDelay,
            );
            const withJitter = calculateBackoffWithJitter(
              attempts,
              initialDelay,
              maxDelay,
            );

            // Should be within ±25% of base (0.75 to 1.25)
            const minExpected = Math.round(baseDelay * 0.75);
            const maxExpected = Math.min(
              Math.round(baseDelay * 1.25),
              maxDelay,
            );

            return withJitter >= minExpected && withJitter <= maxExpected;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should never exceed maxDelay', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // attempts
          fc.integer({ min: 100, max: 10000 }), // initialDelay
          fc.integer({ min: 10000, max: 600000 }), // maxDelay
          (attempts, initialDelay, maxDelay) => {
            const withJitter = calculateBackoffWithJitter(
              attempts,
              initialDelay,
              maxDelay,
            );
            return withJitter <= maxDelay;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('DEFAULT_BACKOFF_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_BACKOFF_CONFIG.INITIAL_DELAY_MS).toBe(1000);
      expect(DEFAULT_BACKOFF_CONFIG.MAX_DELAY_MS).toBe(30000);
      expect(DEFAULT_BACKOFF_CONFIG.MAX_RETRIES).toBe(3);
    });

    it('should work with calculateBackoff', () => {
      const delay = calculateBackoff(
        0,
        DEFAULT_BACKOFF_CONFIG.INITIAL_DELAY_MS,
        DEFAULT_BACKOFF_CONFIG.MAX_DELAY_MS,
      );
      expect(delay).toBe(1000);
    });
  });
});
