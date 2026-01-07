/**
 * Batch Invalidator Utility
 *
 * Debounces multiple query invalidations into a single batch operation
 * to prevent excessive re-renders during high-frequency event streams.
 *
 * Feature: frontend-realtime-sync
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import type { QueryClient } from '@tanstack/react-query';

// ============================================================================
// Types
// ============================================================================

export interface BatchInvalidator {
  /** Queue a query key for invalidation */
  invalidate: (queryKey: unknown[]) => void;
  /** Immediately flush all pending invalidations */
  flush: () => void;
  /** Cancel pending invalidations and clear the queue */
  cancel: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default debounce delay in milliseconds */
export const DEFAULT_DEBOUNCE_MS = 100;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Creates a batch invalidator that debounces query invalidations.
 *
 * @param queryClient - TanStack Query client instance
 * @param debounceMs - Debounce delay in milliseconds (default: 100ms)
 * @returns BatchInvalidator interface
 */
export function createBatchInvalidator(
  queryClient: QueryClient,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): BatchInvalidator {
  // Set to store unique query keys (serialized as JSON for deduplication)
  const pendingKeys = new Set<string>();

  // Timer reference for debouncing
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  /**
   * Execute all pending invalidations
   */
  const executeBatch = (): void => {
    if (pendingKeys.size === 0) return;

    // Copy and clear pending keys before executing
    const keysToInvalidate = Array.from(pendingKeys);
    pendingKeys.clear();
    timeoutId = null;

    // Invalidate each unique query key
    for (const serializedKey of keysToInvalidate) {
      try {
        const queryKey = JSON.parse(serializedKey) as unknown[];
        queryClient.invalidateQueries({ queryKey });
      } catch {
        // Skip malformed keys (shouldn't happen in practice)
        console.warn(
          '[BatchInvalidator] Failed to parse query key:',
          serializedKey,
        );
      }
    }
  };

  /**
   * Queue a query key for invalidation.
   * Duplicate keys within the debounce window are automatically deduplicated.
   */
  const invalidate = (queryKey: unknown[]): void => {
    // Serialize the query key for deduplication
    const serializedKey = JSON.stringify(queryKey);
    pendingKeys.add(serializedKey);

    // Reset the debounce timer
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(executeBatch, debounceMs);
  };

  /**
   * Immediately flush all pending invalidations without waiting for debounce.
   */
  const flush = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    executeBatch();
  };

  /**
   * Cancel all pending invalidations and clear the queue.
   */
  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    pendingKeys.clear();
  };

  return {
    invalidate,
    flush,
    cancel,
  };
}
