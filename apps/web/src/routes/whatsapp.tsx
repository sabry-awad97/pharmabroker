import { createFileRoute, redirect } from '@tanstack/react-router';
import { MessageCircle, Plus, RefreshCw, WifiOff } from 'lucide-react';

import {
  WhatsappSessionCard,
  WhatsappNewSessionDialog,
  WhatsappServiceStatus,
  WhatsappSessionDialogs,
} from '@/components/whatsapp';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { authClient } from '@/lib/auth-client';
import { useWhatsappSessions, useInvalidateWhatsapp } from '@/hooks/whatsapp';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/whatsapp')({
  component: WhatsappPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function WhatsappPage() {
  const {
    data: sessions,
    isLoading,
    isFetching,
    error,
  } = useWhatsappSessions();
  const invalidate = useInvalidateWhatsapp();

  // Only show skeleton on initial load, not on refetch
  const showSkeleton = isLoading && !sessions;
  // Show subtle indicator when refetching with existing data
  const isRefetching = isFetching && !!sessions;

  return (
    <div className="p-6">
      {/* Dialogs rendered from store state */}
      <WhatsappSessionDialogs />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">WhatsApp Integration</h1>
          <p className="text-muted-foreground text-xs">
            Manage your WhatsApp sessions and messaging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={invalidate}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn(
                'mr-2 h-3.5 w-3.5 transition-transform',
                isFetching && 'animate-spin',
              )}
            />
            Refresh
          </Button>
          <WhatsappNewSessionDialog>
            <Plus className="h-3.5 w-3.5" />
            New Session
          </WhatsappNewSessionDialog>
        </div>
      </div>

      {/* Service Status */}
      <WhatsappServiceStatus className="mb-6" />

      {/* Sessions Grid */}
      <div className="mb-4">
        <h2 className="mb-3 text-sm font-medium">Active Sessions</h2>

        {showSkeleton ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <SessionSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="border-border bg-card rounded-md border p-8 text-center">
            <WifiOff className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
            <p className="text-muted-foreground mb-3 text-sm">
              Failed to load sessions
            </p>
            <Button variant="outline" size="sm" onClick={invalidate}>
              Try Again
            </Button>
          </div>
        ) : sessions?.length === 0 ? (
          <div className="border-border bg-card rounded-md border p-8 text-center">
            <MessageCircle className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
            <p className="text-muted-foreground mb-1 text-sm font-medium">
              No sessions yet
            </p>
            <p className="text-muted-foreground mb-4 text-xs">
              Create a new session to start using WhatsApp
            </p>
            <WhatsappNewSessionDialog>
              <Plus className="h-3.5 w-3.5" />
              Create Session
            </WhatsappNewSessionDialog>
          </div>
        ) : (
          <LoadingOverlay isLoading={isRefetching}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sessions?.map(session => (
                <WhatsappSessionCard key={session.id} session={session} />
              ))}
            </div>
          </LoadingOverlay>
        )}
      </div>
    </div>
  );
}

function SessionSkeleton() {
  return (
    <div className="border-border bg-card rounded-md border p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="mb-1 h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-8 w-full" />
    </div>
  );
}
