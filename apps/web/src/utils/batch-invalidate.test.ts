/**
 * Property-based tests for BatchInvalidator utility
 *
 * Feature: frontend-realtime-sync
 * Property 7: Batch invalidation behavior
 * Validates: Requirements 5.1, 5.3, 5.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { QueryClient } from '@tanstack/react-query';
import {
  createBatchInvalidator,
  DEFAULT_DEBOUNCE_MS,
} from './batch-invalidate';

describe('BatchInvalidator', () => {
  let queryClient: QueryClient;
  let invalidateQueriesSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    queryClient = new QueryClient();
    invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Unit Tests
  // ============================================================================

  describe('Unit Tests', () => {
    it('should use default debounce delay of 100ms', () => {
      expect(DEFAULT_DEBOUNCE_MS).toBe(100);
    });

    it('should not invalidate immediately when invalidate is called', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['test', 'key']);

      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    it('should invalidate after debounce delay', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['test', 'key']);

      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({
        queryKey: ['test', 'key'],
      });
    });

    it('should respect custom debounce delay', () => {
      const customDelay = 200;
      const invalidator = createBatchInvalidator(queryClient, customDelay);
      invalidator.invalidate(['test', 'key']);

      vi.advanceTimersByTime(customDelay - 1);
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate identical query keys', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['sessions', 'list']);
      invalidator.invalidate(['sessions', 'list']);
      invalidator.invalidate(['sessions', 'list']);

      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
    });

    it('should batch multiple different query keys', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['sessions', 'list']);
      invalidator.invalidate(['sessions', 'detail', '123']);
      invalidator.invalidate(['health']);

      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(3);
    });

    it('should flush immediately when flush is called', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['test', 'key']);
      invalidator.flush();

      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(1);
    });

    it('should cancel pending invalidations when cancel is called', () => {
      const invalidator = createBatchInvalidator(queryClient);
      invalidator.invalidate(['test', 'key']);
      invalidator.cancel();

      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

      expect(invalidateQueriesSpy).not.toHaveBeenCalled();
    });

    it('should reset debounce timer on each invalidate call', () => {
      const invalidator = createBatchInvalidator(queryClient);

      invalidator.invalidate(['key1']);
      vi.advanceTimersByTime(50);

      invalidator.invalidate(['key2']);
      vi.advanceTimersByTime(50);

      // Should not have fired yet (timer was reset)
      expect(invalidateQueriesSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);

      // Now both should be invalidated
      expect(invalidateQueriesSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  /**
   * Property 7: Batch invalidation behavior
   *
   * For any sequence of invalidation requests within the debounce window,
   * the batch invalidator should:
   * (a) combine them into a single batch
   * (b) deduplicate identical query keys
   * (c) execute all unique keys after the debounce timer expires
   *
   * Validates: Requirements 5.1, 5.3, 5.4
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for query key segments
    const queryKeySegmentArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 20 }),
      fc.integer({ min: 0, max: 1000 }),
    );

    // Arbitrary for query keys (arrays of 1-4 segments)
    const queryKeyArb = fc.array(queryKeySegmentArb, {
      minLength: 1,
      maxLength: 4,
    });

    // Arbitrary for arrays of query keys (1-20 keys)
    const queryKeysArb = fc.array(queryKeyArb, { minLength: 1, maxLength: 20 });

    it('Property 7a: combines multiple invalidations into a single batch execution', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any sequence of query keys, all invalidations should execute in one batch
       */
      fc.assert(
        fc.property(queryKeysArb, queryKeys => {
          // Reset spy for each iteration
          invalidateQueriesSpy.mockClear();

          const invalidator = createBatchInvalidator(queryClient);

          // Queue all keys
          for (const key of queryKeys) {
            invalidator.invalidate(key);
          }

          // Before timer: no invalidations
          expect(invalidateQueriesSpy).not.toHaveBeenCalled();

          // After timer: all unique keys invalidated
          vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

          // Count unique keys
          const uniqueKeys = new Set(queryKeys.map(k => JSON.stringify(k)));

          return invalidateQueriesSpy.mock.calls.length === uniqueKeys.size;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7b: deduplicates identical query keys within a batch', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any query key repeated N times, it should only be invalidated once
       */
      fc.assert(
        fc.property(
          queryKeyArb,
          fc.integer({ min: 2, max: 10 }),
          (queryKey, repeatCount) => {
            invalidateQueriesSpy.mockClear();

            const invalidator = createBatchInvalidator(queryClient);

            // Queue the same key multiple times
            for (let i = 0; i < repeatCount; i++) {
              invalidator.invalidate(queryKey);
            }

            vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

            // Should only be called once despite multiple queues
            return invalidateQueriesSpy.mock.calls.length === 1;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 7c: executes all unique keys after debounce timer expires', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any set of unique query keys, all should be invalidated after the timer
       */
      fc.assert(
        fc.property(queryKeysArb, queryKeys => {
          invalidateQueriesSpy.mockClear();

          const invalidator = createBatchInvalidator(queryClient);

          // Queue all keys
          for (const key of queryKeys) {
            invalidator.invalidate(key);
          }

          vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

          // Get all invalidated keys
          const invalidatedKeys = invalidateQueriesSpy.mock.calls.map(
            (call: [{ queryKey: unknown[] }]) =>
              JSON.stringify(call[0].queryKey),
          );

          // Get expected unique keys
          const expectedKeys = [
            ...new Set(queryKeys.map(k => JSON.stringify(k))),
          ];

          // All expected keys should be invalidated
          return expectedKeys.every(key => invalidatedKeys.includes(key));
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: flush executes all pending invalidations immediately', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any sequence of query keys, flush should execute all immediately
       */
      fc.assert(
        fc.property(queryKeysArb, queryKeys => {
          invalidateQueriesSpy.mockClear();

          const invalidator = createBatchInvalidator(queryClient);

          // Queue all keys
          for (const key of queryKeys) {
            invalidator.invalidate(key);
          }

          // Flush immediately (no timer advance)
          invalidator.flush();

          // Count unique keys
          const uniqueKeys = new Set(queryKeys.map(k => JSON.stringify(k)));

          return invalidateQueriesSpy.mock.calls.length === uniqueKeys.size;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: cancel clears all pending invalidations', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any sequence of query keys, cancel should prevent all invalidations
       */
      fc.assert(
        fc.property(queryKeysArb, queryKeys => {
          invalidateQueriesSpy.mockClear();

          const invalidator = createBatchInvalidator(queryClient);

          // Queue all keys
          for (const key of queryKeys) {
            invalidator.invalidate(key);
          }

          // Cancel
          invalidator.cancel();

          // Advance timer
          vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS);

          // No invalidations should have occurred
          return invalidateQueriesSpy.mock.calls.length === 0;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 7: debounce delay is configurable', () => {
      /**
       * Feature: frontend-realtime-sync, Property 7: Batch invalidation behavior
       * For any positive debounce delay, invalidations should wait that long
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 10, max: 500 }),
          queryKeyArb,
          (debounceMs, queryKey) => {
            invalidateQueriesSpy.mockClear();

            const invalidator = createBatchInvalidator(queryClient, debounceMs);
            invalidator.invalidate(queryKey);

            // Just before the delay: no invalidation
            vi.advanceTimersByTime(debounceMs - 1);
            const beforeCount = invalidateQueriesSpy.mock.calls.length;

            // At the delay: invalidation occurs
            vi.advanceTimersByTime(1);
            const afterCount = invalidateQueriesSpy.mock.calls.length;

            return beforeCount === 0 && afterCount === 1;
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
