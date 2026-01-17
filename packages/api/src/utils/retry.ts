/**
 * Retry Utilities
 *
 * Implements exponential backoff retry logic for transient failures.
 * Includes circuit breaker pattern to prevent cascading failures.
 */

// ============================================================================
// Types
// ============================================================================

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Callback on retry attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time to wait before attempting to close circuit (ms) */
  resetTimeoutMs: number;
  /** Time window for counting failures (ms) */
  windowMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

// ============================================================================
// Default Configurations
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  isRetryable: error => {
    // Retry on network errors and 5xx status codes
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound')
      );
    }
    return false;
  },
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60000, // 1 minute
  windowMs: 60000, // 1 minute
};

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

/**
 * Retry a function with exponential backoff
 *
 * @example
 * ```typescript
 * const result = await retry(
 *   () => fetchDataFromAPI(),
 *   { maxAttempts: 3, initialDelayMs: 1000 }
 * );
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!cfg.isRetryable?.(error)) {
        throw error;
      }

      // Don't retry on last attempt
      if (attempt === cfg.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        cfg.initialDelayMs * Math.pow(cfg.backoffMultiplier, attempt - 1),
        cfg.maxDelayMs,
      );

      // Call retry callback
      cfg.onRetry?.(attempt, error);

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry with jitter to prevent thundering herd
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  return retry(fn, {
    ...config,
    initialDelayMs: config.initialDelayMs
      ? config.initialDelayMs * (0.5 + Math.random() * 0.5)
      : DEFAULT_RETRY_CONFIG.initialDelayMs,
  });
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker to prevent cascading failures
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('external-api');
 * const result = await breaker.execute(() => fetchFromAPI());
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = [];
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === 'open') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker [${this.name}] is OPEN. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`,
        );
      }
      // Try to close circuit (half-open state)
      this.state = 'half-open';
      console.log(`[CircuitBreaker] ${this.name} entering HALF-OPEN state`);
    }

    try {
      const result = await fn();

      // Success - close circuit if half-open
      if (this.state === 'half-open') {
        this.close();
      }

      return result;
    } catch (error) {
      this.recordFailure();

      // Open circuit if threshold exceeded
      if (this.shouldOpen()) {
        this.open();
      }

      throw error;
    }
  }

  /**
   * Record a failure
   */
  private recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    // Remove failures outside the window
    this.failures = this.failures.filter(
      time => now - time < this.config.windowMs,
    );

    // Add new failure
    this.failures.push(now);
  }

  /**
   * Check if circuit should open
   */
  private shouldOpen(): boolean {
    return this.failures.length >= this.config.failureThreshold;
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = 'open';
    this.nextAttemptTime = Date.now() + this.config.resetTimeoutMs;
    console.error(
      `[CircuitBreaker] ${this.name} is now OPEN. Will retry at ${new Date(this.nextAttemptTime).toISOString()}`,
    );
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = 'closed';
    this.failures = [];
    console.log(`[CircuitBreaker] ${this.name} is now CLOSED`);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count in current window
   */
  getFailureCount(): number {
    const now = Date.now();
    return this.failures.filter(time => now - time < this.config.windowMs)
      .length;
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.close();
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout')
    );
  }
  return false;
}

/**
 * Check if error is a database error
 */
export function isDatabaseError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('prisma') ||
      message.includes('database') ||
      message.includes('connection') ||
      message.includes('deadlock')
    );
  }
  return false;
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isNetworkError(error) || isDatabaseError(error);
}
