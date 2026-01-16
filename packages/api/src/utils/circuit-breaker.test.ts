/**
 * Circuit Breaker Property Tests
 *
 * Feature: websocket-architecture-refactor
 * Tests Properties 9-14 from the design document
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import * as fc from 'fast-check';
import { CircuitBreaker, CircuitBreakerError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      name: 'TestCircuit',
    });
  });

  describe('Unit Tests', () => {
    it('should start in closed state', () => {
      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should allow requests through in closed state', async () => {
      const result = await circuitBreaker.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should count failures in closed state', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('test error');
        });
      } catch {
        // Expected
      }
      expect(circuitBreaker.getFailureCount()).toBe(1);
    });

    it('should reset failure count on success', async () => {
      // Cause some failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }
      expect(circuitBreaker.getFailureCount()).toBe(3);

      // Success should reset
      await circuitBreaker.execute(async () => 'success');
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });

    it('should open after threshold failures', async () => {
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }
      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should reject requests when open', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }

      // Should reject
      await expect(
        circuitBreaker.execute(async () => 'should not run'),
      ).rejects.toThrow(CircuitBreakerError);
    });

    it('should provide status information', () => {
      const status = circuitBreaker.getStatus();
      expect(status.state).toBe('closed');
      expect(status.failureCount).toBe(0);
      expect(status.lastFailureTime).toBeNull();
      expect(status.openedAt).toBeNull();
    });

    it('should reset to closed state', async () => {
      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('test error');
          });
        } catch {
          // Expected
        }
      }
      expect(circuitBreaker.getState()).toBe('open');

      // Reset
      circuitBreaker.reset();
      expect(circuitBreaker.getState()).toBe('closed');
      expect(circuitBreaker.getFailureCount()).toBe(0);
    });
  });

  describe('Property Tests', () => {
    /**
     * Property 9: Circuit Breaker Opens After Failures
     * For any sequence of N consecutive failed requests where N >= failureThreshold (5),
     * the circuit breaker SHALL transition to the 'open' state.
     * Validates: Requirements 4.2
     */
    it('Property 9: Circuit opens after N >= threshold consecutive failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 5, max: 20 }), // N failures >= threshold
          async failureCount => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
            });

            // Cause N consecutive failures
            for (let i = 0; i < failureCount; i++) {
              try {
                await cb.execute(async () => {
                  throw new Error('test');
                });
              } catch {
                // Expected
              }
            }

            // Circuit should be open
            return cb.getState() === 'open';
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 9 (inverse): Circuit stays closed with fewer than threshold failures
     */
    it('Property 9 (inverse): Circuit stays closed with < threshold failures', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 4 }), // N failures < threshold
          async failureCount => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
            });

            // Cause N consecutive failures
            for (let i = 0; i < failureCount; i++) {
              try {
                await cb.execute(async () => {
                  throw new Error('test');
                });
              } catch {
                // Expected
              }
            }

            // Circuit should still be closed
            return cb.getState() === 'closed';
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 10: Open Circuit Rejects Requests
     * For any request made while the circuit breaker is in 'open' state,
     * the request SHALL be rejected immediately with a SERVICE_UNAVAILABLE error
     * without making an HTTP request.
     * Validates: Requirements 4.3
     */
    it('Property 10: Open circuit rejects all requests immediately', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 10 }), // Number of requests to attempt
          async requestCount => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
            });

            // Open the circuit
            for (let i = 0; i < 5; i++) {
              try {
                await cb.execute(async () => {
                  throw new Error('test');
                });
              } catch {
                // Expected
              }
            }

            // All subsequent requests should be rejected
            let allRejected = true;
            let fnCalled = false;

            for (let i = 0; i < requestCount; i++) {
              try {
                await cb.execute(async () => {
                  fnCalled = true; // Should never be called
                  return 'success';
                });
                allRejected = false;
              } catch (error) {
                if (!(error instanceof CircuitBreakerError)) {
                  allRejected = false;
                }
              }
            }

            return allRejected && !fnCalled;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property 11: Circuit Transitions to Half-Open
     * For any circuit breaker in 'open' state, after resetTimeout (30 seconds) has elapsed,
     * the state SHALL transition to 'half-open'.
     * Validates: Requirements 4.4
     */
    it('Property 11: Circuit transitions to half-open after timeout', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 50, max: 100 }), // Short timeout for testing
          async resetTimeoutMs => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs,
            });

            // Open the circuit
            for (let i = 0; i < 5; i++) {
              try {
                await cb.execute(async () => {
                  throw new Error('test');
                });
              } catch {
                // Expected
              }
            }

            expect(cb.getState()).toBe('open');

            // Wait for timeout
            await new Promise(resolve =>
              setTimeout(resolve, resetTimeoutMs + 20),
            );

            // Should be half-open now
            return cb.getState() === 'half-open';
          },
        ),
        { numRuns: 10 }, // Fewer runs due to timing
      );
    });

    /**
     * Property 12: Half-Open Allows One Request
     * For any circuit breaker in 'half-open' state, exactly one request SHALL be allowed through.
     * Subsequent requests SHALL be rejected until the test request completes.
     * Validates: Requirements 4.5
     */
    it('Property 12: Half-open allows exactly one request through', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeoutMs: 50, // Short timeout for testing
      });

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('test');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cb.getState()).toBe('half-open');

      // Start a slow request
      let requestStarted = false;
      const slowRequest = cb.execute(async () => {
        requestStarted = true;
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(requestStarted).toBe(true);

      // Second request should be rejected while first is in progress
      await expect(cb.execute(async () => 'should not run')).rejects.toThrow(
        CircuitBreakerError,
      );

      // Wait for first request to complete
      await slowRequest;
    });

    /**
     * Property 13: Circuit Closes on Success
     * For any circuit breaker in 'half-open' state where the test request succeeds,
     * the state SHALL transition to 'closed'.
     * Validates: Requirements 4.6
     */
    it('Property 13: Circuit closes on successful test request', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeoutMs: 50,
      });

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('test');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cb.getState()).toBe('half-open');

      // Successful request should close circuit
      await cb.execute(async () => 'success');
      expect(cb.getState()).toBe('closed');
      expect(cb.getFailureCount()).toBe(0);
    });

    /**
     * Property 14: Circuit Reopens on Failure
     * For any circuit breaker in 'half-open' state where the test request fails,
     * the state SHALL transition back to 'open' for another resetTimeout period.
     * Validates: Requirements 4.7
     */
    it('Property 14: Circuit reopens on failed test request', async () => {
      const cb = new CircuitBreaker({
        failureThreshold: 5,
        resetTimeoutMs: 50,
      });

      // Open the circuit
      for (let i = 0; i < 5; i++) {
        try {
          await cb.execute(async () => {
            throw new Error('test');
          });
        } catch {
          // Expected
        }
      }

      // Wait for half-open
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(cb.getState()).toBe('half-open');

      // Failed request should reopen circuit
      try {
        await cb.execute(async () => {
          throw new Error('test failure');
        });
      } catch {
        // Expected
      }

      expect(cb.getState()).toBe('open');
    });

    /**
     * Property: Failure count is always non-negative
     */
    it('Property: Failure count is always non-negative', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 0, maxLength: 20 }), // Array of success/failure
          async operations => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
            });

            for (const shouldSucceed of operations) {
              try {
                await cb.execute(async () => {
                  if (!shouldSucceed) throw new Error('test');
                  return 'success';
                });
              } catch {
                // Expected for failures
              }
            }

            return cb.getFailureCount() >= 0;
          },
        ),
        { numRuns: 100 },
      );
    });

    /**
     * Property: State is always one of the valid states
     */
    it('Property: State is always valid', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.boolean(), { minLength: 0, maxLength: 20 }),
          async operations => {
            const cb = new CircuitBreaker({
              failureThreshold: 5,
              resetTimeoutMs: 30_000,
            });

            for (const shouldSucceed of operations) {
              try {
                await cb.execute(async () => {
                  if (!shouldSucceed) throw new Error('test');
                  return 'success';
                });
              } catch {
                // Expected
              }
            }

            const state = cb.getState();
            return (
              state === 'closed' || state === 'open' || state === 'half-open'
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
