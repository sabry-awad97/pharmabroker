/**
 * Groups Faceted Filter
 *
 * Beautiful filter component with icons, counts, and animations.
 */

import type { GroupFilterType } from '@/hooks/whatsapp-groups';

import { motion, AnimatePresence } from 'motion/react';
import {
  Archive,
  BellOff,
  Crown,
  Filter,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FilterOption {
  value: GroupFilterType;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  description: string;
}

const filterOptions: FilterOption[] = [
  {
    value: 'all',
    label: 'All Groups',
    icon: <Layers className="h-4 w-4" />,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30',
    description: 'View all groups',
  },
  {
    value: 'admin',
    label: 'Admin',
    icon: <Crown className="h-4 w-4" />,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',
    description: 'Groups where you are admin',
  },
  {
    value: 'archived',
    label: 'Archived',
    icon: <Archive className="h-4 w-4" />,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10 hover:bg-slate-500/20 border-slate-500/30',
    description: 'Archived groups',
  },
  {
    value: 'muted',
    label: 'Muted',
    icon: <BellOff className="h-4 w-4" />,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/30',
    description: 'Muted groups',
  },
];

interface GroupsFacetedFilterProps {
  search: string;
  filter: GroupFilterType;
  counts: Record<GroupFilterType, number>;
  onSearchChange: (search: string) => void;
  onFilterChange: (filter: GroupFilterType) => void;
  onClear?: () => void;
  className?: string;
}

export function GroupsFacetedFilter({
  search,
  filter,
  counts,
  onSearchChange,
  onFilterChange,
  onClear,
  className,
}: GroupsFacetedFilterProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const hasActiveFilters = search.length > 0 || filter !== 'all';

  const activeOption = filterOptions.find(opt => opt.value === filter);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search Bar */}
      <div className="relative">
        <motion.div
          className={cn(
            'absolute inset-0 rounded-xl transition-all duration-300',
            isSearchFocused
              ? 'bg-emerald-500/5 ring-2 ring-emerald-500/20'
              : 'bg-transparent',
          )}
          layoutId="search-focus"
        />
        <div className="relative flex items-center">
          <Search
            className={cn(
              'absolute left-4 h-4 w-4 transition-colors duration-200',
              isSearchFocused ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          />
          <input
            type="text"
            placeholder="Search groups by name..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className={cn(
              'bg-background/50 h-11 w-full rounded-xl border pr-10 pl-11 text-sm',
              'placeholder:text-muted-foreground/60',
              'transition-all duration-200 outline-none',
              'border-border/50 focus:border-emerald-500/50',
            )}
          />
          <AnimatePresence>
            {search && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => onSearchChange('')}
                className="text-muted-foreground hover:bg-muted hover:text-foreground absolute right-3 rounded-full p-1"
              >
                <X className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-muted-foreground mr-2 flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs font-medium">Filter</span>
        </div>

        {filterOptions.map(option => {
          const isActive = filter === option.value;
          const count = counts[option.value];

          return (
            <motion.button
              key={option.value}
              onClick={() => onFilterChange(option.value)}
              className={cn(
                'group relative flex items-center gap-2 rounded-full border px-3 py-1.5',
                'text-xs font-medium transition-all duration-200',
                isActive
                  ? cn(option.bgColor, option.color, 'border-current/30')
                  : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50',
              )}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Active indicator glow */}
              {isActive && (
                <motion.div
                  layoutId="active-filter"
                  className={cn(
                    'absolute inset-0 rounded-full opacity-50 blur-md',
                    option.value === 'all' && 'bg-emerald-500/30',
                    option.value === 'admin' && 'bg-amber-500/30',
                    option.value === 'archived' && 'bg-slate-500/30',
                    option.value === 'muted' && 'bg-rose-500/30',
                  )}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}

              <span className={cn('relative', isActive && option.color)}>
                {option.icon}
              </span>
              <span className="relative">{option.label}</span>

              {/* Count badge */}
              <Badge
                variant="secondary"
                className={cn(
                  'relative ml-0.5 h-5 min-w-5 justify-center px-1.5 text-[10px] font-semibold',
                  isActive
                    ? cn('bg-background/80', option.color)
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </Badge>
            </motion.button>
          );
        })}

        {/* Clear filters button */}
        <AnimatePresence>
          {hasActiveFilters && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-muted-foreground hover:text-foreground h-8 gap-1.5 text-xs"
              >
                <X className="h-3 w-3" />
                Clear
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Active filter description */}
      <AnimatePresence mode="wait">
        {activeOption && filter !== 'all' && (
          <motion.div
            key={filter}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-3 py-2',
              activeOption.bgColor,
              'border-current/20',
            )}
          >
            <Sparkles className={cn('h-3.5 w-3.5', activeOption.color)} />
            <span className={cn('text-xs', activeOption.color)}>
              {activeOption.description}
            </span>
            <span className="text-xs opacity-60">
              — {counts[filter]} group{counts[filter] !== 1 ? 's' : ''}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
