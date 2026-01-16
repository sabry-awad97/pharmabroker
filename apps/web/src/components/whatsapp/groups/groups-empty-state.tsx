/**
 * GroupsEmptyState Component
 *
 * Displays empty state messages for the groups list page.
 * Handles both "no groups" and "no results" states.
 * Groups are automatically synced when the session connects.
 *
 * Feature: auto-sync-groups-messages
 * Requirements: 1.3, 2.4
 */

import { Loader2, Search, Users } from 'lucide-react';

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
  isSyncing,
  className,
}: Pick<GroupsEmptyStateProps, 'isSyncing' | 'className'>) {
  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          {isSyncing ? (
            <Loader2 className="text-muted-foreground size-12 animate-spin" />
          ) : (
            <Users className="text-muted-foreground size-12" />
          )}
        </EmptyMedia>
        <EmptyTitle>
          {isSyncing ? 'Syncing groups...' : 'No groups yet'}
        </EmptyTitle>
        <EmptyDescription>
          {isSyncing
            ? 'Groups are being synced from WhatsApp. This may take a moment.'
            : 'Groups will automatically sync when your WhatsApp session connects. Make sure your session is connected and authenticated.'}
        </EmptyDescription>
      </EmptyHeader>
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
  onClearFilters,
  isSyncing = false,
  searchQuery,
  className,
}: GroupsEmptyStateProps) {
  if (variant === 'no-groups') {
    return <NoGroupsState isSyncing={isSyncing} className={className} />;
  }

  return (
    <NoResultsState
      onClearFilters={onClearFilters}
      searchQuery={searchQuery}
      className={className}
    />
  );
}
