import { cn } from '@/lib/utils';

interface LoadingOverlayProps {
  isLoading: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Overlay that shows a subtle loading indicator without hiding content.
 * Prevents the "flash" effect during refetches by keeping content visible.
 */
export function LoadingOverlay({
  isLoading,
  children,
  className,
}: LoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-end p-2">
          <div className="bg-background/80 flex items-center gap-1.5 rounded-md px-2 py-1 backdrop-blur-sm">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-muted-foreground text-xs">Updating...</span>
          </div>
        </div>
      )}
    </div>
  );
}

interface FadeTransitionProps {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Smooth fade transition wrapper for content changes.
 */
export function FadeTransition({
  show,
  children,
  className,
}: FadeTransitionProps) {
  return (
    <div
      className={cn(
        'transition-opacity duration-200',
        show ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
