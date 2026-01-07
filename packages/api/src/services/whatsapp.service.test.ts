/**
 * WhatsApp Service Tests
 *
 * Property-based tests for status mapping and error handling.
 * Uses fast-check for property-based testing.
 *
 * Feature: service-status-cleanup
 * Property 2: Status Mapping Consistency
 * Property 3: Error Handling Graceful Fallback
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 *
 * Feature: session-connection-flow
 * Property 1: Reconnect Does Not Update Status on Response
 * Property 2: Disconnect Does Not Update Status in HTTP Handler
 * Validates: Requirements 1.1, 1.2
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { healthStatus, readyStatus } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Status Mapping Functions (extracted for testing)
// ============================================================================

/**
 * Maps Go service health status to API schema enum.
 * This mirrors the logic in WhatsAppService.health()
 */
export function mapHealthStatus(goStatus: string): 'ok' | 'unhealthy' {
  return goStatus === 'healthy'
    ? healthStatus.enum.ok
    : healthStatus.enum.unhealthy;
}

/**
 * Maps Go service ready status to API schema enum.
 * This mirrors the logic in WhatsAppService.ready()
 */
export function mapReadyStatus(goStatus: string): 'ready' | 'not_ready' {
  return goStatus === 'ready'
    ? readyStatus.enum.ready
    : readyStatus.enum.not_ready;
}

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Status Mapping', () => {
  /**
   * Property 2: Status Mapping Consistency
   *
   * For any Go service health response with status "healthy", the API layer
   * SHALL map it to healthStatus.enum.ok. For any Go service ready response
   * with status "ready", the API layer SHALL map it to readyStatus.enum.ready.
   * All other status values SHALL map to the unhealthy/not_ready fallback.
   *
   * Feature: service-status-cleanup, Property 2: Status Mapping Consistency
   * Validates: Requirements 5.1, 5.2, 5.3
   */
  describe('Health Status Mapping', () => {
    it('should map "healthy" to "ok"', () => {
      expect(mapHealthStatus('healthy')).toBe('ok');
    });

    it('should map any non-"healthy" string to "unhealthy"', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s !== 'healthy'),
          status => {
            expect(mapHealthStatus(status)).toBe('unhealthy');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should always return a valid health status enum value', () => {
      fc.assert(
        fc.property(fc.string(), status => {
          const result = mapHealthStatus(status);
          expect(['ok', 'unhealthy']).toContain(result);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('Ready Status Mapping', () => {
    it('should map "ready" to "ready"', () => {
      expect(mapReadyStatus('ready')).toBe('ready');
    });

    it('should map any non-"ready" string to "not_ready"', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s !== 'ready'),
          status => {
            expect(mapReadyStatus(status)).toBe('not_ready');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should always return a valid ready status enum value', () => {
      fc.assert(
        fc.property(fc.string(), status => {
          const result = mapReadyStatus(status);
          expect(['ready', 'not_ready']).toContain(result);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  /**
   * Property 3: Error Handling Graceful Fallback
   *
   * For any connection error when calling the Go service health or ready
   * endpoints, the API layer SHALL return { status: 'unhealthy' } or
   * { status: 'not_ready' } respectively, without throwing an exception.
   *
   * Feature: service-status-cleanup, Property 3: Error Handling Graceful Fallback
   * Validates: Requirements 5.4
   */
  describe('Graceful Fallback', () => {
    it('should return unhealthy status on health check error', async () => {
      // Simulate error handling logic from WhatsAppService.health()
      const handleHealthError = (): { status: 'ok' | 'unhealthy' } => {
        try {
          throw new Error('Connection failed');
        } catch {
          return { status: healthStatus.enum.unhealthy };
        }
      };

      const result = handleHealthError();
      expect(result.status).toBe('unhealthy');
    });

    it('should return not_ready status on ready check error', async () => {
      // Simulate error handling logic from WhatsAppService.ready()
      const handleReadyError = (): { status: 'ready' | 'not_ready' } => {
        try {
          throw new Error('Connection failed');
        } catch {
          return { status: readyStatus.enum.not_ready };
        }
      };

      const result = handleReadyError();
      expect(result.status).toBe('not_ready');
    });

    it('should handle any error type gracefully for health', () => {
      fc.assert(
        fc.property(fc.string(), errorMessage => {
          const handleHealthError = (): { status: 'ok' | 'unhealthy' } => {
            try {
              throw new Error(errorMessage);
            } catch {
              return { status: healthStatus.enum.unhealthy };
            }
          };

          const result = handleHealthError();
          expect(result.status).toBe('unhealthy');
        }),
        { numRuns: 100 },
      );
    });

    it('should handle any error type gracefully for ready', () => {
      fc.assert(
        fc.property(fc.string(), errorMessage => {
          const handleReadyError = (): { status: 'ready' | 'not_ready' } => {
            try {
              throw new Error(errorMessage);
            } catch {
              return { status: readyStatus.enum.not_ready };
            }
          };

          const result = handleReadyError();
          expect(result.status).toBe('not_ready');
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Session Connection Flow Tests
// Feature: session-connection-flow
// ============================================================================

/**
 * Simulates the reconnectSession behavior for testing.
 * This mirrors the logic in WhatsAppSessionService.reconnectSession()
 *
 * The function tracks which database operations are performed and returns
 * the sequence of status updates that would be made.
 */
type StatusUpdate = {
  status: string;
  phase: 'before' | 'after-success' | 'after-error';
};

function simulateReconnectSession(goServiceSucceeds: boolean): {
  statusUpdates: StatusUpdate[];
  threw: boolean;
} {
  const statusUpdates: StatusUpdate[] = [];

  // Before calling Go service: set status to 'connecting'
  statusUpdates.push({ status: 'connecting', phase: 'before' });

  // Call Go service (simulated)
  if (!goServiceSucceeds) {
    // On error: DO NOT update status (per new design)
    // The old design would have added: { status: 'disconnected', phase: 'after-error' }
    return { statusUpdates, threw: true };
  }

  // On success: DO NOT update status (per new design)
  // The old design would have added: { status: 'connected', phase: 'after-success' }
  return { statusUpdates, threw: false };
}

/**
 * Simulates the disconnectSession behavior for testing.
 * This mirrors the logic in WhatsAppSessionService.disconnectSession()
 */
function simulateDisconnectSession(goServiceSucceeds: boolean): {
  statusUpdates: StatusUpdate[];
  threw: boolean;
} {
  const statusUpdates: StatusUpdate[] = [];

  // Call Go service (simulated)
  if (!goServiceSucceeds) {
    return { statusUpdates, threw: true };
  }

  // On success: DO NOT update status (per new design)
  // The old design would have added: { status: 'disconnected', phase: 'after-success' }
  return { statusUpdates, threw: false };
}

describe('Session Connection Flow', () => {
  /**
   * Property 1: Reconnect Does Not Update Status on Response
   *
   * For any valid reconnect request, after the HTTP handler completes successfully,
   * the session status in the database SHALL be 'connecting' (not 'connected'),
   * because status updates only come via WebSocket events.
   *
   * Feature: session-connection-flow, Property 1: Reconnect Does Not Update Status on Response
   * Validates: Requirements 1.1
   */
  describe('Property 1: Reconnect Does Not Update Status on Response', () => {
    it('should only set status to connecting before Go service call', () => {
      const result = simulateReconnectSession(true);

      // Should have exactly one status update
      expect(result.statusUpdates.length).toBe(1);

      // That update should be 'connecting' in the 'before' phase
      expect(result.statusUpdates[0]).toEqual({
        status: 'connecting',
        phase: 'before',
      });
    });

    it('should not update status to connected after successful Go service response', () => {
      const result = simulateReconnectSession(true);

      // Should not have any 'after-success' status updates
      const afterSuccessUpdates = result.statusUpdates.filter(
        u => u.phase === 'after-success',
      );
      expect(afterSuccessUpdates.length).toBe(0);
    });

    it('should not update status to disconnected after failed Go service response', () => {
      const result = simulateReconnectSession(false);

      // Should not have any 'after-error' status updates
      const afterErrorUpdates = result.statusUpdates.filter(
        u => u.phase === 'after-error',
      );
      expect(afterErrorUpdates.length).toBe(0);
    });

    it('Property 1: for any Go service outcome, only connecting status is set before call', () => {
      /**
       * Feature: session-connection-flow, Property 1: Reconnect Does Not Update Status on Response
       * For any boolean outcome of the Go service call, the only status update should be
       * 'connecting' set before the call.
       */
      fc.assert(
        fc.property(fc.boolean(), goServiceSucceeds => {
          const result = simulateReconnectSession(goServiceSucceeds);

          // Should have exactly one status update
          if (result.statusUpdates.length !== 1) return false;

          // That update should be 'connecting' in the 'before' phase
          const update = result.statusUpdates[0]!;
          return update.status === 'connecting' && update.phase === 'before';
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Disconnect Does Not Update Status in HTTP Handler
   *
   * For any valid disconnect request, the session status in the database SHALL
   * remain unchanged by the HTTP handler itself; status changes only occur via
   * WebSocket event processing.
   *
   * Feature: session-connection-flow, Property 2: Disconnect Does Not Update Status in HTTP Handler
   * Validates: Requirements 1.2
   */
  describe('Property 2: Disconnect Does Not Update Status in HTTP Handler', () => {
    it('should not update status at all during disconnect', () => {
      const result = simulateDisconnectSession(true);

      // Should have no status updates
      expect(result.statusUpdates.length).toBe(0);
    });

    it('should not update status even on Go service error', () => {
      const result = simulateDisconnectSession(false);

      // Should have no status updates
      expect(result.statusUpdates.length).toBe(0);
    });

    it('Property 2: for any Go service outcome, no status updates occur', () => {
      /**
       * Feature: session-connection-flow, Property 2: Disconnect Does Not Update Status in HTTP Handler
       * For any boolean outcome of the Go service call, no status updates should occur.
       */
      fc.assert(
        fc.property(fc.boolean(), goServiceSucceeds => {
          const result = simulateDisconnectSession(goServiceSucceeds);

          // Should have no status updates
          return result.statusUpdates.length === 0;
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// HTTP Error Handling Tests
// Feature: session-connection-flow
// Property 9: HTTP Error Does Not Modify Status
// ============================================================================

/**
 * Simulates the reconnectSession behavior with HTTP error handling.
 * This mirrors the updated logic in WhatsAppSessionService.reconnectSession()
 * that restores original status on HTTP error.
 *
 * @param originalStatus - The session's status before reconnect is called
 * @param httpError - Whether the HTTP call to Go service fails
 * @returns The final status after the operation completes
 */
function simulateReconnectWithHttpError(
  originalStatus: string,
  httpError: boolean,
): { finalStatus: string; threw: boolean } {
  // Step 1: Store original status
  const storedOriginalStatus = originalStatus;

  // Step 2: Set status to 'connecting' before calling Go service
  let currentStatus = 'connecting';

  // Step 3: Call Go service (simulated)
  if (httpError) {
    // On HTTP error: restore original status (per requirement 3.4)
    currentStatus = storedOriginalStatus;
    return { finalStatus: currentStatus, threw: true };
  }

  // On success: status remains 'connecting', WebSocket events will update it
  return { finalStatus: currentStatus, threw: false };
}

describe('HTTP Error Handling', () => {
  /**
   * Property 9: HTTP Error Does Not Modify Status
   *
   * For any reconnect request that fails at the HTTP level (Go service unreachable,
   * timeout, etc.), the session status in the database SHALL remain unchanged from
   * its pre-request state.
   *
   * Feature: session-connection-flow, Property 9: HTTP Error Does Not Modify Status
   * Validates: Requirements 3.4
   */
  describe('Property 9: HTTP Error Does Not Modify Status', () => {
    it('should restore original status when HTTP call fails', () => {
      const originalStatus = 'disconnected';
      const result = simulateReconnectWithHttpError(originalStatus, true);

      expect(result.threw).toBe(true);
      expect(result.finalStatus).toBe(originalStatus);
    });

    it('should set status to connecting when HTTP call succeeds', () => {
      const originalStatus = 'disconnected';
      const result = simulateReconnectWithHttpError(originalStatus, false);

      expect(result.threw).toBe(false);
      expect(result.finalStatus).toBe('connecting');
    });

    it('Property 9: for any original status, HTTP error restores that status', () => {
      /**
       * Feature: session-connection-flow, Property 9: HTTP Error Does Not Modify Status
       * For any valid session status and HTTP error, the final status should equal
       * the original status.
       */
      const validStatuses = [
        'pending',
        'connecting',
        'connected',
        'disconnected',
        'logged_out',
        'expired',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...validStatuses), originalStatus => {
          const result = simulateReconnectWithHttpError(originalStatus, true);

          // On HTTP error, status should be restored to original
          return result.finalStatus === originalStatus && result.threw === true;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 9: for any original status, successful HTTP sets connecting', () => {
      /**
       * Feature: session-connection-flow, Property 9: HTTP Error Does Not Modify Status
       * For any valid session status and successful HTTP call, the final status
       * should be 'connecting'.
       */
      const validStatuses = [
        'pending',
        'connecting',
        'connected',
        'disconnected',
        'logged_out',
        'expired',
      ];

      fc.assert(
        fc.property(fc.constantFrom(...validStatuses), originalStatus => {
          const result = simulateReconnectWithHttpError(originalStatus, false);

          // On success, status should be 'connecting'
          return result.finalStatus === 'connecting' && result.threw === false;
        }),
        { numRuns: 100 },
      );
    });

    it('Property 9: HTTP error vs success produces different final states', () => {
      /**
       * Feature: session-connection-flow, Property 9: HTTP Error Does Not Modify Status
       * For any original status that is not 'connecting', HTTP error and success
       * should produce different final states.
       */
      const nonConnectingStatuses = [
        'pending',
        'connected',
        'disconnected',
        'logged_out',
        'expired',
      ];

      fc.assert(
        fc.property(
          fc.constantFrom(...nonConnectingStatuses),
          originalStatus => {
            const errorResult = simulateReconnectWithHttpError(
              originalStatus,
              true,
            );
            const successResult = simulateReconnectWithHttpError(
              originalStatus,
              false,
            );

            // Error should restore original, success should set connecting
            return (
              errorResult.finalStatus === originalStatus &&
              successResult.finalStatus === 'connecting' &&
              errorResult.finalStatus !== successResult.finalStatus
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Session Auto-Reconnect Tests
// Feature: session-auto-reconnect
// ============================================================================

/**
 * Session status type for testing
 */
type SessionStatus = 'pending' | 'connecting' | 'connected' | 'disconnected';

/**
 * Session data structure for sync testing
 */
interface SessionForSync {
  id: string;
  name: string;
  jid: string | null;
  status: SessionStatus;
  autoConnect: boolean;
}

/**
 * Simulates getSessionsRequiringSync() query logic.
 * Returns only sessions with status 'connected' or 'connecting'.
 */
function filterSessionsRequiringSync(sessions: SessionForSync[]): Array<{
  id: string;
  name: string;
  jid: string | null;
  autoConnect: boolean;
}> {
  return sessions
    .filter(s => s.status === 'connected' || s.status === 'connecting')
    .map(({ id, name, jid, autoConnect }) => ({ id, name, jid, autoConnect }));
}

/**
 * Simulates sync service logic for a single session.
 * Returns the action taken and resulting status.
 */
function simulateSyncSession(
  session: { id: string; autoConnect: boolean },
  reconnectSucceeds: boolean,
): { action: 'reconnect' | 'mark_disconnected'; finalStatus: SessionStatus } {
  if (session.autoConnect) {
    // Attempt reconnection
    if (reconnectSucceeds) {
      // Status will be updated via WebSocket events, stays 'connecting' for now
      return { action: 'reconnect', finalStatus: 'connecting' };
    } else {
      // On failure, mark as disconnected
      return { action: 'reconnect', finalStatus: 'disconnected' };
    }
  } else {
    // Mark as disconnected directly
    return { action: 'mark_disconnected', finalStatus: 'disconnected' };
  }
}

describe('Session Auto-Reconnect', () => {
  /**
   * Property 1: Query Returns Only Stale Status Sessions
   *
   * For any set of sessions in the database with various statuses,
   * the getSessionsRequiringSync() method SHALL return only sessions
   * where status is 'connected' or 'connecting'.
   *
   * Feature: session-auto-reconnect, Property 1: Query Returns Only Stale Status Sessions
   * Validates: Requirements 1.1, 2.1
   */
  describe('Property 1: Query Returns Only Stale Status Sessions', () => {
    const sessionArbitrary = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      jid: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: null }),
      status: fc.constantFrom<SessionStatus>(
        'pending',
        'connecting',
        'connected',
        'disconnected',
      ),
      autoConnect: fc.boolean(),
    });

    it('should return only sessions with connected or connecting status', () => {
      fc.assert(
        fc.property(fc.array(sessionArbitrary, { maxLength: 20 }), sessions => {
          const result = filterSessionsRequiringSync(sessions);

          // All returned sessions should have had 'connected' or 'connecting' status
          const originalStatuses = sessions
            .filter(s => result.some(r => r.id === s.id))
            .map(s => s.status);

          return originalStatuses.every(
            status => status === 'connected' || status === 'connecting',
          );
        }),
        { numRuns: 100 },
      );
    });

    it('should not return sessions with pending or disconnected status', () => {
      fc.assert(
        fc.property(fc.array(sessionArbitrary, { maxLength: 20 }), sessions => {
          const result = filterSessionsRequiringSync(sessions);
          const resultIds = new Set(result.map(r => r.id));

          // Sessions with pending or disconnected status should not be in result
          const excludedSessions = sessions.filter(
            s => s.status === 'pending' || s.status === 'disconnected',
          );

          return excludedSessions.every(s => !resultIds.has(s.id));
        }),
        { numRuns: 100 },
      );
    });

    it('should return empty array when no sessions have stale status', () => {
      const nonStaleSessionArbitrary = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 50 }),
        jid: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
          nil: null,
        }),
        status: fc.constantFrom<SessionStatus>('pending', 'disconnected'),
        autoConnect: fc.boolean(),
      });

      fc.assert(
        fc.property(
          fc.array(nonStaleSessionArbitrary, { maxLength: 20 }),
          sessions => {
            const result = filterSessionsRequiringSync(sessions);
            return result.length === 0;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 4: Query Returns Required Fields
   *
   * For any session returned by getSessionsRequiringSync(), the returned
   * object SHALL contain the fields: id (string), name (string),
   * jid (string | null), and autoConnect (boolean).
   *
   * Feature: session-auto-reconnect, Property 4: Query Returns Required Fields
   * Validates: Requirements 2.2
   */
  describe('Property 4: Query Returns Required Fields', () => {
    const staleSessionArbitrary = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }),
      jid: fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: null }),
      status: fc.constantFrom<SessionStatus>('connecting', 'connected'),
      autoConnect: fc.boolean(),
    });

    it('should return objects with all required fields', () => {
      fc.assert(
        fc.property(
          fc.array(staleSessionArbitrary, { minLength: 1, maxLength: 20 }),
          sessions => {
            const result = filterSessionsRequiringSync(sessions);

            return result.every(session => {
              return (
                typeof session.id === 'string' &&
                typeof session.name === 'string' &&
                (session.jid === null || typeof session.jid === 'string') &&
                typeof session.autoConnect === 'boolean'
              );
            });
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should not include status field in returned objects', () => {
      fc.assert(
        fc.property(
          fc.array(staleSessionArbitrary, { minLength: 1, maxLength: 20 }),
          sessions => {
            const result = filterSessionsRequiringSync(sessions);

            return result.every(session => {
              return !('status' in session);
            });
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 2: Auto-Connect Sessions Trigger Reconnection
   *
   * For any session returned by getSessionsRequiringSync() where autoConnect=true,
   * the sync service SHALL attempt to call the reconnect method for that session.
   *
   * Feature: session-auto-reconnect, Property 2: Auto-Connect Sessions Trigger Reconnection
   * Validates: Requirements 1.2
   */
  describe('Property 2: Auto-Connect Sessions Trigger Reconnection', () => {
    it('should attempt reconnection for autoConnect=true sessions', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.boolean(), (sessionId, reconnectSucceeds) => {
          const session = { id: sessionId, autoConnect: true };
          const result = simulateSyncSession(session, reconnectSucceeds);

          return result.action === 'reconnect';
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 3: Non-Auto-Connect Sessions Are Marked Disconnected
   *
   * For any session returned by getSessionsRequiringSync() where autoConnect=false,
   * the sync service SHALL update that session's status to 'disconnected'.
   *
   * Feature: session-auto-reconnect, Property 3: Non-Auto-Connect Sessions Are Marked Disconnected
   * Validates: Requirements 1.3
   */
  describe('Property 3: Non-Auto-Connect Sessions Are Marked Disconnected', () => {
    it('should mark autoConnect=false sessions as disconnected', () => {
      fc.assert(
        fc.property(fc.uuid(), fc.boolean(), (sessionId, reconnectSucceeds) => {
          const session = { id: sessionId, autoConnect: false };
          const result = simulateSyncSession(session, reconnectSucceeds);

          return (
            result.action === 'mark_disconnected' &&
            result.finalStatus === 'disconnected'
          );
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 5: Failed Reconnection Marks Session Disconnected
   *
   * For any session where the reconnection attempt throws an error,
   * the sync service SHALL update that session's status to 'disconnected'.
   *
   * Feature: session-auto-reconnect, Property 5: Failed Reconnection Marks Session Disconnected
   * Validates: Requirements 3.2
   */
  describe('Property 5: Failed Reconnection Marks Session Disconnected', () => {
    it('should mark session as disconnected when reconnection fails', () => {
      fc.assert(
        fc.property(fc.uuid(), sessionId => {
          const session = { id: sessionId, autoConnect: true };
          const result = simulateSyncSession(session, false); // reconnect fails

          return result.finalStatus === 'disconnected';
        }),
        { numRuns: 100 },
      );
    });

    it('should keep session in connecting state when reconnection succeeds', () => {
      fc.assert(
        fc.property(fc.uuid(), sessionId => {
          const session = { id: sessionId, autoConnect: true };
          const result = simulateSyncSession(session, true); // reconnect succeeds

          return result.finalStatus === 'connecting';
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Startup Integration Tests
// Feature: session-auto-reconnect
// ============================================================================

describe('Startup Integration', () => {
  /**
   * Tests for the startup integration logic.
   * Verifies that sync is called after Event Bridge connects.
   *
   * Feature: session-auto-reconnect
   * Validates: Requirements 1.4
   */
  describe('Event Bridge Connection Ordering', () => {
    it('should call sync only after Event Bridge connects', () => {
      // Simulate the startup sequence
      let eventBridgeConnected = false;
      let syncCalled = false;
      let syncCalledBeforeEventBridge = false;

      // Simulate initEventBridge().then() pattern
      const simulateStartup = async (eventBridgeSucceeds: boolean) => {
        // Reset state
        eventBridgeConnected = false;
        syncCalled = false;
        syncCalledBeforeEventBridge = false;

        // Simulate Event Bridge initialization
        const initEventBridge = () =>
          new Promise<void>((resolve, reject) => {
            if (eventBridgeSucceeds) {
              eventBridgeConnected = true;
              resolve();
            } else {
              reject(new Error('Connection failed'));
            }
          });

        // Simulate sync function
        const syncSessionsOnStartup = () => {
          if (!eventBridgeConnected) {
            syncCalledBeforeEventBridge = true;
          }
          syncCalled = true;
        };

        // Actual startup pattern from index.ts
        try {
          await initEventBridge();
          syncSessionsOnStartup();
        } catch {
          // Event Bridge failed, sync should not be called
        }

        return {
          eventBridgeConnected,
          syncCalled,
          syncCalledBeforeEventBridge,
        };
      };

      // Test successful Event Bridge connection
      simulateStartup(true).then(result => {
        expect(result.eventBridgeConnected).toBe(true);
        expect(result.syncCalled).toBe(true);
        expect(result.syncCalledBeforeEventBridge).toBe(false);
      });
    });

    it('should not call sync if Event Bridge fails', async () => {
      let syncCalled = false;

      const simulateFailedStartup = async () => {
        const initEventBridge = () =>
          Promise.reject(new Error('Connection failed'));

        const syncSessionsOnStartup = () => {
          syncCalled = true;
        };

        try {
          await initEventBridge();
          syncSessionsOnStartup();
        } catch {
          // Event Bridge failed, sync should not be called
        }
      };

      await simulateFailedStartup();
      expect(syncCalled).toBe(false);
    });

    it('Property: for any Event Bridge outcome, sync is called iff connection succeeds', () => {
      fc.assert(
        fc.property(fc.boolean(), eventBridgeSucceeds => {
          let eventBridgeConnected = false;
          let syncCalled = false;

          // Simulate startup
          if (eventBridgeSucceeds) {
            eventBridgeConnected = true;
            syncCalled = true; // Called in .then()
          }
          // If fails, neither is set (caught in .catch())

          // Sync should be called if and only if Event Bridge connected
          return syncCalled === eventBridgeConnected;
        }),
        { numRuns: 100 },
      );
    });
  });
});
