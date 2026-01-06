import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-muted/60 animate-pulse rounded-md', className)}
      {...props}
    />
  );
}

interface SkeletonTextProps extends React.ComponentProps<'div'> {
  lines?: number;
}

function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  return (
    <div className={cn('space-y-2', className)} {...props}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 && 'w-3/4')} />
      ))}
    </div>
  );
}

function SkeletonCard({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('border-border bg-card rounded-md border p-4', className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    </div>
  );
}

export { Skeleton, SkeletonText, SkeletonCard };
