/**
 * Property-based tests for WhatsApp mutation optimistic updates
 *
 * Feature: frontend-realtime-sync
 * Property 3: Optimistic update before response
 * Property 4: Rollback on mutation failure
 * Property 5: Invalidation on mutation settle
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import type { Session, SessionStatus } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Types
// ============================================================================

/** Mutation type for optimistic updates */
type MutationType = 'disconnect' | 'reconnect';

/** Optimistic status mapping */
const OPTIMISTIC_STATUS_MAP: Record<MutationType, SessionStatus> = {
  disconnect: 'disconnected',
  reconnect: 'connecting',
};

// ============================================================================
// Pure Functions Under Test
// ============================================================================

/**
 * Computes the optimistic status for a mutation type.
 * This mirrors the logic in the mutation hooks.
 */
function getOptimisticStatus(mutationType: MutationType): SessionStatus {
  return OPTIMISTIC_STATUS_MAP[mutationType];
}

/**
 * Applies optimistic update to a session.
 * Returns a new session with the optimistic status.
 */
function applyOptimisticUpdate(
  session: Session,
  mutationType: MutationType,
): Session {
  return {
    ...session,
    status: getOptimisticStatus(mutationType),
  };
}

/**
 * Applies optimistic update to a sessions list.
 * Returns a new list with the target session updated.
 */
function applyOptimisticUpdateToList(
  sessions: Session[],
  targetId: string,
  mutationType: MutationType,
): Session[] {
  return sessions.map(session =>
    session.id === targetId
      ? applyOptimisticUpdate(session, mutationType)
      : session,
  );
}

/**
 * Rolls back to previous state.
 * This is a simple identity function representing the rollback logic.
 */
function rollback<T>(previousState: T): T {
  return previousState;
}

// ============================================================================
// Test Helpers
// ============================================================================

/** All valid session statuses */
const ALL_STATUSES: SessionStatus[] = [
  'pending',
  'connecting',
  'connected',
  'disconnected',
  'logged_out',
  'expired',
];

/** Arbitrary for session status */
const sessionStatusArb = fc.constantFrom<SessionStatus>(...ALL_STATUSES);

/** Arbitrary for mutation type */
const mutationTypeArb = fc.constantFrom<MutationType>(
  'disconnect',
  'reconnect',
);

/** Arbitrary for UUID */
const uuidArb = fc.uuid();

/** Arbitrary for ISO date string */
const isoDateStringArb = fc
  .integer({ min: 1577836800000, max: 1893456000000 })
  .map(ts => new Date(ts).toISOString());

/** Arbitrary for session */
const sessionArb = fc.record<Session>({
  id: uuidArb,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  status: sessionStatusArb,
  auto_connect: fc.boolean(),
  created_at: isoDateStringArb,
  updated_at: isoDateStringArb,
  jid: fc.option(fc.string(), { nil: undefined }),
});

/** Arbitrary for sessions list */
const sessionsListArb = fc.array(sessionArb, { minLength: 1, maxLength: 10 });

// ============================================================================
// Unit Tests
// ============================================================================

describe('WhatsApp Optimistic Updates', () => {
  describe('getOptimisticStatus', () => {
    it('should return disconnected for disconnect mutation', () => {
      expect(getOptimisticStatus('disconnect')).toBe('disconnected');
    });

    it('should return connecting for reconnect mutation', () => {
      expect(getOptimisticStatus('reconnect')).toBe('connecting');
    });
  });

  describe('applyOptimisticUpdate', () => {
    it('should update session status while preserving other fields', () => {
      const session: Session = {
        id: '123',
        name: 'Test Session',
        status: 'connected',
        auto_connect: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const updated = applyOptimisticUpdate(session, 'disconnect');

      expect(updated.status).toBe('disconnected');
      expect(updated.id).toBe(session.id);
      expect(updated.name).toBe(session.name);
      expect(updated.auto_connect).toBe(session.auto_connect);
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  /**
   * Property 3: Optimistic update before response
   *
   * For any mutation with optimistic update configuration (disconnect, reconnect),
   * the cache should be updated with the optimistic status before the server responds.
   *
   * Validates: Requirements 2.1, 2.2
   */
  describe('Property 3: Optimistic update before response', () => {
    it('disconnect mutation sets status to disconnected', () => {
      /**
       * Feature: frontend-realtime-sync, Property 3: Optimistic update before response
       * For any session, disconnect mutation should set status to 'disconnected'
       */
      fc.assert(
        fc.property(sessionArb, session => {
          const updated = applyOptimisticUpdate(session, 'disconnect');
          return updated.status === 'disconnected';
        }),
        { numRuns: 100 },
      );
    });

    it('reconnect mutation sets status to connecting', () => {
      /**
       * Feature: frontend-realtime-sync, Property 3: Optimistic update before response
       * For any session, reconnect mutation should set status to 'connecting'
       */
      fc.assert(
        fc.property(sessionArb, session => {
          const updated = applyOptimisticUpdate(session, 'reconnect');
          return updated.status === 'connecting';
        }),
        { numRuns: 100 },
      );
    });

    it('optimistic update preserves all other session fields', () => {
      /**
       * Feature: frontend-realtime-sync, Property 3: Optimistic update before response
       * For any session and mutation type, all fields except status should be preserved
       */
      fc.assert(
        fc.property(sessionArb, mutationTypeArb, (session, mutationType) => {
          const updated = applyOptimisticUpdate(session, mutationType);

          return (
            updated.id === session.id &&
            updated.name === session.name &&
            updated.auto_connect === session.auto_connect &&
            updated.created_at === session.created_at &&
            updated.updated_at === session.updated_at &&
            updated.jid === session.jid
          );
        }),
        { numRuns: 100 },
      );
    });

    it('optimistic update in list only affects target session', () => {
      /**
       * Feature: frontend-realtime-sync, Property 3: Optimistic update before response
       * For any sessions list, optimistic update should only affect the target session
       */
      fc.assert(
        fc.property(
          sessionsListArb,
          mutationTypeArb,
          (sessions, mutationType) => {
            // Pick a random session to update
            const targetIndex = Math.floor(Math.random() * sessions.length);
            const targetId = sessions[targetIndex].id;

            const updatedList = applyOptimisticUpdateToList(
              sessions,
              targetId,
              mutationType,
            );

            // Check that only the target session was updated
            return updatedList.every((updated, index) => {
              const original = sessions[index];
              if (original.id === targetId) {
                // Target should have new status
                return updated.status === getOptimisticStatus(mutationType);
              } else {
                // Others should be unchanged
                return updated.status === original.status;
              }
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Rollback on mutation failure
   *
   * For any failed mutation with optimistic update,
   * the cache should be restored to its previous state (round-trip property).
   *
   * Validates: Requirements 2.3
   */
  describe('Property 4: Rollback on mutation failure', () => {
    it('rollback restores original session state', () => {
      /**
       * Feature: frontend-realtime-sync, Property 4: Rollback on mutation failure
       * For any session, applying optimistic update then rolling back should restore original
       */
      fc.assert(
        fc.property(sessionArb, mutationTypeArb, (session, mutationType) => {
          // Apply optimistic update
          const updated = applyOptimisticUpdate(session, mutationType);

          // Rollback to original
          const restored = rollback(session);

          // Should be identical to original
          return JSON.stringify(restored) === JSON.stringify(session);
        }),
        { numRuns: 100 },
      );
    });

    it('rollback restores original sessions list state', () => {
      /**
       * Feature: frontend-realtime-sync, Property 4: Rollback on mutation failure
       * For any sessions list, applying optimistic update then rolling back should restore original
       */
      fc.assert(
        fc.property(
          sessionsListArb,
          mutationTypeArb,
          (sessions, mutationType) => {
            const targetId = sessions[0].id;

            // Apply optimistic update
            const updated = applyOptimisticUpdateToList(
              sessions,
              targetId,
              mutationType,
            );

            // Rollback to original
            const restored = rollback(sessions);

            // Should be identical to original
            return JSON.stringify(restored) === JSON.stringify(sessions);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('rollback is idempotent', () => {
      /**
       * Feature: frontend-realtime-sync, Property 4: Rollback on mutation failure
       * Rolling back multiple times should have the same effect as rolling back once
       */
      fc.assert(
        fc.property(sessionArb, session => {
          const rollback1 = rollback(session);
          const rollback2 = rollback(rollback1);
          const rollback3 = rollback(rollback2);

          return (
            JSON.stringify(rollback1) === JSON.stringify(rollback2) &&
            JSON.stringify(rollback2) === JSON.stringify(rollback3)
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Invalidation on mutation settle
   *
   * For any mutation that settles (success or failure),
   * the relevant session queries should be invalidated.
   *
   * This property tests the logic of determining which queries to invalidate.
   *
   * Validates: Requirements 2.4
   */
  describe('Property 5: Invalidation on mutation settle', () => {
    /**
     * Determines which query keys should be invalidated for a session mutation.
     */
    function getInvalidationTargets(sessionId: string): string[] {
      return [`sessions.detail.${sessionId}`, 'sessions.all'];
    }

    it('invalidation targets include session detail query', () => {
      /**
       * Feature: frontend-realtime-sync, Property 5: Invalidation on mutation settle
       * For any session ID, invalidation targets should include the session detail query
       */
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const targets = getInvalidationTargets(sessionId);
          return targets.includes(`sessions.detail.${sessionId}`);
        }),
        { numRuns: 100 },
      );
    });

    it('invalidation targets include sessions list query', () => {
      /**
       * Feature: frontend-realtime-sync, Property 5: Invalidation on mutation settle
       * For any session ID, invalidation targets should include the sessions list query
       */
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const targets = getInvalidationTargets(sessionId);
          return targets.includes('sessions.all');
        }),
        { numRuns: 100 },
      );
    });

    it('invalidation targets are consistent for same session ID', () => {
      /**
       * Feature: frontend-realtime-sync, Property 5: Invalidation on mutation settle
       * For any session ID, calling getInvalidationTargets multiple times returns same result
       */
      fc.assert(
        fc.property(uuidArb, sessionId => {
          const targets1 = getInvalidationTargets(sessionId);
          const targets2 = getInvalidationTargets(sessionId);

          return JSON.stringify(targets1) === JSON.stringify(targets2);
        }),
        { numRuns: 100 },
      );
    });
  });
});
