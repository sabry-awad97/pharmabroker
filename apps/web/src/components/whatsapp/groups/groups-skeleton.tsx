/**
 * GroupsSkeleton Component
 *
 * Displays skeleton loading states for the groups list page.
 * Matches the GroupCard layout for a seamless loading experience.
 *
 * Requirements: 1.2
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface GroupsSkeletonProps {
  /** Number of skeleton cards to display */
  count?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Single skeleton card matching GroupCard layout
 */
function GroupCardSkeleton() {
  return (
    <div
      className={cn(
        'border-border bg-card rounded-md border',
        'border-l-primary/30 border-l-4',
      )}
    >
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-center gap-3">
          {/* Avatar skeleton */}
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            {/* Name skeleton */}
            <Skeleton className="h-4 w-3/4" />
            {/* Member count skeleton */}
            <Skeleton className="h-3 w-1/3" />
          </div>
          {/* Status badges skeleton */}
          <div className="flex gap-1">
            <Skeleton className="h-5 w-12 rounded-full" />
          </div>
        </div>
      </div>

      {/* Content - description skeleton */}
      <div className="px-4 pb-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="mt-1 h-3 w-2/3" />
      </div>

      {/* Footer */}
      <div className="bg-muted/30 px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* Last activity skeleton */}
          <Skeleton className="h-3 w-20" />
          {/* Quick actions skeleton (hidden by default, shown on hover) */}
          <div className="flex gap-1 opacity-0">
            <Skeleton className="size-6 rounded" />
            <Skeleton className="size-6 rounded" />
            <Skeleton className="size-6 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Grid of skeleton cards for the groups list loading state
 */
export function GroupsSkeleton({ count = 6, className }: GroupsSkeletonProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
      role="status"
      aria-label="Loading groups"
    >
      {Array.from({ length: count }).map((_, index) => (
        <GroupCardSkeleton key={index} />
      ))}
      <span className="sr-only">Loading groups...</span>
    </div>
  );
}

export { GroupCardSkeleton };
