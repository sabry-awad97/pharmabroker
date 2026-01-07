/**
 * Event Bridge Service Tests
 *
 * Property-based tests for the exponential backoff calculation.
 * Uses fast-check for property-based testing.
 *
 * Feature: service-status-cleanup, Property 1: Backoff Formula Correctness
 * Validates: Requirements 1.3, 1.4
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { calculateBackoffDelay } from './event-bridge.service';

// ============================================================================
// Property-Based Tests
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
