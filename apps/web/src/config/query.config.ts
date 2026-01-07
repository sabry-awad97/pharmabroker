/**
 * Query Configuration
 *
 * Centralized configuration for TanStack Query polling intervals.
 * Co-located with frontend hooks for easy maintenance.
 *
 * Feature: service-status-cleanup
 * Requirements: 3.1, 3.4
 */

export const QUERY_CONFIG = {
  /** Stale time for health check queries (10 seconds) */
  HEALTH_STALE_TIME_MS: 10_000,

  /** Refetch interval for health check queries (30 seconds) */
  HEALTH_REFETCH_INTERVAL_MS: 30_000,

  /** Stale time for session queries (30 seconds) */
  SESSIONS_STALE_TIME_MS: 30_000,

  /** Refetch interval for session list queries (60 seconds) */
  SESSIONS_REFETCH_INTERVAL_MS: 60_000,
} as const;

export type QueryConfig = typeof QUERY_CONFIG;
