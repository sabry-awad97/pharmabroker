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

  console.log(
    `[SessionSync] Starting sync for ${sessions.length} session(s) with stale status`,
  );

  if (sessions.length === 0) {
    console.log('[SessionSync] No sessions require synchronization');
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
      );
    } else {
      // Mark non-auto-connect sessions as disconnected
      await processNonAutoConnectSession(session, result);
    }
  }

  console.log(
    `[SessionSync] Sync complete: ${result.reconnectSucceeded} reconnect succeeded, ` +
      `${result.reconnectFailed} reconnect failed, ` +
      `${result.markedDisconnected} marked disconnected, ${result.errors.length} errors`,
  );

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
): Promise<void> {
  const maxDelayMs = 30_000; // Cap at 30 seconds
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `[SessionSync] Attempting reconnection for session ${session.id} (${session.name}) - attempt ${attempt + 1}/${maxRetries + 1}`,
      );

      await whatsappService.reconnectSessionInternal(session.id);
      result.reconnectAttempted++;
      result.reconnectSucceeded++;

      console.log(
        `[SessionSync] Reconnection initiated for session ${session.id}`,
      );
      return; // Success - exit retry loop
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[SessionSync] Reconnection attempt ${attempt + 1} failed for session ${session.id}:`,
        lastError.message,
      );

      // If we have more retries, wait with exponential backoff
      if (attempt < maxRetries) {
        const delay = calculateBackoff(attempt, initialDelayMs, maxDelayMs);
        console.log(
          `[SessionSync] Retrying session ${session.id} in ${delay}ms...`,
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries exhausted - mark as disconnected
  result.reconnectAttempted++;
  result.reconnectFailed++;

  console.error(
    `[SessionSync] All ${maxRetries + 1} reconnection attempts failed for session ${session.id}`,
  );

  try {
    await whatsappService.updateSessionStatusDirect(session.id, 'disconnected');
    result.markedDisconnected++;
    console.log(
      `[SessionSync] Marked session ${session.id} as disconnected after all retries failed`,
    );
  } catch (updateError) {
    const errorMsg =
      updateError instanceof Error ? updateError.message : String(updateError);
    console.error(
      `[SessionSync] Failed to update status for session ${session.id}:`,
      errorMsg,
    );
    result.errors.push({ sessionId: session.id, error: errorMsg });
  }
}

/**
 * Process a session with autoConnect=false by marking it as disconnected.
 */
async function processNonAutoConnectSession(
  session: { id: string; name: string },
  result: SyncResult,
): Promise<void> {
  try {
    console.log(
      `[SessionSync] Marking session ${session.id} (${session.name}) as disconnected`,
    );

    await whatsappService.updateSessionStatusDirect(session.id, 'disconnected');
    result.markedDisconnected++;

    console.log(`[SessionSync] Session ${session.id} marked as disconnected`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[SessionSync] Failed to update status for session ${session.id}:`,
      errorMsg,
    );
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

    console.log(
      `[SessionSync] Go service unavailable - marking ${sessions.length} session(s) as disconnected`,
    );

    if (sessions.length === 0) {
      console.log('[SessionSync] No sessions require status update');
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
        console.log(
          `[SessionSync] Marked session ${session.id} (${session.name}) as disconnected`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(
          `[SessionSync] Failed to update status for session ${session.id}:`,
          errorMsg,
        );
        result.errors.push({ sessionId: session.id, error: errorMsg });
      }
    }

    console.log(
      `[SessionSync] Completed: ${result.markedDisconnected} marked disconnected, ${result.errors.length} errors`,
    );
  } catch (error) {
    console.error('[SessionSync] Failed to query sessions:', error);
  }

  return result;
}
