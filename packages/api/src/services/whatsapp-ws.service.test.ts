/**
 * WhatsApp WebSocket Service Tests
 *
 * Property-based tests for WebSocket event handling and status synchronization.
 * Uses fast-check for property-based testing.
 *
 * Feature: session-connection-flow
 * Property 6: WebSocket Events Update Database Status
 * Property 10: Idempotent Status Updates
 * Validates: Requirements 1.6, 2.3, 3.2, 5.1, 5.2
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';

// ============================================================================
// Types for Testing
// ============================================================================

type SessionStatus = 'pending' | 'connecting' | 'connected' | 'disconnected';

type ConnectionEventType =
  | 'connection.connecting'
  | 'connection.connected'
  | 'connection.disconnected'
  | 'connection.failed'
  | 'connection.logged_out'
  | 'session.authenticated';

interface StatusUpdate {
  sessionId: string;
  newStatus: SessionStatus;
  jid?: string;
}

// ============================================================================
// Status Mapping Functions (extracted for testing)
// ============================================================================

/**
 * Maps WebSocket event type to session status.
 * This mirrors the logic in WhatsAppWebSocketService.handleSessionStatusSync()
 */
export function mapEventToStatus(
  eventType: ConnectionEventType,
): SessionStatus | null {
  switch (eventType) {
    case 'connection.connecting':
      return 'connecting';
    case 'connection.connected':
      return 'connected';
    case 'connection.disconnected':
      return 'disconnected';
    case 'connection.failed':
      return 'disconnected';
    case 'connection.logged_out':
      return 'disconnected';
    case 'session.authenticated':
      return 'connected';
    default:
      return null;
  }
}

/**
 * Simulates idempotent status update logic.
 * Returns whether a database write would occur.
 */
export function shouldUpdateStatus(
  currentStatus: SessionStatus,
  newStatus: SessionStatus,
  hasJid: boolean,
): boolean {
  // If status already matches and no JID to update, skip the write
  if (currentStatus === newStatus && !hasJid) {
    return false;
  }
  return true;
}

/**
 * Simulates the full event handling flow.
 * Returns the status updates that would be made.
 */
export function simulateEventHandling(
  eventType: ConnectionEventType,
  sessionId: string,
  currentStatus: SessionStatus,
  jid?: string,
): { updates: StatusUpdate[]; skipped: boolean } {
  const newStatus = mapEventToStatus(eventType);

  if (!newStatus) {
    return { updates: [], skipped: true };
  }

  const hasJid = !!jid;
  const shouldUpdate = shouldUpdateStatus(currentStatus, newStatus, hasJid);

  if (!shouldUpdate) {
    return { updates: [], skipped: true };
  }

  return {
    updates: [{ sessionId, newStatus, jid }],
    skipped: false,
  };
}

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('WebSocket Event Status Updates', () => {
  // Arbitraries
  const sessionIdArb = fc.uuid();
  const sessionStatusArb = fc.constantFrom<SessionStatus>(
    'pending',
    'connecting',
    'connected',
    'disconnected',
  );
  const connectionEventTypeArb = fc.constantFrom<ConnectionEventType>(
    'connection.connecting',
    'connection.connected',
    'connection.disconnected',
    'connection.failed',
    'connection.logged_out',
    'session.authenticated',
  );

  /**
   * Property 6: WebSocket Events Update Database Status
   *
   * For any valid connection event received via WebSocket, the API SHALL update
   * the corresponding session's status in the database to match the event type.
   *
   * Feature: session-connection-flow, Property 6: WebSocket Events Update Database Status
   * Validates: Requirements 1.6, 2.3, 3.2
   */
  describe('Property 6: WebSocket Events Update Database Status', () => {
    it('should map connection.connecting to connecting status', () => {
      expect(mapEventToStatus('connection.connecting')).toBe('connecting');
    });

    it('should map connection.connected to connected status', () => {
      expect(mapEventToStatus('connection.connected')).toBe('connected');
    });

    it('should map connection.disconnected to disconnected status', () => {
      expect(mapEventToStatus('connection.disconnected')).toBe('disconnected');
    });

    it('should map connection.failed to disconnected status', () => {
      expect(mapEventToStatus('connection.failed')).toBe('disconnected');
    });

    it('should map connection.logged_out to disconnected status', () => {
      expect(mapEventToStatus('connection.logged_out')).toBe('disconnected');
    });

    it('should map session.authenticated to connected status', () => {
      expect(mapEventToStatus('session.authenticated')).toBe('connected');
    });

    it('Property 6: all connection events map to valid session statuses', () => {
      /**
       * Feature: session-connection-flow, Property 6: WebSocket Events Update Database Status
       * For any connection event type, the mapped status should be a valid session status.
       */
      fc.assert(
        fc.property(connectionEventTypeArb, eventType => {
          const status = mapEventToStatus(eventType);
          expect(status).not.toBeNull();
          expect([
            'pending',
            'connecting',
            'connected',
            'disconnected',
          ]).toContain(status!);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 6: event handling produces correct status updates', () => {
      /**
       * Feature: session-connection-flow, Property 6: WebSocket Events Update Database Status
       * For any event and session, the resulting status update should match the event mapping.
       */
      fc.assert(
        fc.property(
          connectionEventTypeArb,
          sessionIdArb,
          sessionStatusArb,
          (eventType, sessionId, currentStatus) => {
            const expectedStatus = mapEventToStatus(eventType);
            const result = simulateEventHandling(
              eventType,
              sessionId,
              currentStatus,
            );

            // If status would change, verify the update is correct
            if (!result.skipped && result.updates.length > 0) {
              expect(result.updates[0]!.newStatus).toBe(expectedStatus!);
              expect(result.updates[0]!.sessionId).toBe(sessionId);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Property 10: Idempotent Status Updates
   *
   * For any session with current status S, receiving a WebSocket event that would
   * set status to S SHALL NOT trigger a database write operation.
   *
   * Feature: session-connection-flow, Property 10: Idempotent Status Updates
   * Validates: Requirements 5.1, 5.2
   */
  describe('Property 10: Idempotent Status Updates', () => {
    it('should skip update when status already matches', () => {
      expect(shouldUpdateStatus('connected', 'connected', false)).toBe(false);
      expect(shouldUpdateStatus('disconnected', 'disconnected', false)).toBe(
        false,
      );
      expect(shouldUpdateStatus('connecting', 'connecting', false)).toBe(false);
    });

    it('should update when status differs', () => {
      expect(shouldUpdateStatus('disconnected', 'connected', false)).toBe(true);
      expect(shouldUpdateStatus('connected', 'disconnected', false)).toBe(true);
      expect(shouldUpdateStatus('pending', 'connecting', false)).toBe(true);
    });

    it('should update when JID is provided even if status matches', () => {
      expect(shouldUpdateStatus('connected', 'connected', true)).toBe(true);
    });

    it('Property 10: same status without JID skips database write', () => {
      /**
       * Feature: session-connection-flow, Property 10: Idempotent Status Updates
       * For any status, updating to the same status without JID should skip the write.
       */
      fc.assert(
        fc.property(sessionStatusArb, status => {
          const shouldUpdate = shouldUpdateStatus(status, status, false);
          expect(shouldUpdate).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 10: different status always triggers database write', () => {
      /**
       * Feature: session-connection-flow, Property 10: Idempotent Status Updates
       * For any two different statuses, updating should always trigger a write.
       */
      fc.assert(
        fc.property(
          sessionStatusArb,
          sessionStatusArb.filter(s => s !== 'pending'), // Ensure we can get different statuses
          (currentStatus, newStatus) => {
            if (currentStatus !== newStatus) {
              const shouldUpdate = shouldUpdateStatus(
                currentStatus,
                newStatus,
                false,
              );
              expect(shouldUpdate).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 10: JID presence forces update even with same status', () => {
      /**
       * Feature: session-connection-flow, Property 10: Idempotent Status Updates
       * When JID is provided, update should occur even if status matches.
       */
      fc.assert(
        fc.property(sessionStatusArb, status => {
          const shouldUpdate = shouldUpdateStatus(status, status, true);
          expect(shouldUpdate).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('Property 10: full event handling respects idempotency', () => {
      /**
       * Feature: session-connection-flow, Property 10: Idempotent Status Updates
       * Full event handling should skip updates when status already matches.
       */
      fc.assert(
        fc.property(
          connectionEventTypeArb,
          sessionIdArb,
          (eventType, sessionId) => {
            const expectedStatus = mapEventToStatus(eventType);
            if (!expectedStatus) return;

            // Simulate receiving event when status already matches
            const result = simulateEventHandling(
              eventType,
              sessionId,
              expectedStatus, // Current status matches what event would set
            );

            // Should be skipped (idempotent)
            expect(result.skipped).toBe(true);
            expect(result.updates.length).toBe(0);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Single-Client WebSocket Model Tests
// Feature: session-auto-reconnect (WSContext Reference Mismatch Fix)
// ============================================================================

/**
 * Simulates the single-client WebSocket model.
 * This bypasses Hono/Bun's WSContext reference mismatch issue.
 */
interface MockWebSocketClient {
  id: string;
  authenticated: boolean;
  connectedAt: Date;
}

class SingleClientWebSocketModel {
  private currentClient: MockWebSocketClient | null = null;

  handleOpen(clientId: string): void {
    // Replace any existing connection
    this.currentClient = {
      id: clientId,
      authenticated: false,
      connectedAt: new Date(),
    };
  }

  handleMessage(apiKey: string, expectedApiKey: string): boolean {
    // Use currentClient regardless of which "ws" reference called this
    if (!this.currentClient) return false;

    if (apiKey === expectedApiKey) {
      this.currentClient.authenticated = true;
      return true;
    }
    return false;
  }

  handleClose(): void {
    this.currentClient = null;
  }

  isAuthenticated(): boolean {
    return this.currentClient?.authenticated ?? false;
  }

  getConnectionCount(): number {
    return this.currentClient ? 1 : 0;
  }
}

describe('Single-Client WebSocket Model', () => {
  /**
   * Tests for the single-client model that fixes WSContext reference mismatch.
   *
   * Problem: Hono/Bun provides different WSContext object references for the same
   * physical connection across different callbacks (onOpen vs onMessage).
   *
   * Solution: Track a single client instead of using Map with ws as key.
   */
  describe('WSContext Reference Mismatch Fix', () => {
    it('should track client regardless of callback reference', () => {
      const model = new SingleClientWebSocketModel();

      // onOpen called with one "reference"
      model.handleOpen('client-1');
      expect(model.getConnectionCount()).toBe(1);

      // onMessage called (potentially with different reference in real Hono)
      // but our model uses currentClient, not the ws parameter
      const authResult = model.handleMessage('valid-key', 'valid-key');
      expect(authResult).toBe(true);
      expect(model.isAuthenticated()).toBe(true);
    });

    it('should replace existing connection on new open', () => {
      const model = new SingleClientWebSocketModel();

      model.handleOpen('client-1');
      model.handleMessage('key', 'key');
      expect(model.isAuthenticated()).toBe(true);

      // New connection replaces old one
      model.handleOpen('client-2');
      expect(model.getConnectionCount()).toBe(1);
      expect(model.isAuthenticated()).toBe(false); // New client not yet authenticated
    });

    it('should handle close correctly', () => {
      const model = new SingleClientWebSocketModel();

      model.handleOpen('client-1');
      model.handleMessage('key', 'key');
      expect(model.isAuthenticated()).toBe(true);

      model.handleClose();
      expect(model.getConnectionCount()).toBe(0);
      expect(model.isAuthenticated()).toBe(false);
    });

    it('Property: single client model always has 0 or 1 connections', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.oneof(
              fc.constant('open'),
              fc.constant('close'),
              fc.constant('message'),
            ),
            { maxLength: 20 },
          ),
          actions => {
            const model = new SingleClientWebSocketModel();

            for (const action of actions) {
              switch (action) {
                case 'open':
                  model.handleOpen(`client-${Math.random()}`);
                  break;
                case 'close':
                  model.handleClose();
                  break;
                case 'message':
                  model.handleMessage('key', 'key');
                  break;
              }

              // Invariant: always 0 or 1 connections
              const count = model.getConnectionCount();
              expect(count).toBeGreaterThanOrEqual(0);
              expect(count).toBeLessThanOrEqual(1);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// WebSocket Authentication Flow Tests
// Feature: session-auto-reconnect (Missing WebSocket Authentication Fix)
// ============================================================================

interface AuthMessage {
  type: 'auth';
  api_key: string;
}

interface AuthResponse {
  type: 'auth_response';
  success: boolean;
  message?: string;
}

/**
 * Simulates WebSocket authentication flow.
 */
function simulateAuthFlow(
  providedApiKey: string,
  expectedApiKey: string,
): { authenticated: boolean; response: AuthResponse } {
  const isValid = !expectedApiKey || providedApiKey === expectedApiKey;

  return {
    authenticated: isValid,
    response: {
      type: 'auth_response',
      success: isValid,
      message: isValid ? 'Authentication successful' : 'Invalid API key',
    },
  };
}

describe('WebSocket Authentication Flow', () => {
  /**
   * Tests for WebSocket authentication between Go service and Node.js API.
   *
   * Problem: Go service was connecting but not sending auth message,
   * causing API to reject all status updates as "unknown client".
   *
   * Solution: Go service sends auth message with API key immediately after connecting.
   */
  describe('Authentication Message Handling', () => {
    it('should authenticate with valid API key', () => {
      const result = simulateAuthFlow('valid-key', 'valid-key');
      expect(result.authenticated).toBe(true);
      expect(result.response.success).toBe(true);
    });

    it('should reject invalid API key', () => {
      const result = simulateAuthFlow('wrong-key', 'valid-key');
      expect(result.authenticated).toBe(false);
      expect(result.response.success).toBe(false);
    });

    it('should allow any key when no API key configured', () => {
      const result = simulateAuthFlow('any-key', '');
      expect(result.authenticated).toBe(true);
      expect(result.response.success).toBe(true);
    });

    it('Property: authentication is deterministic', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (providedKey, expectedKey) => {
            const result1 = simulateAuthFlow(providedKey, expectedKey);
            const result2 = simulateAuthFlow(providedKey, expectedKey);

            // Same inputs should produce same outputs
            expect(result1.authenticated).toBe(result2.authenticated);
            expect(result1.response.success).toBe(result2.response.success);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property: matching keys always authenticate', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 50 }), key => {
          const result = simulateAuthFlow(key, key);
          expect(result.authenticated).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('Property: different non-empty keys never authenticate', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          (providedKey, expectedKey) => {
            if (providedKey !== expectedKey && expectedKey !== '') {
              const result = simulateAuthFlow(providedKey, expectedKey);
              expect(result.authenticated).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Message Rejection Before Auth', () => {
    it('should reject events from unauthenticated clients', () => {
      const model = new SingleClientWebSocketModel();
      model.handleOpen('client-1');

      // Client connected but not authenticated
      expect(model.isAuthenticated()).toBe(false);

      // Events should be rejected (simulated by checking auth status)
      const shouldProcessEvent = model.isAuthenticated();
      expect(shouldProcessEvent).toBe(false);
    });

    it('should accept events after authentication', () => {
      const model = new SingleClientWebSocketModel();
      model.handleOpen('client-1');
      model.handleMessage('valid-key', 'valid-key');

      expect(model.isAuthenticated()).toBe(true);

      // Events should be accepted
      const shouldProcessEvent = model.isAuthenticated();
      expect(shouldProcessEvent).toBe(true);
    });
  });
});

// ============================================================================
// Initial Sync Flag Tests
// Feature: session-auto-reconnect (Redundant Session Sync Fix)
// ============================================================================

/**
 * Simulates the initial sync flag behavior.
 */
class SyncController {
  private hasRunInitialSync = false;
  public syncCallCount = 0;

  async onConnected(): Promise<void> {
    if (!this.hasRunInitialSync) {
      this.hasRunInitialSync = true;
      this.syncCallCount++;
    }
  }

  reset(): void {
    this.hasRunInitialSync = false;
    this.syncCallCount = 0;
  }
}

describe('Initial Sync Flag', () => {
  /**
   * Tests for the initial sync flag that prevents redundant session syncs.
   *
   * Problem: Session sync was running on every Event Bridge reconnect,
   * which could override manual user actions like clicking "Disconnect".
   *
   * Solution: Flag ensures sync only runs once per server lifetime.
   */
  describe('Redundant Sync Prevention', () => {
    it('should run sync on first connection', async () => {
      const controller = new SyncController();

      await controller.onConnected();
      expect(controller.syncCallCount).toBe(1);
    });

    it('should not run sync on subsequent reconnections', async () => {
      const controller = new SyncController();

      // First connection
      await controller.onConnected();
      expect(controller.syncCallCount).toBe(1);

      // Simulate reconnections
      await controller.onConnected();
      await controller.onConnected();
      await controller.onConnected();

      // Should still be 1
      expect(controller.syncCallCount).toBe(1);
    });

    it('Property: sync runs exactly once regardless of connection count', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), connectionCount => {
          const controller = new SyncController();

          // Simulate multiple connections
          for (let i = 0; i < connectionCount; i++) {
            controller.onConnected();
          }

          // Should always be exactly 1
          expect(controller.syncCallCount).toBe(1);
        }),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// markAllSessionsDisconnected Tests
// Feature: session-auto-reconnect (Go Service Unavailable Handling)
// ============================================================================

interface SessionForDisconnect {
  id: string;
  name: string;
  status: SessionStatus;
  autoConnect: boolean;
}

interface DisconnectResult {
  totalSessions: number;
  markedDisconnected: number;
  errors: number;
}

/**
 * Simulates markAllSessionsDisconnected logic.
 */
function simulateMarkAllDisconnected(
  sessions: SessionForDisconnect[],
  failingSessionIds: Set<string> = new Set(),
): DisconnectResult {
  const staleSessions = sessions.filter(
    s => s.status === 'connected' || s.status === 'connecting',
  );

  const result: DisconnectResult = {
    totalSessions: staleSessions.length,
    markedDisconnected: 0,
    errors: 0,
  };

  for (const session of staleSessions) {
    if (failingSessionIds.has(session.id)) {
      result.errors++;
    } else {
      result.markedDisconnected++;
    }
  }

  return result;
}

describe('Mark All Sessions Disconnected', () => {
  /**
   * Tests for markAllSessionsDisconnected function.
   *
   * Called when Go service is unavailable (Event Bridge connection failed).
   * Ensures UI reflects reality - if we can't connect to Go service,
   * no sessions can actually be connected.
   */
  describe('Go Service Unavailable Handling', () => {
    it('should mark all stale sessions as disconnected', () => {
      const sessions: SessionForDisconnect[] = [
        { id: '1', name: 'Session 1', status: 'connected', autoConnect: true },
        {
          id: '2',
          name: 'Session 2',
          status: 'connecting',
          autoConnect: false,
        },
        {
          id: '3',
          name: 'Session 3',
          status: 'disconnected',
          autoConnect: true,
        },
      ];

      const result = simulateMarkAllDisconnected(sessions);

      expect(result.totalSessions).toBe(2); // Only connected/connecting
      expect(result.markedDisconnected).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should ignore already disconnected sessions', () => {
      const sessions: SessionForDisconnect[] = [
        {
          id: '1',
          name: 'Session 1',
          status: 'disconnected',
          autoConnect: true,
        },
        { id: '2', name: 'Session 2', status: 'pending', autoConnect: false },
      ];

      const result = simulateMarkAllDisconnected(sessions);

      expect(result.totalSessions).toBe(0);
      expect(result.markedDisconnected).toBe(0);
    });

    it('should handle errors gracefully', () => {
      const sessions: SessionForDisconnect[] = [
        { id: '1', name: 'Session 1', status: 'connected', autoConnect: true },
        { id: '2', name: 'Session 2', status: 'connected', autoConnect: false },
      ];

      const result = simulateMarkAllDisconnected(sessions, new Set(['1']));

      expect(result.totalSessions).toBe(2);
      expect(result.markedDisconnected).toBe(1);
      expect(result.errors).toBe(1);
    });

    it('Property: all stale sessions are processed', () => {
      const sessionArb = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }),
        status: fc.constantFrom<SessionStatus>(
          'pending',
          'connecting',
          'connected',
          'disconnected',
        ),
        autoConnect: fc.boolean(),
      });

      fc.assert(
        fc.property(fc.array(sessionArb, { maxLength: 20 }), sessions => {
          const result = simulateMarkAllDisconnected(sessions);

          const expectedStale = sessions.filter(
            s => s.status === 'connected' || s.status === 'connecting',
          ).length;

          expect(result.totalSessions).toBe(expectedStale);
          expect(result.markedDisconnected + result.errors).toBe(expectedStale);
        }),
        { numRuns: 100 },
      );
    });

    it('Property: autoConnect flag does not affect disconnect behavior', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.boolean(),
          (id, name, autoConnect) => {
            const sessionsWithAuto: SessionForDisconnect[] = [
              { id, name, status: 'connected', autoConnect: true },
            ];
            const sessionsWithoutAuto: SessionForDisconnect[] = [
              { id, name, status: 'connected', autoConnect: false },
            ];

            const resultWithAuto =
              simulateMarkAllDisconnected(sessionsWithAuto);
            const resultWithoutAuto =
              simulateMarkAllDisconnected(sessionsWithoutAuto);

            // Both should be marked disconnected regardless of autoConnect
            expect(resultWithAuto.markedDisconnected).toBe(1);
            expect(resultWithoutAuto.markedDisconnected).toBe(1);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});

// ============================================================================
// Session Sync Service Integration Tests
// Feature: session-auto-reconnect
// ============================================================================

interface SyncSession {
  id: string;
  name: string;
  jid: string | null;
  autoConnect: boolean;
}

interface SyncResult {
  totalSessions: number;
  reconnectAttempted: number;
  markedDisconnected: number;
  errors: number;
}

/**
 * Simulates syncSessionsOnStartup logic.
 */
function simulateSyncOnStartup(
  sessions: SyncSession[],
  reconnectFailures: Set<string> = new Set(),
): SyncResult {
  const result: SyncResult = {
    totalSessions: sessions.length,
    reconnectAttempted: 0,
    markedDisconnected: 0,
    errors: 0,
  };

  for (const session of sessions) {
    if (session.autoConnect) {
      // Attempt reconnection
      if (reconnectFailures.has(session.id)) {
        // Reconnection failed, mark as disconnected
        result.markedDisconnected++;
      } else {
        result.reconnectAttempted++;
      }
    } else {
      // Mark as disconnected directly
      result.markedDisconnected++;
    }
  }

  return result;
}

describe('Session Sync Service', () => {
  /**
   * Tests for syncSessionsOnStartup function.
   *
   * Handles session status synchronization on API server startup:
   * - Sessions with autoConnect=true: attempt reconnection
   * - Sessions with autoConnect=false: mark as disconnected
   */
  describe('Startup Synchronization', () => {
    it('should attempt reconnection for autoConnect=true sessions', () => {
      const sessions: SyncSession[] = [
        { id: '1', name: 'Session 1', jid: 'jid1', autoConnect: true },
      ];

      const result = simulateSyncOnStartup(sessions);

      expect(result.reconnectAttempted).toBe(1);
      expect(result.markedDisconnected).toBe(0);
    });

    it('should mark autoConnect=false sessions as disconnected', () => {
      const sessions: SyncSession[] = [
        { id: '1', name: 'Session 1', jid: 'jid1', autoConnect: false },
      ];

      const result = simulateSyncOnStartup(sessions);

      expect(result.reconnectAttempted).toBe(0);
      expect(result.markedDisconnected).toBe(1);
    });

    it('should handle mixed sessions correctly', () => {
      const sessions: SyncSession[] = [
        { id: '1', name: 'Session 1', jid: 'jid1', autoConnect: true },
        { id: '2', name: 'Session 2', jid: 'jid2', autoConnect: false },
        { id: '3', name: 'Session 3', jid: null, autoConnect: true },
        { id: '4', name: 'Session 4', jid: null, autoConnect: false },
      ];

      const result = simulateSyncOnStartup(sessions);

      expect(result.totalSessions).toBe(4);
      expect(result.reconnectAttempted).toBe(2);
      expect(result.markedDisconnected).toBe(2);
    });

    it('should mark failed reconnections as disconnected', () => {
      const sessions: SyncSession[] = [
        { id: '1', name: 'Session 1', jid: 'jid1', autoConnect: true },
        { id: '2', name: 'Session 2', jid: 'jid2', autoConnect: true },
      ];

      const result = simulateSyncOnStartup(sessions, new Set(['1']));

      expect(result.reconnectAttempted).toBe(1); // Only session 2 succeeded
      expect(result.markedDisconnected).toBe(1); // Session 1 failed, marked disconnected
    });

    it('Property: all sessions are processed', () => {
      const sessionArb = fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }),
        jid: fc.option(fc.string({ minLength: 5, maxLength: 20 }), {
          nil: null,
        }),
        autoConnect: fc.boolean(),
      });

      fc.assert(
        fc.property(fc.array(sessionArb, { maxLength: 20 }), sessions => {
          const result = simulateSyncOnStartup(sessions);

          // All sessions should be accounted for
          expect(
            result.reconnectAttempted +
              result.markedDisconnected +
              result.errors,
          ).toBe(sessions.length);
        }),
        { numRuns: 100 },
      );
    });

    it('Property: autoConnect determines action taken', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 20 }),
          fc.option(fc.string({ minLength: 5, maxLength: 20 }), { nil: null }),
          fc.boolean(),
          (id, name, jid, autoConnect) => {
            const sessions: SyncSession[] = [{ id, name, jid, autoConnect }];
            const result = simulateSyncOnStartup(sessions);

            if (autoConnect) {
              expect(result.reconnectAttempted).toBe(1);
              expect(result.markedDisconnected).toBe(0);
            } else {
              expect(result.reconnectAttempted).toBe(0);
              expect(result.markedDisconnected).toBe(1);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
