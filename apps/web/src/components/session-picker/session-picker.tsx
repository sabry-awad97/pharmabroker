/**
 * Session Picker
 *
 * Full-page session/profile picker component.
 * Displays all available WhatsApp sessions in a beautiful grid layout.
 */

import type { Session } from '@pharmabroker/schemas/whatsapp';

import { motion } from 'motion/react';
import { MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useWhatsappSessions } from '@/hooks/whatsapp';
import { cn } from '@/lib/utils';
import {
  useActiveSessionActions,
  useRecentSessions,
} from '@/stores/active-session.store';

import { AddSessionCard } from './add-session-card';
import { SessionPickerCard } from './session-picker-card';

interface SessionPickerProps {
  onSessionSelect: (session: Session) => void;
  onCreateSession: () => void;
}

export function SessionPicker({
  onSessionSelect,
  onCreateSession,
}: SessionPickerProps) {
  const {
    data: sessions,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useWhatsappSessions();
  const recentSessions = useRecentSessions();
  const { setActiveSession } = useActiveSessionActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (session: Session) => {
    setSelectedId(session.id);

    // Small delay for visual feedback before navigation
    setTimeout(() => {
      setActiveSession({
        id: session.id,
        name: session.name,
        jid: session.jid,
        status: session.status,
      });
      onSessionSelect(session);
    }, 200);
  };

  // Sort sessions: connected first, then by recent usage
  const sortedSessions = sessions?.slice().sort((a, b) => {
    // Connected sessions first
    if (a.status === 'connected' && b.status !== 'connected') return -1;
    if (b.status === 'connected' && a.status !== 'connected') return 1;

    // Then by recent usage
    const aRecentIndex = recentSessions.findIndex(r => r.id === a.id);
    const bRecentIndex = recentSessions.findIndex(r => r.id === b.id);

    if (aRecentIndex !== -1 && bRecentIndex === -1) return -1;
    if (bRecentIndex !== -1 && aRecentIndex === -1) return 1;
    if (aRecentIndex !== -1 && bRecentIndex !== -1) {
      return aRecentIndex - bRecentIndex;
    }

    return 0;
  });

  return (
    <div className="from-background via-background flex min-h-screen flex-col items-center justify-center bg-linear-to-b to-emerald-950/5 p-6">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 h-1/2 w-1/2 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute -right-1/4 -bottom-1/4 h-1/2 w-1/2 rounded-full bg-teal-500/5 blur-3xl" />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-3xl"
      >
        {/* Header */}
        <div className="mb-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/25"
          >
            <MessageSquare className="h-8 w-8 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-foreground mb-2 text-2xl font-bold"
          >
            Choose a Session
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground flex items-center justify-center gap-2 text-sm"
          >
            <Sparkles className="h-4 w-4 text-emerald-500" />
            Select a WhatsApp profile to continue
          </motion.p>
        </div>

        {/* Sessions Grid */}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <SessionCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border-border/50 bg-card/50 rounded-2xl border p-8 text-center backdrop-blur"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
              <MessageSquare className="h-6 w-6 text-red-500" />
            </div>
            <h3 className="text-foreground mb-2 font-semibold">
              Failed to load sessions
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Please check your connection and try again
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')}
              />
              Try Again
            </Button>
          </motion.div>
        ) : sortedSessions?.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="border-border/50 bg-card/50 rounded-2xl border p-8 text-center backdrop-blur"
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <MessageSquare className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-foreground mb-2 font-semibold">
              No sessions yet
            </h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Create your first WhatsApp session to get started
            </p>
            <Button
              onClick={onCreateSession}
              className="bg-linear-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Create Session
            </Button>
          </motion.div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSessions?.map((session, index) => (
              <SessionPickerCard
                key={session.id}
                session={session}
                isSelected={selectedId === session.id}
                onSelect={handleSelect}
                index={index}
              />
            ))}
            <AddSessionCard
              onClick={onCreateSession}
              index={sortedSessions?.length || 0}
            />
          </div>
        )}

        {/* Footer hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-muted-foreground/60 mt-8 text-center text-xs"
        >
          You can switch sessions anytime from the sidebar
        </motion.p>
      </motion.div>
    </div>
  );
}

function SessionCardSkeleton() {
  return (
    <div className="border-border/50 bg-card/50 flex flex-col items-center rounded-2xl border p-6">
      <Skeleton className="mb-4 h-16 w-16 rounded-full" />
      <Skeleton className="mb-2 h-4 w-24" />
      <Skeleton className="h-6 w-20 rounded-full" />
    </div>
  );
}
