/**
 * WhatsApp Groups List Page
 *
 * Displays groups for the currently active session with
 * grid/table view toggle and pagination.
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Search } from 'lucide-react';
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
  SyncGroupsDialog,
  GroupErrorState,
  getErrorType,
  GroupsEmptyState,
  GroupsSkeleton,
  GroupsDataTable,
  GroupsGridView,
  GroupsViewToggle,
  GroupsFacetedFilter,
  type GroupQuickAction,
  type SyncStatus,
  type SyncResult,
  type ViewMode,
} from '@/components/whatsapp/groups';
import { SessionRequiredState } from '@/components/session-picker';
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

  // View mode state (persisted in localStorage)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('groups-view-mode') as ViewMode) || 'grid';
    }
    return 'grid';
  });

  // Local filter state
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<GroupFilterType>('all');

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
    sessionId: activeSession?.id,
    search: search || undefined,
    filter,
    enabled: !!activeSession,
  });

  // Mutations
  const syncGroups = useSyncGroups();
  const invalidateGroups = useInvalidateGroups();

  // Fetch filter counts
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

  // Handle view mode change
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('groups-view-mode', mode);
  };

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

  const handleCopyJid = async (jid: string) => {
    await navigator.clipboard.writeText(jid);
    toast.success('JID copied to clipboard');
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

      {/* Header */}
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
            <GroupsViewToggle
              view={viewMode}
              onViewChange={handleViewModeChange}
            />
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
              className="bg-emerald-500 hover:bg-emerald-600"
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

      {/* Faceted Filter */}
      <GroupsFacetedFilter
        search={search}
        filter={filter}
        counts={filterCounts}
        onSearchChange={setSearch}
        onFilterChange={setFilter}
        onClear={handleClearFilters}
        className="mb-6"
      />

      {/* Content */}
      {showSkeleton ? (
        <GroupsSkeleton count={viewMode === 'grid' ? 6 : 5} />
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
          {viewMode === 'grid' ? (
            <GroupsGridView
              data={groups || []}
              onSelect={handleGroupSelect}
              onQuickAction={handleQuickAction}
              isLoading={syncGroups.isPending}
              pageSize={9}
            />
          ) : (
            <GroupsDataTable
              data={groups || []}
              onRowClick={group => handleGroupSelect(group.id)}
              onCopyJid={handleCopyJid}
              pageSize={10}
            />
          )}
        </LoadingOverlay>
      )}
    </div>
  );
}
