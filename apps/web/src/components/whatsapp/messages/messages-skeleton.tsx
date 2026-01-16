/**
 * Messages Skeleton Component
 *
 * Displays skeleton loading states for the messages table.
 */

import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface MessagesSkeletonProps {
  count?: number;
  className?: string;
}

export function MessageRowSkeleton() {
  return (
    <TableRow>
      {/* Checkbox */}
      <TableCell className="w-10">
        <Skeleton className="h-4 w-4" />
      </TableCell>
      {/* Sender */}
      <TableCell>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </TableCell>
      {/* Message */}
      <TableCell>
        <div className="space-y-1">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </TableCell>
      {/* Type */}
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      {/* Group */}
      <TableCell>
        <Skeleton className="h-3.5 w-28" />
      </TableCell>
      {/* AI Status */}
      <TableCell>
        <Skeleton className="h-5 w-5 rounded-full" />
      </TableCell>
      {/* Time */}
      <TableCell>
        <Skeleton className="h-3.5 w-16" />
      </TableCell>
      {/* Actions */}
      <TableCell>
        <div className="flex justify-end gap-1">
          <Skeleton className="h-6 w-6" />
          <Skeleton className="h-6 w-6" />
        </div>
      </TableCell>
    </TableRow>
  );
}

export function MessagesSkeleton({
  count = 10,
  className,
}: MessagesSkeletonProps) {
  return (
    <div
      className={cn(
        'border-border overflow-hidden rounded-lg border',
        className,
      )}
      role="status"
      aria-label="Loading messages"
    >
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="w-10">
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-16" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-20" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-12" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-14" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-8" />
            </TableHead>
            <TableHead>
              <Skeleton className="h-4 w-12" />
            </TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: count }).map((_, index) => (
            <MessageRowSkeleton key={index} />
          ))}
        </TableBody>
      </Table>
      <span className="sr-only">Loading messages...</span>
    </div>
  );
}
