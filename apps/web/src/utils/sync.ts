/**
 * Sync Utility Functions
 *
 * Utilities for validating sync operations and timestamps.
 *
 * Requirements: 5.6
 */

import { formatRelativeTime } from '@/lib/utils';

/**
 * Validates that a sync timestamp was properly updated.
 *
 * Property 11: Sync Timestamp Update
 * For any successful group sync operation, the group's lastSyncAt timestamp
 * SHALL be updated to a value greater than or equal to the sync start time.
 *
 * @param lastSyncAt - The group's lastSyncAt timestamp after sync
 * @param syncStartTime - The time when the sync operation started
 * @returns true if the timestamp is valid (>= syncStartTime)
 */
export function isSyncTimestampValid(
  lastSyncAt: Date | null | undefined,
  syncStartTime: Date,
): boolean {
  if (!lastSyncAt) {
    return false;
  }
  return lastSyncAt.getTime() >= syncStartTime.getTime();
}

/**
 * Checks if a group's sync data is stale based on a threshold.
 *
 * @param lastSyncAt - The group's lastSyncAt timestamp
 * @param staleThresholdMs - Threshold in milliseconds (default: 1 hour)
 * @returns true if the data is stale or never synced
 */
export function isSyncDataStale(
  lastSyncAt: Date | null | undefined,
  staleThresholdMs: number = 60 * 60 * 1000, // 1 hour default
): boolean {
  if (!lastSyncAt) {
    return true;
  }
  const now = Date.now();
  return now - lastSyncAt.getTime() > staleThresholdMs;
}

/**
 * Formats the last sync time for display.
 *
 * Delegates to formatRelativeTime for actual formatting while providing
 * null-safe handling with "Never" fallback.
 *
 * @param lastSyncAt - The group's lastSyncAt timestamp
 * @returns Formatted string or "Never" if not synced
 */
export function formatLastSyncTime(
  lastSyncAt: Date | null | undefined,
): string {
  if (!lastSyncAt) {
    return 'Never';
  }
  return formatRelativeTime(lastSyncAt);
}

/**
 * Represents a sync result with timestamp information.
 */
export interface SyncTimestampResult {
  syncStartTime: Date;
  syncEndTime: Date;
  lastSyncAt: Date;
}

/**
 * Validates a complete sync timestamp result.
 *
 * @param result - The sync timestamp result to validate
 * @returns true if all timestamp invariants hold
 */
export function validateSyncTimestampResult(
  result: SyncTimestampResult,
): boolean {
  // lastSyncAt must be >= syncStartTime
  if (result.lastSyncAt.getTime() < result.syncStartTime.getTime()) {
    return false;
  }

  // syncEndTime must be >= syncStartTime
  if (result.syncEndTime.getTime() < result.syncStartTime.getTime()) {
    return false;
  }

  // lastSyncAt should be <= syncEndTime (sync timestamp set during operation)
  if (result.lastSyncAt.getTime() > result.syncEndTime.getTime()) {
    return false;
  }

  return true;
}
