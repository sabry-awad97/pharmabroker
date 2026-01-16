/**
 * Auto-Select Session Hook
 *
 * Automatically selects a WhatsApp session when there's only one available.
 * This provides a smoother UX for users with a single session.
 */

import { useEffect, useRef } from 'react';
import { useWhatsappSessions } from './whatsapp';
import {
  useActiveSession,
  useActiveSessionActions,
} from '../stores/active-session.store';

/**
 * Hook that auto-selects a session when:
 * - No session is currently selected
 * - There's exactly one session available
 * - Sessions have finished loading
 */
export function useAutoSelectSession() {
  const activeSession = useActiveSession();
  const { setActiveSession } = useActiveSessionActions();
  const { data: sessions, isLoading } = useWhatsappSessions();
  const hasAutoSelected = useRef(false);

  useEffect(() => {
    // Only auto-select once per mount
    if (hasAutoSelected.current) return;

    // Wait for sessions to load
    if (isLoading) return;

    // Don't auto-select if there's already an active session
    if (activeSession) return;

    // Auto-select if there's exactly one session
    if (sessions?.length === 1) {
      const session = sessions[0];
      hasAutoSelected.current = true;
      setActiveSession({
        id: session.id,
        name: session.name,
        jid: session.jid,
        status: session.status,
      });
    }
  }, [sessions, isLoading, activeSession, setActiveSession]);

  return { activeSession, sessions, isLoading };
}
