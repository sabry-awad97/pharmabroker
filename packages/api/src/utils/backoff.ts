/**
 * Backoff Utility
 *
 * Shared exponential backoff calculation for retry logic.
 * Used by session sync, circuit breaker, and other retry mechanisms.
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 3.6, 3.7
 */

/**
 * Calculate exponential backoff delay.
 *
 * Formula: min(initialDelay * 2^attempts, maxDelay)
 *
 * @param attempts - Number of retry attempts (0-indexed)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds
 *
 * @example
 * // First retry: 1000ms
 * calculateBackoff(0, 1000, 30000) // 1000
 *
 * // Second retry: 2000ms
 * calculateBackoff(1, 1000, 30000) // 2000
 *
 * // Third retry: 4000ms
 * calculateBackoff(2, 1000, 30000) // 4000
 *
 * // Capped at maxDelay
 * calculateBackoff(10, 1000, 30000) // 30000
 */
export function calculateBackoff(
  attempts: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  // Ensure non-negative attempts
  const safeAttempts = Math.max(0, attempts);

  // Calculate exponential delay
  const delay = initialDelayMs * Math.pow(2, safeAttempts);

  // Cap at maxDelay
  return Math.min(delay, maxDelayMs);
}

/**
 * Calculate backoff with jitter to prevent thundering herd.
 *
 * Adds random jitter of ±25% to the calculated delay.
 *
 * @param attempts - Number of retry attempts (0-indexed)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Delay in milliseconds with jitter applied
 */
export function calculateBackoffWithJitter(
  attempts: number,
  initialDelayMs: number,
  maxDelayMs: number,
): number {
  const baseDelay = calculateBackoff(attempts, initialDelayMs, maxDelayMs);

  // Add ±25% jitter
  const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
  const delayWithJitter = Math.round(baseDelay * jitterFactor);

  // Ensure we don't exceed maxDelay even with jitter
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Default backoff configuration values.
 */
export const DEFAULT_BACKOFF_CONFIG = {
  /** Initial delay for first retry (ms) */
  INITIAL_DELAY_MS: 1000,
  /** Maximum delay cap (ms) */
  MAX_DELAY_MS: 30_000,
  /** Default maximum retry attempts */
  MAX_RETRIES: 3,
} as const;

/**
 * Sleep for the calculated backoff duration.
 *
 * @param attempts - Number of retry attempts (0-indexed)
 * @param initialDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Promise that resolves after the delay
 */
export async function sleepWithBackoff(
  attempts: number,
  initialDelayMs: number = DEFAULT_BACKOFF_CONFIG.INITIAL_DELAY_MS,
  maxDelayMs: number = DEFAULT_BACKOFF_CONFIG.MAX_DELAY_MS,
): Promise<void> {
  const delay = calculateBackoff(attempts, initialDelayMs, maxDelayMs);
  await new Promise(resolve => setTimeout(resolve, delay));
}
