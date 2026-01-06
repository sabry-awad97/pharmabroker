/**
 * Sync Utility Functions
 *
 * Utilities for validating sync operations and timestamps.
 *
 * Requirements: 5.6
 */

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
 * @param lastSyncAt - The group's lastSyncAt timestamp
 * @returns Formatted string or "Never" if not synced
 */
export function formatLastSyncTime(
  lastSyncAt: Date | null | undefined,
): string {
  if (!lastSyncAt) {
    return 'Never';
  }

  const now = new Date();
  const diffMs = now.getTime() - lastSyncAt.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return lastSyncAt.toLocaleDateString();
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
