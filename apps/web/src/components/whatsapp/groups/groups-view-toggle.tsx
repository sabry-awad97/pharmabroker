/**
 * Groups View Toggle Component
 *
 * Animated toggle between grid and table view modes.
 */

import { motion } from 'motion/react';
import { LayoutGrid, List } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ViewMode = 'grid' | 'table';

interface GroupsViewToggleProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  className?: string;
}

export function GroupsViewToggle({
  view,
  onViewChange,
  className,
}: GroupsViewToggleProps) {
  return (
    <div
      className={cn(
        'border-border/50 bg-muted/30 relative flex items-center rounded-lg border p-1',
        className,
      )}
    >
      {/* Animated background indicator */}
      <motion.div
        className="bg-background absolute inset-y-1 rounded-md shadow-sm"
        initial={false}
        animate={{
          x: view === 'grid' ? 0 : '100%',
          width: 'calc(50% - 2px)',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />

      <button
        onClick={() => onViewChange('grid')}
        className={cn(
          'relative z-10 flex h-7 w-8 items-center justify-center rounded-md transition-colors',
          view === 'grid'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-label="Grid view"
        aria-pressed={view === 'grid'}
      >
        <LayoutGrid className="h-4 w-4" />
      </button>

      <button
        onClick={() => onViewChange('table')}
        className={cn(
          'relative z-10 flex h-7 w-8 items-center justify-center rounded-md transition-colors',
          view === 'table'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-label="Table view"
        aria-pressed={view === 'table'}
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
