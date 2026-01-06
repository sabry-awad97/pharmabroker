/**
 * GroupsEmptyState Component
 *
 * Displays empty state messages for the groups list page.
 * Handles both "no groups" and "no results" states.
 *
 * Requirements: 1.3, 2.4
 */

import { RefreshCw, Search, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

export type EmptyStateVariant = 'no-groups' | 'no-results';

export interface GroupsEmptyStateProps {
  /** The type of empty state to display */
  variant: EmptyStateVariant;
  /** Callback when sync button is clicked (for no-groups variant) */
  onSync?: () => void;
  /** Callback when clear filters button is clicked (for no-results variant) */
  onClearFilters?: () => void;
  /** Whether sync is in progress */
  isSyncing?: boolean;
  /** The current search query (for no-results variant) */
  searchQuery?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Empty state for when no groups exist
 */
function NoGroupsState({
  onSync,
  isSyncing,
  className,
}: Pick<GroupsEmptyStateProps, 'onSync' | 'isSyncing' | 'className'>) {
  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          <Users className="text-muted-foreground size-12" />
        </EmptyMedia>
        <EmptyTitle>No groups yet</EmptyTitle>
        <EmptyDescription>
          Sync your WhatsApp groups to start managing them here. Groups from all
          your connected sessions will appear in this list.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {onSync && (
          <Button onClick={onSync} disabled={isSyncing} size="sm">
            <RefreshCw
              className={cn('mr-2 size-4', isSyncing && 'animate-spin')}
            />
            {isSyncing ? 'Syncing...' : 'Sync Groups'}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

/**
 * Empty state for when no groups match the current filters
 */
function NoResultsState({
  onClearFilters,
  searchQuery,
  className,
}: Pick<
  GroupsEmptyStateProps,
  'onClearFilters' | 'searchQuery' | 'className'
>) {
  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          <Search className="text-muted-foreground size-12" />
        </EmptyMedia>
        <EmptyTitle>No groups found</EmptyTitle>
        <EmptyDescription>
          {searchQuery ? (
            <>
              No groups match "
              <span className="font-medium">{searchQuery}</span>". Try a
              different search term or clear your filters.
            </>
          ) : (
            <>
              No groups match your current filters. Try adjusting your filters
              or search criteria.
            </>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {onClearFilters && (
          <Button variant="outline" onClick={onClearFilters} size="sm">
            Clear Filters
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

/**
 * Main empty state component that renders the appropriate variant
 */
export function GroupsEmptyState({
  variant,
  onSync,
  onClearFilters,
  isSyncing = false,
  searchQuery,
  className,
}: GroupsEmptyStateProps) {
  if (variant === 'no-groups') {
    return (
      <NoGroupsState
        onSync={onSync}
        isSyncing={isSyncing}
        className={className}
      />
    );
  }

  return (
    <NoResultsState
      onClearFilters={onClearFilters}
      searchQuery={searchQuery}
      className={className}
    />
  );
}
