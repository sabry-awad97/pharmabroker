/**
 * WhatsApp Groups List Page
 *
 * Displays groups for the currently active session.
 * Groups are now session-scoped based on the global session picker.
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { MessageSquare, RefreshCw, Users } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  GroupCard,
  SyncGroupsDialog,
  GroupErrorState,
  getErrorType,
  type GroupQuickAction,
  type SyncStatus,
  type SyncResult,
} from '@/components/whatsapp/groups';
import { GroupsEmptyState } from '@/components/whatsapp/groups/groups-empty-state';
import { GroupsSkeleton } from '@/components/whatsapp/groups/groups-skeleton';
import { GroupCardErrorBoundary } from '@/components/whatsapp/groups/group-card-error-boundary';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  useWhatsappGroupsFlat,
  useSyncGroups,
  useInvalidateGroups,
  useGroupFilterCounts,
  type GroupFilterType,
} from '@/hooks/whatsapp-groups';
import { useActiveSession } from '@/stores/active-session.store';
import { SessionRequiredState } from '@/components/session-picker/session-required-state';

export const Route = createFileRoute('/whatsapp/groups/')({
  component: WhatsappGroupsPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function WhatsappGroupsPage() {
  const navigate = useNavigate();
  const activeSession = useActiveSession();

  // Local filter state (search and filter type only - session comes from global state)
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GroupFilterType>('all');

  // Sync dialog state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>();
  const [syncError, setSyncError] = useState<Error | null>(null);

  // Data fetching - always scoped to active session
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isFetching: isFetchingGroups,
    error: groupsError,
  } = useWhatsappGroupsFlat({
    sessionId: activeSession?.id,
    search: search || undefined,
    filter,
    enabled: !!activeSession,
  });

  // Mutations
  const syncGroups = useSyncGroups();
  const invalidateGroups = useInvalidateGroups();

  // Fetch filter counts for active session
  const { data: filterCountsData } = useGroupFilterCounts({
    sessionId: activeSession?.id,
    enabled: !!activeSession,
  });

  const filterCounts = filterCountsData ?? {
    all: 0,
    admin: 0,
    archived: 0,
    muted: 0,
  };

  // Derived state
  const showSkeleton = isLoadingGroups && !groups;
  const isRefetching = isFetchingGroups && !!groups;
  const hasFiltersApplied = search.length > 0 || filter !== 'all';
  const hasGroups = groups && groups.length > 0;
  const hasNoResults = !hasGroups && hasFiltersApplied;
  const hasNoGroups = !hasGroups && !hasFiltersApplied;

  // Sync handler
  const handleSync = useCallback(async () => {
    if (!activeSession) {
      toast.error('No session selected');
      return;
    }

    setSyncDialogOpen(true);
    setSyncStatus('syncing');
    setSyncResult(undefined);
    setSyncError(null);

    try {
      const result = await syncGroups.mutateAsync(activeSession.id);
      setSyncResult({ synced: result.synced, errors: result.errors });
      setSyncStatus('success');

      if (result.errors.length > 0) {
        toast.warning('Groups synced with warnings', {
          description: `${result.synced} groups synced, ${result.errors.length} warnings`,
        });
      } else {
        toast.success('Groups synced successfully', {
          description: `${result.synced} groups synced`,
        });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      setSyncError(err);
      setSyncStatus('error');
      toast.error('Failed to sync groups', {
        description: err.message,
      });
    }
  }, [activeSession, syncGroups]);

  const handleRetrySync = useCallback(() => {
    handleSync();
  }, [handleSync]);

  const handleQuickSync = useCallback(async () => {
    if (!activeSession) {
      toast.error('No session selected');
      return;
    }

    try {
      const result = await syncGroups.mutateAsync(activeSession.id);
      toast.success('Groups synced successfully', {
        description: `${result.synced} groups synced`,
      });
    } catch (error) {
      toast.error('Failed to sync groups', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [activeSession, syncGroups]);

  const handleGroupSelect = (groupId: string) => {
    navigate({ to: '/whatsapp/groups/$groupId', params: { groupId } });
  };

  const handleQuickAction = async (
    action: GroupQuickAction,
    groupId: string,
  ) => {
    const group = groups?.find(g => g.id === groupId);
    if (!group) return;

    switch (action) {
      case 'view':
        navigate({ to: '/whatsapp/groups/$groupId', params: { groupId } });
        break;
      case 'copy-jid':
        await navigator.clipboard.writeText(group.jid);
        toast.success('JID copied to clipboard');
        break;
      case 'refresh':
        try {
          await syncGroups.mutateAsync(group.sessionId);
          toast.success('Group refreshed');
        } catch {
          toast.error('Failed to refresh group');
        }
        break;
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setFilter('all');
  };

  // Show session required state if no active session
  if (!activeSession) {
    return <SessionRequiredState />;
  }

  return (
    <div className="p-6">
      {/* Sync Groups Dialog */}
      <SyncGroupsDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        status={syncStatus}
        result={syncResult}
        error={syncError}
        onRetry={handleRetrySync}
        sessionName={activeSession.name}
      />

      {/* Header with session context */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-lg font-semibold">Groups</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                {activeSession.name}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              {filterCounts.all} groups in this session
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={invalidateGroups}
                  disabled={isFetchingGroups}
                  aria-label="Refresh groups"
                >
                  <RefreshCw
                    className={cn(
                      'h-4 w-4 transition-transform duration-500',
                      isFetchingGroups && 'animate-spin',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh groups</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              onClick={handleQuickSync}
              disabled={syncGroups.isPending}
              aria-label="Sync groups from WhatsApp"
            >
              <RefreshCw
                className={cn(
                  'mr-2 h-3.5 w-3.5',
                  syncGroups.isPending && 'animate-spin',
                )}
              />
              {syncGroups.isPending ? 'Syncing...' : 'Sync'}
            </Button>
          </div>
        </div>
      </div>

      {/* Simplified Filter Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative max-w-sm min-w-[200px] flex-1">
          <input
            type="text"
            placeholder="Search groups..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border-border bg-background placeholder:text-muted-foreground h-9 w-full rounded-md border px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Filter Tabs */}
        <div className="border-border flex items-center gap-1 rounded-lg border p-1">
          {(['all', 'admin', 'archived', 'muted'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-emerald-500 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1.5 opacity-70">{filterCounts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Groups Grid */}
      {showSkeleton ? (
        <GroupsSkeleton count={6} />
      ) : groupsError ? (
        <GroupErrorState
          errorType={getErrorType(groupsError)}
          message={
            groupsError instanceof Error ? groupsError.message : undefined
          }
          onRetry={invalidateGroups}
          isRetrying={isFetchingGroups}
        />
      ) : hasNoGroups ? (
        <GroupsEmptyState
          variant="no-groups"
          onSync={handleSync}
          isSyncing={syncGroups.isPending}
        />
      ) : hasNoResults ? (
        <GroupsEmptyState
          variant="no-results"
          onClearFilters={handleClearFilters}
          searchQuery={search}
        />
      ) : (
        <LoadingOverlay isLoading={isRefetching}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups?.map(group => (
              <GroupCardErrorBoundary
                key={group.id}
                groupId={group.id}
                onRetry={invalidateGroups}
              >
                <GroupCard
                  group={group}
                  showSessionIndicator={false}
                  onSelect={handleGroupSelect}
                  onQuickAction={handleQuickAction}
                  isLoading={syncGroups.isPending}
                />
              </GroupCardErrorBoundary>
            ))}
          </div>
        </LoadingOverlay>
      )}
    </div>
  );
}
