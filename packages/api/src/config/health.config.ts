/**
 * Health Check Configuration
 *
 * Centralized configuration for health check timing constants.
 * Used by Event Bridge and WebSocket connections for consistent behavior.
 * Supports environment variable overrides for production tuning.
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 6.1, 6.2, 6.4, 6.5, 6.6
 */

/**
 * Default configuration values
 */
export const HEALTH_CONFIG_DEFAULTS = {
  // WebSocket timing
  WS_PING_INTERVAL_MS: 30_000,
  WS_PONG_TIMEOUT_MS: 10_000,
  WS_RECONNECT_DELAY_MS: 5_000,
  WS_MAX_RECONNECT_DELAY_MS: 600_000,

  // Circuit breaker
  CB_FAILURE_THRESHOLD: 5,
  CB_RESET_TIMEOUT_MS: 30_000,

  // Session sync
  SYNC_MAX_RETRIES: 3,
  SYNC_RETRY_DELAY_MS: 2_000,
} as const;

/**
 * Health configuration interface
 */
export interface HealthConfig {
  // WebSocket timing
  WS_PING_INTERVAL_MS: number;
  WS_PONG_TIMEOUT_MS: number;
  WS_RECONNECT_DELAY_MS: number;
  WS_MAX_RECONNECT_DELAY_MS: number;

  // Circuit breaker
  CB_FAILURE_THRESHOLD: number;
  CB_RESET_TIMEOUT_MS: number;

  // Session sync
  SYNC_MAX_RETRIES: number;
  SYNC_RETRY_DELAY_MS: number;
}

/**
 * Parse an environment variable as a positive integer
 * Returns the default value if the env var is not set or invalid
 */
function parseEnvInt(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) {
    return defaultValue;
  }

  const parsed = parseInt(envVar, 10);
  if (isNaN(parsed) || parsed < 0) {
    console.warn(
      `[HealthConfig] Invalid value for env var, using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  return parsed;
}

/**
 * Load health configuration from environment variables with defaults
 *
 * Environment variables:
 * - WS_PING_INTERVAL_MS: Ping interval for WebSocket health monitoring (default: 30000)
 * - WS_PONG_TIMEOUT_MS: Pong timeout - connection considered dead if no pong received (default: 10000)
 * - WS_RECONNECT_DELAY_MS: Initial reconnection delay for exponential backoff (default: 5000)
 * - WS_MAX_RECONNECT_DELAY_MS: Maximum reconnection delay cap (default: 600000)
 * - CB_FAILURE_THRESHOLD: Number of failures before circuit breaker opens (default: 5)
 * - CB_RESET_TIMEOUT_MS: Time before circuit breaker transitions to half-open (default: 30000)
 * - SYNC_MAX_RETRIES: Maximum retry attempts for session sync (default: 3)
 * - SYNC_RETRY_DELAY_MS: Initial delay between sync retries (default: 2000)
 */
export function loadHealthConfig(): HealthConfig {
  return {
    WS_PING_INTERVAL_MS: parseEnvInt(
      process.env.WS_PING_INTERVAL_MS,
      HEALTH_CONFIG_DEFAULTS.WS_PING_INTERVAL_MS,
    ),
    WS_PONG_TIMEOUT_MS: parseEnvInt(
      process.env.WS_PONG_TIMEOUT_MS,
      HEALTH_CONFIG_DEFAULTS.WS_PONG_TIMEOUT_MS,
    ),
    WS_RECONNECT_DELAY_MS: parseEnvInt(
      process.env.WS_RECONNECT_DELAY_MS,
      HEALTH_CONFIG_DEFAULTS.WS_RECONNECT_DELAY_MS,
    ),
    WS_MAX_RECONNECT_DELAY_MS: parseEnvInt(
      process.env.WS_MAX_RECONNECT_DELAY_MS,
      HEALTH_CONFIG_DEFAULTS.WS_MAX_RECONNECT_DELAY_MS,
    ),
    CB_FAILURE_THRESHOLD: parseEnvInt(
      process.env.CB_FAILURE_THRESHOLD,
      HEALTH_CONFIG_DEFAULTS.CB_FAILURE_THRESHOLD,
    ),
    CB_RESET_TIMEOUT_MS: parseEnvInt(
      process.env.CB_RESET_TIMEOUT_MS,
      HEALTH_CONFIG_DEFAULTS.CB_RESET_TIMEOUT_MS,
    ),
    SYNC_MAX_RETRIES: parseEnvInt(
      process.env.SYNC_MAX_RETRIES,
      HEALTH_CONFIG_DEFAULTS.SYNC_MAX_RETRIES,
    ),
    SYNC_RETRY_DELAY_MS: parseEnvInt(
      process.env.SYNC_RETRY_DELAY_MS,
      HEALTH_CONFIG_DEFAULTS.SYNC_RETRY_DELAY_MS,
    ),
  };
}

/**
 * Legacy export for backward compatibility
 * @deprecated Use loadHealthConfig() instead for environment variable support
 */
export const HEALTH_CONFIG = {
  /** Ping interval for WebSocket health monitoring (30 seconds) */
  PING_INTERVAL_MS: HEALTH_CONFIG_DEFAULTS.WS_PING_INTERVAL_MS,

  /** Pong timeout - connection considered dead if no pong received (10 seconds) */
  PONG_TIMEOUT_MS: HEALTH_CONFIG_DEFAULTS.WS_PONG_TIMEOUT_MS,

  /** Initial reconnection delay for exponential backoff (5 seconds) */
  RECONNECT_DELAY_MS: HEALTH_CONFIG_DEFAULTS.WS_RECONNECT_DELAY_MS,

  /** Maximum reconnection delay cap (10 minutes) */
  MAX_RECONNECT_DELAY_MS: HEALTH_CONFIG_DEFAULTS.WS_MAX_RECONNECT_DELAY_MS,
} as const;
