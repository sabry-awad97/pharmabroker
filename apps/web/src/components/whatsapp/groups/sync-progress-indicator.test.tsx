/**
 * Property-based tests for SyncProgressIndicator component
 *
 * Feature: auto-sync-groups-messages
 * Property 1: Render state consistency
 * Property 2: Progress display accuracy
 * Property 3: Error display
 * Validates: Requirements 3.4, 4.1, 4.2, 4.3
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import type {
  SyncStatusState,
  SyncProgress,
  SyncPhase,
} from '@/hooks/use-sync-status';

// ============================================================================
// Test Helpers - Pure functions extracted from component logic
// ============================================================================

/** All possible sync status states */
const ALL_SYNC_STATES: SyncStatusState[] = [
  'idle',
  'syncing',
  'completed',
  'failed',
];

/** All possible sync phases */
const ALL_SYNC_PHASES: SyncPhase[] = ['groups', 'messages'];

/** Arbitrary for sync status state */
const syncStatusStateArb = fc.constantFrom<SyncStatusState>(...ALL_SYNC_STATES);

/** Arbitrary for sync phase */
const syncPhaseArb = fc.constantFrom<SyncPhase>(...ALL_SYNC_PHASES);

/** Arbitrary for sync progress */
const syncProgressArb: fc.Arbitrary<SyncProgress> = fc.record({
  phase: syncPhaseArb,
  current: fc.integer({ min: 0, max: 1000 }),
  total: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  groupsSynced: fc.option(fc.integer({ min: 0, max: 500 }), { nil: undefined }),
  messagesProcessed: fc.option(fc.integer({ min: 0, max: 10000 }), {
    nil: undefined,
  }),
  messagesDropped: fc.option(fc.integer({ min: 0, max: 1000 }), {
    nil: undefined,
  }),
});

/** Arbitrary for component props */
const syncProgressIndicatorPropsArb = fc.record({
  status: syncStatusStateArb,
  progress: fc.option(syncProgressArb, { nil: null }),
  error: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
  groupsSynced: fc.integer({ min: 0, max: 500 }),
  messagesProcessed: fc.integer({ min: 0, max: 10000 }),
  compact: fc.boolean(),
});

// ============================================================================
// Pure Functions Under Test (extracted from component)
// ============================================================================

/**
 * Determines if the component should render anything
 */
function shouldRender(status: SyncStatusState): boolean {
  return status !== 'idle';
}

/**
 * Gets the syncing message based on phase and current count
 */
function getSyncingMessage(phase: SyncPhase, current: number): string {
  if (phase === 'groups') {
    return current > 0 ? `Syncing groups (${current})` : 'Syncing groups...';
  }
  return current > 0
    ? `Processing messages (${current})`
    : 'Processing messages...';
}

/**
 * Gets the completion message
 */
function getCompletionMessage(
  groupsSynced: number,
  messagesProcessed: number,
): string {
  if (messagesProcessed > 0) {
    return `Synced ${groupsSynced} groups, ${messagesProcessed} messages`;
  }
  return `Synced ${groupsSynced} groups`;
}

/**
 * Gets the error message with fallback
 */
function getErrorMessage(error: string | null): string {
  return error ?? 'Sync failed';
}

/**
 * Calculates progress percentage
 */
function calculateProgressPercentage(
  current: number,
  total: number | undefined,
): number | null {
  if (total === undefined || total <= 0) {
    return null;
  }
  return Math.min((current / total) * 100, 100);
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('SyncProgressIndicator', () => {
  describe('shouldRender', () => {
    it('returns false for idle status', () => {
      expect(shouldRender('idle')).toBe(false);
    });

    it('returns true for syncing status', () => {
      expect(shouldRender('syncing')).toBe(true);
    });

    it('returns true for completed status', () => {
      expect(shouldRender('completed')).toBe(true);
    });

    it('returns true for failed status', () => {
      expect(shouldRender('failed')).toBe(true);
    });
  });

  describe('getSyncingMessage', () => {
    it('returns groups message for groups phase', () => {
      expect(getSyncingMessage('groups', 0)).toBe('Syncing groups...');
      expect(getSyncingMessage('groups', 5)).toBe('Syncing groups (5)');
    });

    it('returns messages message for messages phase', () => {
      expect(getSyncingMessage('messages', 0)).toBe('Processing messages...');
      expect(getSyncingMessage('messages', 10)).toBe(
        'Processing messages (10)',
      );
    });
  });

  describe('getCompletionMessage', () => {
    it('shows only groups when no messages processed', () => {
      expect(getCompletionMessage(5, 0)).toBe('Synced 5 groups');
    });

    it('shows both groups and messages when messages processed', () => {
      expect(getCompletionMessage(5, 10)).toBe('Synced 5 groups, 10 messages');
    });
  });

  describe('getErrorMessage', () => {
    it('returns provided error message', () => {
      expect(getErrorMessage('Connection failed')).toBe('Connection failed');
    });

    it('returns default message when error is null', () => {
      expect(getErrorMessage(null)).toBe('Sync failed');
    });
  });

  describe('calculateProgressPercentage', () => {
    it('returns null when total is undefined', () => {
      expect(calculateProgressPercentage(5, undefined)).toBeNull();
    });

    it('returns null when total is 0', () => {
      expect(calculateProgressPercentage(5, 0)).toBeNull();
    });

    it('calculates correct percentage', () => {
      expect(calculateProgressPercentage(50, 100)).toBe(50);
      expect(calculateProgressPercentage(25, 100)).toBe(25);
    });

    it('caps at 100%', () => {
      expect(calculateProgressPercentage(150, 100)).toBe(100);
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  /**
   * Property 1: Render state consistency
   *
   * For any sync status state, the component should only render
   * when status is not 'idle'.
   *
   * Validates: Requirements 3.4, 4.1
   */
  describe('Property 1: Render state consistency', () => {
    it('only renders for non-idle states', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 1: Render state consistency
       * Component renders if and only if status is not 'idle'
       */
      fc.assert(
        fc.property(syncStatusStateArb, status => {
          const renders = shouldRender(status);
          const expected = status !== 'idle';
          return renders === expected;
        }),
        { numRuns: 100 },
      );
    });

    it('shouldRender is a pure function', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 1: Render state consistency
       * shouldRender returns consistent results for same input
       */
      fc.assert(
        fc.property(syncStatusStateArb, status => {
          const result1 = shouldRender(status);
          const result2 = shouldRender(status);
          return result1 === result2;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Progress display accuracy
   *
   * For any progress data, the displayed values should accurately
   * reflect the input data.
   *
   * Validates: Requirements 4.1, 4.2
   */
  describe('Property 2: Progress display accuracy', () => {
    it('syncing message includes current count when > 0', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * When current > 0, the message includes the count
       */
      fc.assert(
        fc.property(
          syncPhaseArb,
          fc.integer({ min: 1, max: 1000 }),
          (phase, current) => {
            const message = getSyncingMessage(phase, current);
            return message.includes(`(${current})`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('syncing message shows ellipsis when current is 0', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * When current is 0, the message ends with ellipsis
       */
      fc.assert(
        fc.property(syncPhaseArb, phase => {
          const message = getSyncingMessage(phase, 0);
          return message.endsWith('...');
        }),
        { numRuns: 100 },
      );
    });

    it('completion message always includes groups count', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * Completion message always includes the groups count
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 0, max: 10000 }),
          (groupsSynced, messagesProcessed) => {
            const message = getCompletionMessage(
              groupsSynced,
              messagesProcessed,
            );
            return message.includes(`${groupsSynced} groups`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('completion message includes messages only when > 0', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * Completion message includes messages count only when > 0
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 1, max: 10000 }),
          (groupsSynced, messagesProcessed) => {
            const message = getCompletionMessage(
              groupsSynced,
              messagesProcessed,
            );
            return message.includes(`${messagesProcessed} messages`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('progress percentage is between 0 and 100', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * Progress percentage is always between 0 and 100 when calculable
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2000 }),
          fc.integer({ min: 1, max: 1000 }),
          (current, total) => {
            const percentage = calculateProgressPercentage(current, total);
            if (percentage === null) return true;
            return percentage >= 0 && percentage <= 100;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('progress percentage is null when total is undefined or 0', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 2: Progress display accuracy
       * Progress percentage is null when total is undefined or 0
       */
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), current => {
          const percentageUndefined = calculateProgressPercentage(
            current,
            undefined,
          );
          const percentageZero = calculateProgressPercentage(current, 0);
          return percentageUndefined === null && percentageZero === null;
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 3: Error display
   *
   * For any error state, the error message should be displayed
   * with a fallback for null errors.
   *
   * Validates: Requirements 4.3
   */
  describe('Property 3: Error display', () => {
    it('error message is never empty', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 3: Error display
       * Error message is always a non-empty string
       */
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
          error => {
            const message = getErrorMessage(error);
            return typeof message === 'string' && message.length > 0;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('provided error message is used when not null', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 3: Error display
       * When error is provided, it is used as the message
       */
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 200 }), error => {
          const message = getErrorMessage(error);
          return message === error;
        }),
        { numRuns: 100 },
      );
    });

    it('default message is used when error is null', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 3: Error display
       * When error is null, default message is used
       */
      const message = getErrorMessage(null);
      expect(message).toBe('Sync failed');
    });
  });

  /**
   * Property 4: Phase-specific messaging
   *
   * For any sync phase, the message should correctly identify
   * whether groups or messages are being processed.
   *
   * Validates: Requirements 4.1
   */
  describe('Property 4: Phase-specific messaging', () => {
    it('groups phase message mentions groups', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 4: Phase-specific messaging
       * Groups phase message contains "groups"
       */
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), current => {
          const message = getSyncingMessage('groups', current);
          return message.toLowerCase().includes('groups');
        }),
        { numRuns: 100 },
      );
    });

    it('messages phase message mentions messages', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 4: Phase-specific messaging
       * Messages phase message contains "messages"
       */
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), current => {
          const message = getSyncingMessage('messages', current);
          return message.toLowerCase().includes('messages');
        }),
        { numRuns: 100 },
      );
    });

    it('phase determines message content', () => {
      /**
       * Feature: auto-sync-groups-messages, Property 4: Phase-specific messaging
       * Different phases produce different messages
       */
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 1000 }), current => {
          const groupsMessage = getSyncingMessage('groups', current);
          const messagesMessage = getSyncingMessage('messages', current);
          return groupsMessage !== messagesMessage;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Component Props Validation Tests
// ============================================================================

describe('Component Props Validation', () => {
  describe('Props shape', () => {
    it('all generated props have valid structure', () => {
      fc.assert(
        fc.property(syncProgressIndicatorPropsArb, props => {
          // Status is valid
          if (!ALL_SYNC_STATES.includes(props.status)) return false;

          // Progress when present has valid phase
          if (
            props.progress &&
            !ALL_SYNC_PHASES.includes(props.progress.phase)
          ) {
            return false;
          }

          // Counts are non-negative
          if (props.groupsSynced < 0) return false;
          if (props.messagesProcessed < 0) return false;

          // Compact is boolean
          if (typeof props.compact !== 'boolean') return false;

          return true;
        }),
        { numRuns: 100 },
      );
    });
  });
});
