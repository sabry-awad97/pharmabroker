/**
 * WhatsApp Groups List Page
 *
 * Displays groups for the currently active session with
 * grid/table view toggle and pagination.
 * Groups are automatically synced when the session connects.
 *
 * Feature: auto-sync-groups-messages
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
  GroupErrorState,
  getErrorType,
  GroupsEmptyState,
  GroupsSkeleton,
  GroupsDataTable,
  GroupsGridView,
  GroupsViewToggle,
  GroupsFacetedFilter,
  SyncProgressIndicator,
  type GroupQuickAction,
  type ViewMode,
} from '@/components/whatsapp/groups';
import { SessionRequiredState } from '@/components/session-picker';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import {
  useWhatsappGroupsFlat,
  useInvalidateGroups,
  useGroupFilterCounts,
  type GroupFilterType,
} from '@/hooks/whatsapp-groups';
import { useSyncStatus } from '@/hooks/use-sync-status';
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

  // Auto-sync status tracking
  const syncStatus = useSyncStatus(activeSession?.id);

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
        invalidateGroups();
        toast.success('Refreshing groups...');
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
      {/* Sync Progress Indicator - shows during auto-sync */}
      {syncStatus.status !== 'idle' && (
        <div className="mb-4">
          <SyncProgressIndicator
            status={syncStatus.status}
            progress={syncStatus.progress}
            error={syncStatus.error}
            groupsSynced={syncStatus.groupsSynced}
            messagesProcessed={syncStatus.messagesProcessed}
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-lg font-semibold">Groups</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                {activeSession.name}
              </span>
              {/* Compact sync indicator in header */}
              <SyncProgressIndicator
                status={syncStatus.status}
                progress={syncStatus.progress}
                error={syncStatus.error}
                groupsSynced={syncStatus.groupsSynced}
                messagesProcessed={syncStatus.messagesProcessed}
                compact
              />
            </div>
            <p className="text-muted-foreground text-xs">
              {filterCounts.all} groups in this session
              {syncStatus.status === 'idle' &&
                ' • Groups sync automatically on connect'}
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
          isSyncing={syncStatus.status === 'syncing'}
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
              isLoading={syncStatus.status === 'syncing'}
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
