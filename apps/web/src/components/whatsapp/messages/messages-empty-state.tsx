/**
 * Messages Empty State Component
 *
 * Displays empty state messages for the messages list page.
 */

import { MessageSquare, Search, RefreshCw } from 'lucide-react';

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

export type MessageEmptyStateVariant = 'no-messages' | 'no-results';

export interface MessagesEmptyStateProps {
  variant: MessageEmptyStateVariant;
  onSync?: () => void;
  onClearFilters?: () => void;
  isSyncing?: boolean;
  searchQuery?: string;
  className?: string;
}

function NoMessagesState({
  onSync,
  isSyncing,
  className,
}: Pick<MessagesEmptyStateProps, 'onSync' | 'isSyncing' | 'className'>) {
  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          <MessageSquare className="text-muted-foreground size-12" />
        </EmptyMedia>
        <EmptyTitle>No messages yet</EmptyTitle>
        <EmptyDescription>
          Messages will appear here once they are synced from WhatsApp. Start a
          conversation or wait for incoming messages.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {onSync && (
          <Button onClick={onSync} disabled={isSyncing} size="sm">
            <RefreshCw
              className={cn('mr-2 size-4', isSyncing && 'animate-spin')}
            />
            {isSyncing ? 'Syncing...' : 'Sync Messages'}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

function NoResultsState({
  onClearFilters,
  searchQuery,
  className,
}: Pick<
  MessagesEmptyStateProps,
  'onClearFilters' | 'searchQuery' | 'className'
>) {
  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          <Search className="text-muted-foreground size-12" />
        </EmptyMedia>
        <EmptyTitle>No messages found</EmptyTitle>
        <EmptyDescription>
          {searchQuery ? (
            <>
              No messages match "
              <span className="font-medium">{searchQuery}</span>". Try a
              different search term or clear your filters.
            </>
          ) : (
            <>
              No messages match your current filters. Try adjusting your filters
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

export function MessagesEmptyState({
  variant,
  onSync,
  onClearFilters,
  isSyncing = false,
  searchQuery,
  className,
}: MessagesEmptyStateProps) {
  if (variant === 'no-messages') {
    return (
      <NoMessagesState
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
