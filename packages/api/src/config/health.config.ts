/**
 * Health Check Configuration
 *
 * Centralized configuration for health check timing constants.
 * Used by Event Bridge and WebSocket connections for consistent behavior.
 *
 * Feature: service-status-cleanup
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

export const HEALTH_CONFIG = {
  /** Ping interval for WebSocket health monitoring (30 seconds) */
  PING_INTERVAL_MS: 30_000,

  /** Pong timeout - connection considered dead if no pong received (10 seconds) */
  PONG_TIMEOUT_MS: 10_000,

  /** Initial reconnection delay for exponential backoff (5 seconds) */
  RECONNECT_DELAY_MS: 5_000,

  /** Maximum reconnection delay cap (10 minutes) */
  MAX_RECONNECT_DELAY_MS: 600_000,
} as const;

export type HealthConfig = typeof HEALTH_CONFIG;
