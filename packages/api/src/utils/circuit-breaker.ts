/**
 * Circuit Breaker Implementation
 *
 * Prevents cascading failures by stopping requests to a failing service.
 * Implements the circuit breaker pattern with three states:
 * - closed: Normal operation, requests pass through
 * - open: Service is failing, requests are rejected immediately
 * - half-open: Testing if service has recovered
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from open to half-open (default: 30000) */
  resetTimeoutMs: number;
  /** Name for logging purposes */
  name?: string;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  name: 'CircuitBreaker',
};

export class CircuitBreakerError extends Error {
  code: 'CIRCUIT_OPEN' | 'SERVICE_UNAVAILABLE';

  constructor(
    message: string,
    code: 'CIRCUIT_OPEN' | 'SERVICE_UNAVAILABLE' = 'CIRCUIT_OPEN',
  ) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.code = code;
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount: number = 0;
  private lastFailureTime: number | null = null;
  private openedAt: number | null = null;
  private halfOpenInProgress: boolean = false;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker
   * @throws CircuitBreakerError if circuit is open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open
    this.checkStateTransition();

    if (this.state === 'open') {
      throw new CircuitBreakerError(
        `Circuit breaker is open for ${this.config.name}`,
        'CIRCUIT_OPEN',
      );
    }

    if (this.state === 'half-open') {
      // Only allow one request through in half-open state
      if (this.halfOpenInProgress) {
        throw new CircuitBreakerError(
          `Circuit breaker is half-open, test request in progress for ${this.config.name}`,
          'CIRCUIT_OPEN',
        );
      }
      this.halfOpenInProgress = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Get current failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getStatus(): {
    state: CircuitState;
    failureCount: number;
    lastFailureTime: Date | null;
    openedAt: Date | null;
  } {
    this.checkStateTransition();
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime)
        : null,
      openedAt: this.openedAt ? new Date(this.openedAt) : null,
    };
  }

  /**
   * Reset circuit breaker to closed state (for testing)
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.openedAt = null;
    this.halfOpenInProgress = false;
  }

  /**
   * Check if state should transition based on time
   */
  private checkStateTransition(): void {
    if (this.state === 'open' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
        this.halfOpenInProgress = false;
        console.log(
          `[${this.config.name}] Circuit transitioned to half-open after ${elapsed}ms`,
        );
      }
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    if (this.state === 'half-open') {
      // Test request succeeded, close the circuit
      this.state = 'closed';
      this.failureCount = 0;
      this.openedAt = null;
      this.halfOpenInProgress = false;
      console.log(`[${this.config.name}] Circuit closed after successful test`);
    } else if (this.state === 'closed') {
      // Reset failure count on success in closed state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Test request failed, reopen the circuit
      this.state = 'open';
      this.openedAt = Date.now();
      this.halfOpenInProgress = false;
      console.log(
        `[${this.config.name}] Circuit reopened after failed test request`,
      );
    } else if (this.state === 'closed') {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'open';
        this.openedAt = Date.now();
        console.log(
          `[${this.config.name}] Circuit opened after ${this.failureCount} consecutive failures`,
        );
      }
    }
  }
}
