/**
 * Property-based tests for sync utility functions
 *
 * Feature: whatsapp-groups-management
 * Property 11: Sync Timestamp Update
 * Validates: Requirements 5.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isSyncTimestampValid,
  isSyncDataStale,
  formatLastSyncTime,
  validateSyncTimestampResult,
  type SyncTimestampResult,
} from './sync';

describe('Sync Utility', () => {
  describe('isSyncTimestampValid', () => {
    // Unit tests for specific examples
    it('returns true when lastSyncAt equals syncStartTime', () => {
      const time = new Date('2026-01-06T12:00:00Z');
      expect(isSyncTimestampValid(time, time)).toBe(true);
    });

    it('returns true when lastSyncAt is after syncStartTime', () => {
      const syncStart = new Date('2026-01-06T12:00:00Z');
      const lastSync = new Date('2026-01-06T12:00:01Z');
      expect(isSyncTimestampValid(lastSync, syncStart)).toBe(true);
    });

    it('returns false when lastSyncAt is before syncStartTime', () => {
      const syncStart = new Date('2026-01-06T12:00:00Z');
      const lastSync = new Date('2026-01-06T11:59:59Z');
      expect(isSyncTimestampValid(lastSync, syncStart)).toBe(false);
    });

    it('returns false when lastSyncAt is null', () => {
      const syncStart = new Date('2026-01-06T12:00:00Z');
      expect(isSyncTimestampValid(null, syncStart)).toBe(false);
    });

    it('returns false when lastSyncAt is undefined', () => {
      const syncStart = new Date('2026-01-06T12:00:00Z');
      expect(isSyncTimestampValid(undefined, syncStart)).toBe(false);
    });
  });

  describe('isSyncDataStale', () => {
    it('returns true when lastSyncAt is null', () => {
      expect(isSyncDataStale(null)).toBe(true);
    });

    it('returns true when lastSyncAt is undefined', () => {
      expect(isSyncDataStale(undefined)).toBe(true);
    });

    it('returns false for recent sync', () => {
      const recentSync = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      expect(isSyncDataStale(recentSync)).toBe(false);
    });

    it('returns true for old sync', () => {
      const oldSync = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      expect(isSyncDataStale(oldSync)).toBe(true);
    });

    it('respects custom threshold', () => {
      const sync = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      expect(isSyncDataStale(sync, 5 * 60 * 1000)).toBe(true); // 5 min threshold
      expect(isSyncDataStale(sync, 15 * 60 * 1000)).toBe(false); // 15 min threshold
    });
  });

  describe('formatLastSyncTime', () => {
    it('returns "Never" for null', () => {
      expect(formatLastSyncTime(null)).toBe('Never');
    });

    it('returns "Never" for undefined', () => {
      expect(formatLastSyncTime(undefined)).toBe('Never');
    });

    it('returns "Just now" for very recent sync', () => {
      const recentSync = new Date(Date.now() - 30 * 1000); // 30 seconds ago
      expect(formatLastSyncTime(recentSync)).toBe('Just now');
    });

    it('returns minutes ago for sync within an hour', () => {
      const sync = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
      expect(formatLastSyncTime(sync)).toBe('5 minutes ago');
    });

    it('returns singular minute', () => {
      const sync = new Date(Date.now() - 1 * 60 * 1000); // 1 minute ago
      expect(formatLastSyncTime(sync)).toBe('1 minute ago');
    });

    it('returns hours ago for sync within a day', () => {
      const sync = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
      expect(formatLastSyncTime(sync)).toBe('3 hours ago');
    });

    it('returns singular hour', () => {
      const sync = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      expect(formatLastSyncTime(sync)).toBe('1 hour ago');
    });

    it('returns days ago for sync within a week', () => {
      const sync = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      expect(formatLastSyncTime(sync)).toBe('2 days ago');
    });
  });

  describe('validateSyncTimestampResult', () => {
    it('returns true for valid sync result', () => {
      const result: SyncTimestampResult = {
        syncStartTime: new Date('2026-01-06T12:00:00Z'),
        syncEndTime: new Date('2026-01-06T12:00:05Z'),
        lastSyncAt: new Date('2026-01-06T12:00:03Z'),
      };
      expect(validateSyncTimestampResult(result)).toBe(true);
    });

    it('returns false when lastSyncAt is before syncStartTime', () => {
      const result: SyncTimestampResult = {
        syncStartTime: new Date('2026-01-06T12:00:00Z'),
        syncEndTime: new Date('2026-01-06T12:00:05Z'),
        lastSyncAt: new Date('2026-01-06T11:59:59Z'),
      };
      expect(validateSyncTimestampResult(result)).toBe(false);
    });

    it('returns false when syncEndTime is before syncStartTime', () => {
      const result: SyncTimestampResult = {
        syncStartTime: new Date('2026-01-06T12:00:05Z'),
        syncEndTime: new Date('2026-01-06T12:00:00Z'),
        lastSyncAt: new Date('2026-01-06T12:00:03Z'),
      };
      expect(validateSyncTimestampResult(result)).toBe(false);
    });

    it('returns false when lastSyncAt is after syncEndTime', () => {
      const result: SyncTimestampResult = {
        syncStartTime: new Date('2026-01-06T12:00:00Z'),
        syncEndTime: new Date('2026-01-06T12:00:05Z'),
        lastSyncAt: new Date('2026-01-06T12:00:10Z'),
      };
      expect(validateSyncTimestampResult(result)).toBe(false);
    });
  });

  /**
   * Property 11: Sync Timestamp Update
   *
   * For any successful group sync operation, the group's lastSyncAt timestamp
   * SHALL be updated to a value greater than or equal to the sync start time.
   *
   * Validates: Requirements 5.6
   */
  describe('Property-Based Tests', () => {
    // Arbitrary for timestamps within a reasonable range (filter out invalid dates)
    const timestampArb = fc
      .date({
        min: new Date('2020-01-01T00:00:00Z'),
        max: new Date('2030-12-31T23:59:59Z'),
      })
      .filter(d => !isNaN(d.getTime()));

    // Arbitrary for positive time offsets (in milliseconds)
    const positiveOffsetArb = fc.integer({ min: 0, max: 60 * 60 * 1000 }); // 0 to 1 hour

    it('Property 11: valid sync timestamp is always >= syncStartTime', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * For any sync start time and valid lastSyncAt, the validation should pass
       * only when lastSyncAt >= syncStartTime
       */
      fc.assert(
        fc.property(timestampArb, positiveOffsetArb, (syncStart, offset) => {
          // Skip if syncStart is invalid
          if (isNaN(syncStart.getTime())) return true;

          const lastSyncAt = new Date(syncStart.getTime() + offset);
          return isSyncTimestampValid(lastSyncAt, syncStart) === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 11: invalid sync timestamp is always < syncStartTime', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * For any sync start time and lastSyncAt before it, validation should fail
       */
      const negativeOffsetArb = fc.integer({ min: 1, max: 60 * 60 * 1000 }); // 1ms to 1 hour

      fc.assert(
        fc.property(timestampArb, negativeOffsetArb, (syncStart, offset) => {
          const lastSyncAt = new Date(syncStart.getTime() - offset);
          return isSyncTimestampValid(lastSyncAt, syncStart) === false;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 11: null/undefined lastSyncAt always fails validation', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * For any sync start time, null or undefined lastSyncAt should fail validation
       */
      fc.assert(
        fc.property(timestampArb, syncStart => {
          return (
            isSyncTimestampValid(null, syncStart) === false &&
            isSyncTimestampValid(undefined, syncStart) === false
          );
        }),
        { numRuns: 100 },
      );
    });

    it('Property 11: valid sync result has consistent timestamps', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * For any valid sync operation, syncStartTime <= lastSyncAt <= syncEndTime
       */
      fc.assert(
        fc.property(
          timestampArb,
          positiveOffsetArb,
          positiveOffsetArb,
          (syncStart, syncDuration, lastSyncOffset) => {
            // Ensure lastSyncAt is between syncStart and syncEnd
            const syncEnd = new Date(syncStart.getTime() + syncDuration);
            const lastSyncAt = new Date(
              syncStart.getTime() + Math.min(lastSyncOffset, syncDuration),
            );

            const result: SyncTimestampResult = {
              syncStartTime: syncStart,
              syncEndTime: syncEnd,
              lastSyncAt,
            };

            return validateSyncTimestampResult(result) === true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 11: stale data detection is monotonic with time', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * For any two sync times where t1 < t2, if t1 is stale then t2 is also stale
       * (older data is always at least as stale as newer data)
       */
      const thresholdArb = fc.integer({ min: 1000, max: 24 * 60 * 60 * 1000 }); // 1s to 24h

      fc.assert(
        fc.property(
          timestampArb,
          positiveOffsetArb,
          thresholdArb,
          (t1, offset, threshold) => {
            const t2 = new Date(t1.getTime() + offset);
            const isT1Stale = isSyncDataStale(t1, threshold);
            const isT2Stale = isSyncDataStale(t2, threshold);

            // If t2 (newer) is stale, t1 (older) must also be stale
            if (isT2Stale) {
              return isT1Stale === true;
            }
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 11: timestamp equality is handled correctly', () => {
      /**
       * Feature: whatsapp-groups-management, Property 11: Sync Timestamp Update
       * When lastSyncAt equals syncStartTime exactly, validation should pass
       */
      fc.assert(
        fc.property(timestampArb, timestamp => {
          // Skip invalid dates
          if (isNaN(timestamp.getTime())) {
            return true;
          }
          return isSyncTimestampValid(timestamp, timestamp) === true;
        }),
        { numRuns: 100 },
      );
    });
  });
});
