/**
 * Session Sync Service
 *
 * Handles session status synchronization on API server startup.
 * - Sessions with autoConnect=true: attempt reconnection with retries
 * - Sessions with autoConnect=false that show 'connected': mark as 'disconnected'
 *
 * This ensures the UI reflects reality after container restarts, when the
 * Go service's in-memory client map is cleared but PostgreSQL still shows
 * sessions as "connected".
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { whatsappService } from './whatsapp.service';
import { loadHealthConfig } from '../config/health.config';
import { calculateBackoff } from '../utils/backoff';
import { logger } from '@pharmabroker/logger';
import { recordError } from '@pharmabroker/metrics';

export interface SyncResult {
  totalSessions: number;
  reconnectAttempted: number;
  reconnectSucceeded: number;
  reconnectFailed: number;
  markedDisconnected: number;
  errors: Array<{ sessionId: string; error: string }>;
}

// Re-export calculateBackoff for backward compatibility with tests
export { calculateBackoff } from '../utils/backoff';

/**
 * Synchronize session status on API server startup.
 * Should be called after Event Bridge connects successfully.
 *
 * For sessions with stale status ('connected' or 'connecting'):
 * - autoConnect=true: attempt reconnection via Go service with retries
 * - autoConnect=false: update status to 'disconnected'
 */
export async function syncSessionsOnStartup(): Promise<SyncResult> {
  const log = logger.child('session-sync');
  const config = loadHealthConfig();
  const result: SyncResult = {
    totalSessions: 0,
    reconnectAttempted: 0,
    reconnectSucceeded: 0,
    reconnectFailed: 0,
    markedDisconnected: 0,
    errors: [],
  };

  // Query sessions with stale status
  const sessions = await whatsappService.getSessionsRequiringSync();
  result.totalSessions = sessions.length;

  log.info('Starting session sync', {
    sessionCount: sessions.length,
  });

  if (sessions.length === 0) {
    log.info('No sessions require synchronization');
    return result;
  }

  // Process each session
  for (const session of sessions) {
    if (session.autoConnect) {
      // Attempt reconnection for auto-connect sessions with retries
      await processAutoConnectSession(
        session,
        result,
        config.SYNC_MAX_RETRIES,
        config.SYNC_RETRY_DELAY_MS,
        log,
      );
    } else {
      // Mark non-auto-connect sessions as disconnected
      await processNonAutoConnectSession(session, result, log);
    }
  }

  log.info('Session sync complete', {
    reconnectSucceeded: result.reconnectSucceeded,
    reconnectFailed: result.reconnectFailed,
    markedDisconnected: result.markedDisconnected,
    errors: result.errors.length,
  });

  return result;
}

/**
 * Process a session with autoConnect=true by attempting reconnection with retries.
 * Implements exponential backoff between retry attempts.
 */
async function processAutoConnectSession(
  session: { id: string; name: string; jid: string | null },
  result: SyncResult,
  maxRetries: number,
  initialDelayMs: number,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  const maxDelayMs = 30_000; // Cap at 30 seconds
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      log.info('Attempting reconnection', {
        sessionId: session.id,
        sessionName: session.name,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
      });

      await whatsappService.reconnectSessionInternal(session.id);
      result.reconnectAttempted++;
      result.reconnectSucceeded++;

      log.info('Reconnection initiated', {
        sessionId: session.id,
      });
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.error('Reconnection attempt failed', {
        sessionId: session.id,
        attempt: attempt + 1,
        error: lastError.message,
      });
      recordError('session_reconnect', 'high');

      // If we have more retries, wait with exponential backoff
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
        log.info('Retrying reconnection', {
          sessionId: session.id,
          delayMs: delay,
          nextAttempt: attempt + 2,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted - mark as disconnected
  result.reconnectAttempted++;
  result.reconnectFailed++;

  log.error('All reconnection attempts failed', {
    sessionId: session.id,
    attempts: maxRetries + 1,
  });

  try {
    await whatsappService.updateSessionStatusDirect(session.id, 'disconnected');
    result.markedDisconnected++;
    log.info('Marked session as disconnected after failed retries', {
      sessionId: session.id,
    });
  } catch (updateError) {
    const errorMsg =
      updateError instanceof Error ? updateError.message : String(updateError);
    log.error('Failed to update session status', {
      sessionId: session.id,
      error: errorMsg,
    });
    recordError('session_status_update', 'medium');
    result.errors.push({ sessionId: session.id, error: errorMsg });
  }
}

/**
 * Process a session with autoConnect=false by marking it as disconnected.
 */
async function processNonAutoConnectSession(
  session: { id: string; name: string },
  result: SyncResult,
  log: ReturnType<typeof logger.child>,
): Promise<void> {
  try {
    log.info('Marking session as disconnected', {
      sessionId: session.id,
      sessionName: session.name,
    });

    await whatsappService.updateSessionStatusDirect(session.id, 'disconnected');
    result.markedDisconnected++;

    log.info('Session marked as disconnected', {
      sessionId: session.id,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('Failed to update session status', {
      sessionId: session.id,
      error: errorMsg,
    });
    recordError('session_status_update', 'medium');
    result.errors.push({ sessionId: session.id, error: errorMsg });
  }
}

/**
 * Mark all sessions with stale status as disconnected.
 * Called when Go service is unavailable (Event Bridge connection failed).
 *
 * This ensures the UI reflects reality - if we can't connect to Go service,
 * no sessions can actually be connected.
 */
export async function markAllSessionsDisconnected(): Promise<SyncResult> {
  const log = logger.child('session-sync');
  const result: SyncResult = {
    totalSessions: 0,
    reconnectAttempted: 0,
    reconnectSucceeded: 0,
    reconnectFailed: 0,
    markedDisconnected: 0,
    errors: [],
  };

  try {
    // Query sessions with stale status
    const sessions = await whatsappService.getSessionsRequiringSync();
    result.totalSessions = sessions.length;

    log.warn('Go service unavailable - marking sessions as disconnected', {
      sessionCount: sessions.length,
    });

    if (sessions.length === 0) {
      log.info('No sessions require status update');
      return result;
    }

    // Mark all sessions as disconnected
    for (const session of sessions) {
      try {
        await whatsappService.updateSessionStatusDirect(
          session.id,
          'disconnected',
        );
        result.markedDisconnected++;
        log.info('Marked session as disconnected', {
          sessionId: session.id,
          sessionName: session.name,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error('Failed to update session status', {
          sessionId: session.id,
          error: errorMsg,
        });
        recordError('session_status_update', 'medium');
        result.errors.push({ sessionId: session.id, error: errorMsg });
      }
    }

    log.info('Completed marking sessions as disconnected', {
      markedDisconnected: result.markedDisconnected,
      errors: result.errors.length,
    });
  } catch (error) {
    log.error('Failed to query sessions', {
      error: error instanceof Error ? error.message : String(error),
    });
    recordError('session_query', 'high');
  }

  return result;
}
