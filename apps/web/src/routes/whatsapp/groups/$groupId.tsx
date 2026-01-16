/**
 * WhatsApp Group Detail Page
 *
 * Displays detailed information about a single WhatsApp group,
 * including group settings, metadata, and participant list.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import {
  GroupDetailHeader,
  ParticipantList,
  GroupErrorState,
  getErrorType,
} from '@/components/whatsapp/groups';
import { authClient } from '@/lib/auth-client';
import { useWhatsappGroup, useSyncGroups } from '@/hooks/whatsapp-groups';

export const Route = createFileRoute('/whatsapp/groups/$groupId')({
  component: WhatsappGroupDetailPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function WhatsappGroupDetailPage() {
  const { groupId } = Route.useParams();

  // Fetch group data with participants
  const { data: group, isLoading, error, refetch } = useWhatsappGroup(groupId);

  // Sync mutation
  const syncGroups = useSyncGroups();

  // Handle sync
  const handleSync = async () => {
    if (!group?.sessionId) return;

    try {
      await syncGroups.mutateAsync(group.sessionId);
      await refetch();
      toast.success('Group synced successfully');
    } catch (err) {
      toast.error('Failed to sync group', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  };

  // Loading state
  if (isLoading) {
    return <GroupDetailSkeleton />;
  }

  // Error state
  if (error || !group) {
    const errorType = error ? getErrorType(error) : 'group-not-found';
    return (
      <div className="p-6">
        <GroupErrorState
          errorType={errorType}
          message={error?.message}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header with group info */}
      <GroupDetailHeader
        group={group}
        onSync={handleSync}
        isSyncing={syncGroups.isPending}
        className="mb-6"
      />

      {/* Group settings section */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium">Group Settings</h2>
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SettingItem
              label="Announce Only"
              value={group.isAnnounce ? 'Yes' : 'No'}
              description="Only admins can send messages"
            />
            <SettingItem
              label="Locked"
              value={group.isLocked ? 'Yes' : 'No'}
              description="Only admins can edit group info"
            />
            <SettingItem
              label="Disappearing Messages"
              value={
                group.isEphemeral
                  ? group.ephemeralTime
                    ? formatEphemeralTime(group.ephemeralTime)
                    : 'On'
                  : 'Off'
              }
              description="Messages auto-delete after set time"
            />
          </div>
        </div>
      </div>

      {/* Participants section */}
      <div>
        <h2 className="mb-3 text-sm font-medium">
          Participants ({group.memberCount})
        </h2>
        <div className="bg-card border-border rounded-lg border p-4">
          <ParticipantList
            participants={group.participants || []}
            ownerJid={group.ownerJid}
            isLoading={false}
            showSearch
            pageSize={8}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Setting item display component
 */
function SettingItem({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-sm font-medium">{value}</span>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
    </div>
  );
}

/**
 * Format ephemeral time for display
 */
function formatEphemeralTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Loading skeleton for the group detail page
 */
function GroupDetailSkeleton() {
  return (
    <div className="p-6">
      {/* Header skeleton */}
      <div className="mb-6 space-y-4">
        <Skeleton className="h-8 w-32" />
        <div className="bg-card border-border rounded-lg border p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-full max-w-md" />
              <div className="flex gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings skeleton */}
      <div className="mb-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Participants skeleton */}
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="bg-card border-border rounded-lg border p-4">
          <Skeleton className="mb-4 h-8 w-full" />
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
