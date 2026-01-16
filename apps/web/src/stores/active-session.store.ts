/**
 * Active Session Store
 *
 * Manages the currently selected WhatsApp session/profile.
 * Persists selection to localStorage for session continuity.
 */

import type { Session } from '@pharmabroker/schemas/whatsapp';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';

interface ActiveSession {
  id: string;
  name: string;
  jid?: string;
  status: Session['status'];
}

interface ActiveSessionState {
  // Current active session
  activeSession: ActiveSession | null;

  // Recently used sessions (for quick switching)
  recentSessions: ActiveSession[];

  // Actions
  setActiveSession: (session: ActiveSession | null) => void;
  clearActiveSession: () => void;
  updateActiveSessionStatus: (status: Session['status']) => void;

  // Check if a session is active
  isSessionActive: (sessionId: string) => boolean;
}

const MAX_RECENT_SESSIONS = 5;

export const useActiveSessionStore = create<ActiveSessionState>()(
  persist(
    (set, get) => ({
      activeSession: null,
      recentSessions: [],

      setActiveSession: session => {
        if (!session) {
          set({ activeSession: null });
          return;
        }

        const { recentSessions } = get();

        // Add to recent sessions (avoid duplicates, keep most recent first)
        const filtered = recentSessions.filter(s => s.id !== session.id);
        const newRecent = [session, ...filtered].slice(0, MAX_RECENT_SESSIONS);

        set({
          activeSession: session,
          recentSessions: newRecent,
        });
      },

      clearActiveSession: () => set({ activeSession: null }),

      updateActiveSessionStatus: status => {
        const { activeSession } = get();
        if (activeSession) {
          set({ activeSession: { ...activeSession, status } });
        }
      },

      isSessionActive: sessionId => {
        const { activeSession } = get();
        return activeSession?.id === sessionId;
      },
    }),
    {
      name: 'pharmabroker-active-session',
      partialize: state => ({
        activeSession: state.activeSession,
        recentSessions: state.recentSessions,
      }),
    },
  ),
);

// Selector hooks for better performance
export const useActiveSession = () =>
  useActiveSessionStore(state => state.activeSession);

export const useRecentSessions = () =>
  useActiveSessionStore(state => state.recentSessions);

export const useActiveSessionActions = () =>
  useActiveSessionStore(
    useShallow(state => ({
      setActiveSession: state.setActiveSession,
      clearActiveSession: state.clearActiveSession,
      updateActiveSessionStatus: state.updateActiveSessionStatus,
      isSessionActive: state.isSessionActive,
    })),
  );

// Helper to check if we need to show session picker
export const useNeedsSessionPicker = () =>
  useActiveSessionStore(state => state.activeSession === null);
