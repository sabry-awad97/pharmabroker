/**
 * Session Sync Service
 *
 * Handles session status synchronization on API server startup.
 * - Sessions with autoConnect=true: attempt reconnection
 * - Sessions with autoConnect=false that show 'connected': mark as 'disconnected'
 *
 * This ensures the UI reflects reality after container restarts, when the
 * Go service's in-memory client map is cleared but PostgreSQL still shows
 * sessions as "connected".
 */

import { whatsappService } from './whatsapp.service';

export interface SyncResult {
  totalSessions: number;
  reconnectAttempted: number;
  markedDisconnected: number;
  errors: number;
}

/**
 * Synchronize session status on API server startup.
 * Should be called after Event Bridge connects successfully.
 *
 * For sessions with stale status ('connected' or 'connecting'):
 * - autoConnect=true: attempt reconnection via Go service
 * - autoConnect=false: update status to 'disconnected'
 */
export async function syncSessionsOnStartup(): Promise<SyncResult> {
  const result: SyncResult = {
    totalSessions: 0,
    reconnectAttempted: 0,
    markedDisconnected: 0,
    errors: 0,
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
      // Attempt reconnection for auto-connect sessions
      await processAutoConnectSession(session, result);
    } else {
      // Mark non-auto-connect sessions as disconnected
      await processNonAutoConnectSession(session, result);
    }
  }

  console.log(
    `[SessionSync] Sync complete: ${result.reconnectAttempted} reconnect attempted, ` +
      `${result.markedDisconnected} marked disconnected, ${result.errors} errors`,
  );

  return result;
}

/**
 * Process a session with autoConnect=true by attempting reconnection.
 */
async function processAutoConnectSession(
  session: { id: string; name: string; jid: string | null },
  result: SyncResult,
): Promise<void> {
  try {
    console.log(
      `[SessionSync] Attempting reconnection for session ${session.id} (${session.name})`,
    );

    await whatsappService.reconnectSessionInternal(session.id);
    result.reconnectAttempted++;

    console.log(
      `[SessionSync] Reconnection initiated for session ${session.id}`,
    );
  } catch (error) {
    // On reconnection failure, mark as disconnected
    console.error(
      `[SessionSync] Reconnection failed for session ${session.id}:`,
      error,
    );

    try {
      await whatsappService.updateSessionStatusDirect(
        session.id,
        'disconnected',
      );
      result.markedDisconnected++;
      console.log(
        `[SessionSync] Marked session ${session.id} as disconnected after reconnection failure`,
      );
    } catch (updateError) {
      console.error(
        `[SessionSync] Failed to update status for session ${session.id}:`,
        updateError,
      );
      result.errors++;
    }
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
    console.error(
      `[SessionSync] Failed to update status for session ${session.id}:`,
      error,
    );
    result.errors++;
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
    markedDisconnected: 0,
    errors: 0,
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
        console.error(
          `[SessionSync] Failed to update status for session ${session.id}:`,
          error,
        );
        result.errors++;
      }
    }

    console.log(
      `[SessionSync] Completed: ${result.markedDisconnected} marked disconnected, ${result.errors} errors`,
    );
  } catch (error) {
    console.error('[SessionSync] Failed to query sessions:', error);
  }

  return result;
}
