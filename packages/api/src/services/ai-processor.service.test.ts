/**
 * AI Processor Service Tests
 *
 * Tests for retry logic and circuit breaker integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircuitBreaker } from '../utils/circuit-breaker';
import * as backoff from '../utils/backoff';

describe('AI Processor Service - Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Retry Logic', () => {
    it('should retry on timeout errors', () => {
      const timeoutError = new Error('AI request timed out after 60000ms');
      const isRetryable = isRetryableError(timeoutError);
      expect(isRetryable).toBe(true);
    });

    it('should retry on network errors', () => {
      const networkError = new Error('Network error: ECONNREFUSED');
      const isRetryable = isRetryableError(networkError);
      expect(isRetryable).toBe(true);
    });

    it('should retry on rate limit errors', () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        status: 429,
      });
      const isRetryable = isRetryableError(rateLimitError);
      expect(isRetryable).toBe(true);
    });

    it('should retry on service unavailable errors', () => {
      const serviceError = Object.assign(new Error('Service unavailable'), {
        status: 503,
      });
      const isRetryable = isRetryableError(serviceError);
      expect(isRetryable).toBe(true);
    });

    it('should retry on internal server errors', () => {
      const serverError = Object.assign(new Error('Internal server error'), {
        status: 500,
      });
      const isRetryable = isRetryableError(serverError);
      expect(isRetryable).toBe(true);
    });

    it('should not retry on validation errors', () => {
      const validationError = Object.assign(new Error('Invalid input'), {
        status: 400,
      });
      const isRetryable = isRetryableError(validationError);
      expect(isRetryable).toBe(false);
    });

    it('should not retry on authentication errors', () => {
      const authError = Object.assign(new Error('Unauthorized'), {
        status: 401,
      });
      const isRetryable = isRetryableError(authError);
      expect(isRetryable).toBe(false);
    });

    it('should not retry on not found errors', () => {
      const notFoundError = Object.assign(new Error('Not found'), {
        status: 404,
      });
      const isRetryable = isRetryableError(notFoundError);
      expect(isRetryable).toBe(false);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate correct backoff delays', () => {
      const delays = [
        backoff.calculateBackoff(0, 1000, 30000), // 1000ms
        backoff.calculateBackoff(1, 1000, 30000), // 2000ms
        backoff.calculateBackoff(2, 1000, 30000), // 4000ms
        backoff.calculateBackoff(3, 1000, 30000), // 8000ms
        backoff.calculateBackoff(4, 1000, 30000), // 16000ms
        backoff.calculateBackoff(5, 1000, 30000), // 30000ms (capped)
      ];

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000]);
    });

    it('should apply jitter to backoff delays', () => {
      const delays = Array.from({ length: 10 }, () =>
        backoff.calculateBackoffWithJitter(2, 1000, 30000),
      );

      // All delays should be different (with high probability)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(5);

      // All delays should be within jitter range (±25% of 4000ms)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(3000); // 4000 * 0.75
        expect(delay).toBeLessThanOrEqual(5000); // 4000 * 1.25
      });
    });
  });

  describe('Circuit Breaker', () => {
    it('should open after threshold failures', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        name: 'test',
      });

      // Simulate 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service error');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should reject requests when open', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 1000,
        name: 'test',
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service error');
          });
        } catch (error) {
          // Expected
        }
      }

      // Next request should be rejected immediately
      await expect(breaker.execute(async () => 'success')).rejects.toThrow(
        'Circuit breaker is open',
      );
    });

    it('should transition to half-open after timeout', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100, // Short timeout for testing
        name: 'test',
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service error');
          });
        } catch (error) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(breaker.getState()).toBe('half-open');
    });

    it('should close after successful test in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        name: 'test',
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service error');
          });
        } catch (error) {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Successful test request
      await breaker.execute(async () => 'success');

      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen after failed test in half-open state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100,
        name: 'test',
      });

      // Open the circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Service error');
          });
        } catch (error) {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 150));

      // Failed test request
      try {
        await breaker.execute(async () => {
          throw new Error('Still failing');
        });
      } catch (error) {
        // Expected
      }

      expect(breaker.getState()).toBe('open');
    });

    it('should reset failure count on success in closed state', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        name: 'test',
      });

      // One failure
      try {
        await breaker.execute(async () => {
          throw new Error('Service error');
        });
      } catch (error) {
        // Expected
      }

      expect(breaker.getFailureCount()).toBe(1);

      // Success resets count
      await breaker.execute(async () => 'success');

      expect(breaker.getFailureCount()).toBe(0);
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running requests', async () => {
      const promise = new Promise(resolve =>
        setTimeout(() => resolve('done'), 5000),
      );

      await expect(executeWithTimeout(promise, 100)).rejects.toThrow(
        'timed out',
      );
    });

    it('should complete fast requests before timeout', async () => {
      const promise = new Promise(resolve =>
        setTimeout(() => resolve('done'), 50),
      );

      const result = await executeWithTimeout(promise, 1000);
      expect(result).toBe('done');
    });
  });
});

// ============================================================================
// Helper Functions (extracted from service for testing)
// ============================================================================

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const errorObj = error as any;

  // Timeout errors are retryable (cold starts)
  if (message.includes('timeout') || message.includes('timed out')) {
    return true;
  }

  // Network errors are retryable
  if (
    message.includes('network') ||
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('econnreset')
  ) {
    return true;
  }

  // Rate limit errors are retryable
  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    errorObj.status === 429
  ) {
    return true;
  }

  // Service unavailable errors are retryable
  if (
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    errorObj.status === 503
  ) {
    return true;
  }

  // Internal server errors might be transient
  if (errorObj.status === 500 || errorObj.status === 502) {
    return true;
  }

  // Bad gateway errors are retryable
  if (errorObj.status === 502 || errorObj.status === 504) {
    return true;
  }

  // Default: not retryable (e.g., validation errors, auth errors)
  return false;
}

async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `AI request timed out after ${timeoutMs}ms (possible cold start)`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
}
