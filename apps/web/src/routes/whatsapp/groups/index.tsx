/**
 * WhatsApp Groups List Page
 *
 * Displays a filterable, searchable grid of WhatsApp groups.
 * Supports responsive layouts and multiple states (loading, empty, error).
 *
 * Requirements: 1.1, 1.2, 1.3, 1.7, 5.1, 5.2, 5.3, 5.4, 8.2, 8.3, 8.4
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
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
  GroupFilterPanel,
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
} from '@/hooks/whatsapp-groups';
import { useWhatsappSessions } from '@/hooks/whatsapp';
import {
  useGroupFilters,
  useGroupFilterActions,
} from '@/stores/whatsapp-groups.store';

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

  // Filter state from store
  const { search, filter, sessionId } = useGroupFilters();
  const { setSearch, setFilter, setSessionId, resetFilters } =
    useGroupFilterActions();

  // Sync dialog state
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncResult, setSyncResult] = useState<SyncResult | undefined>();
  const [syncError, setSyncError] = useState<Error | null>(null);

  // Data fetching
  const {
    data: groups,
    isLoading: isLoadingGroups,
    isFetching: isFetchingGroups,
    error: groupsError,
  } = useWhatsappGroupsFlat({
    sessionId: sessionId ?? undefined,
    search: search || undefined,
    filter,
  });

  const { data: sessions } = useWhatsappSessions();

  // Mutations
  const syncGroups = useSyncGroups();
  const invalidateGroups = useInvalidateGroups();

  // Derived state
  const showSkeleton = isLoadingGroups && !groups;
  const isRefetching = isFetchingGroups && !!groups;
  const hasFiltersApplied =
    search.length > 0 || filter !== 'all' || sessionId !== null;
  const hasGroups = groups && groups.length > 0;
  const hasNoResults = !hasGroups && hasFiltersApplied;
  const hasNoGroups = !hasGroups && !hasFiltersApplied;

  // Determine if we should show session indicators (Requirements 6.4)
  // Show when viewing all sessions (sessionId is null) and multiple sessions exist
  const showSessionIndicator =
    sessionId === null && (sessions?.length ?? 0) > 1;

  // Create a map of session info for quick lookup
  const sessionMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; status: string }>();
    sessions?.forEach(s => {
      map.set(s.id, { id: s.id, name: s.name, status: s.status });
    });
    return map;
  }, [sessions]);

  // Get current session name for dialog
  const currentSessionName = sessionId
    ? sessions?.find(s => s.id === sessionId)?.name
    : undefined;

  // Fetch filter counts from API
  const { data: filterCountsData, isLoading: isLoadingCounts } =
    useGroupFilterCounts({
      sessionId: sessionId ?? undefined,
    });

  // Use API counts with fallback to zeros while loading
  const filterCounts = filterCountsData ?? {
    all: 0,
    admin: 0,
    archived: 0,
    muted: 0,
  };

  // Sync handler with dialog integration
  const handleSync = useCallback(async () => {
    // If a session is selected, sync that session
    // Otherwise, sync all sessions
    const sessionsToSync = sessionId
      ? [sessionId]
      : (sessions?.map(s => s.id) ?? []);

    if (sessionsToSync.length === 0) {
      toast.error('No sessions available to sync');
      return;
    }

    // Open dialog and set syncing state
    setSyncDialogOpen(true);
    setSyncStatus('syncing');
    setSyncResult(undefined);
    setSyncError(null);

    try {
      let totalSynced = 0;
      const allErrors: string[] = [];

      // Sync each session
      for (const sid of sessionsToSync) {
        const result = await syncGroups.mutateAsync(sid);
        totalSynced += result.synced;
        allErrors.push(...result.errors);
      }

      // Update state with results
      setSyncResult({ synced: totalSynced, errors: allErrors });
      setSyncStatus('success');

      // Show toast notification (Requirements 5.3)
      if (allErrors.length > 0) {
        toast.warning('Groups synced with warnings', {
          description: `${totalSynced} groups synced, ${allErrors.length} warnings`,
        });
      } else {
        toast.success('Groups synced successfully', {
          description: `${totalSynced} groups synced`,
        });
      }
    } catch (error) {
      // Handle error state (Requirements 5.4)
      const err = error instanceof Error ? error : new Error('Unknown error');
      setSyncError(err);
      setSyncStatus('error');
      toast.error('Failed to sync groups', {
        description: err.message,
      });
    }
  }, [sessionId, sessions, syncGroups]);

  // Retry sync handler
  const handleRetrySync = useCallback(() => {
    handleSync();
  }, [handleSync]);

  // Quick sync without dialog (for header button)
  const handleQuickSync = useCallback(async () => {
    const sessionsToSync = sessionId
      ? [sessionId]
      : (sessions?.map(s => s.id) ?? []);

    if (sessionsToSync.length === 0) {
      toast.error('No sessions available to sync');
      return;
    }

    try {
      let totalSynced = 0;
      for (const sid of sessionsToSync) {
        const result = await syncGroups.mutateAsync(sid);
        totalSynced += result.synced;
      }
      toast.success('Groups synced successfully', {
        description: `${totalSynced} groups synced`,
      });
    } catch (error) {
      toast.error('Failed to sync groups', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [sessionId, sessions, syncGroups]);

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
        } catch (error) {
          toast.error('Failed to refresh group');
        }
        break;
    }
  };

  const handleClearFilters = () => {
    resetFilters();
  };

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
        sessionName={currentSessionName}
      />

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">WhatsApp Groups</h1>
          <p className="text-muted-foreground text-xs">
            Manage your WhatsApp groups across all sessions
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
            {syncGroups.isPending ? 'Syncing...' : 'Sync Groups'}
          </Button>
        </div>
      </div>

      {/* Filter Panel */}
      <GroupFilterPanel
        search={search}
        filter={filter}
        sessionId={sessionId}
        sessions={sessions ?? []}
        counts={filterCounts}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onSessionChange={setSessionId}
        isLoading={isLoadingGroups}
        className="mb-6"
      />

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
          <div
            className={cn(
              'grid gap-4',
              // Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop
              'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {groups?.map(group => {
              const sessionInfo = sessionMap.get(group.sessionId);
              return (
                <GroupCardErrorBoundary
                  key={group.id}
                  groupId={group.id}
                  onRetry={invalidateGroups}
                >
                  <GroupCard
                    group={group}
                    session={sessionInfo as any}
                    showSessionIndicator={showSessionIndicator}
                    onSelect={handleGroupSelect}
                    onQuickAction={handleQuickAction}
                    isLoading={syncGroups.isPending}
                  />
                </GroupCardErrorBoundary>
              );
            })}
          </div>
        </LoadingOverlay>
      )}
    </div>
  );
}
