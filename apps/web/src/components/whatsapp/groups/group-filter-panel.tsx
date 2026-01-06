/**
 * GroupFilterPanel Component
 *
 * Provides filtering and search controls for WhatsApp groups.
 * Includes search input with debounced filtering, filter tabs,
 * session selector, and filter counts.
 *
 * Requirements: 2.1, 2.5, 6.1, 6.2
 */

import { useCallback, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { GroupFilterType } from '@pharmabroker/schemas/whatsapp';
import type { Session } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Types
// ============================================================================

export interface FilterCounts {
  all: number;
  admin: number;
  archived: number;
  muted: number;
}

export interface GroupFilterPanelProps {
  /** Current search query */
  search: string;
  /** Current filter type */
  filter: GroupFilterType;
  /** Current session ID filter */
  sessionId: string | null;
  /** Available sessions for the selector */
  sessions: Session[];
  /** Counts for each filter option */
  counts?: FilterCounts;
  /** Callback when search changes (debounced) */
  onSearchChange: (search: string) => void;
  /** Callback when filter type changes */
  onFilterChange: (filter: GroupFilterType) => void;
  /** Callback when session filter changes */
  onSessionChange: (sessionId: string | null) => void;
  /** Whether the panel is in a loading state */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_DELAY = 300;

const FILTER_OPTIONS: { value: GroupFilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'admin', label: 'Admin' },
  { value: 'archived', label: 'Archived' },
  { value: 'muted', label: 'Muted' },
];

// ============================================================================
// Component
// ============================================================================

export function GroupFilterPanel({
  search,
  filter,
  sessionId,
  sessions,
  counts,
  onSearchChange,
  onFilterChange,
  onSessionChange,
  isLoading = false,
  className,
}: GroupFilterPanelProps) {
  // Local state for immediate input feedback
  const [localSearch, setLocalSearch] = useState(search);

  // Sync local search with prop when it changes externally
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Debounced search handler
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalSearch(e.target.value);
    },
    [],
  );

  const handleClearSearch = useCallback(() => {
    setLocalSearch('');
    onSearchChange('');
  }, [onSearchChange]);

  const handleFilterChange = useCallback(
    (value: string) => {
      onFilterChange(value as GroupFilterType);
    },
    [onFilterChange],
  );

  const handleSessionChange = useCallback(
    (value: string | null) => {
      onSessionChange(value === 'all' || value === null ? null : value);
    },
    [onSessionChange],
  );

  const showSessionSelector = sessions.length > 1;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
      role="search"
      aria-label="Filter groups"
    >
      {/* Search Input */}
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          type="search"
          placeholder="Search groups..."
          value={localSearch}
          onChange={handleSearchChange}
          className="pr-8 pl-8"
          aria-label="Search groups by name"
          disabled={isLoading}
        />
        {localSearch && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute top-1/2 right-1 -translate-y-1/2"
            onClick={handleClearSearch}
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      {/* Filter Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter Tabs */}
        <Tabs
          value={filter}
          onValueChange={handleFilterChange}
          aria-label="Filter groups by type"
        >
          <TabsList variant="line">
            {FILTER_OPTIONS.map(option => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                disabled={isLoading}
                className="gap-1.5"
              >
                {option.label}
                {counts && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-4 min-w-4 px-1 text-[10px]"
                    aria-label={`${counts[option.value]} groups`}
                  >
                    {counts[option.value]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Session Selector */}
        {showSessionSelector && (
          <Select
            value={sessionId ?? 'all'}
            onValueChange={handleSessionChange}
          >
            <SelectTrigger
              size="sm"
              className="w-[140px]"
              aria-label="Filter by session"
              disabled={isLoading}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sessions</SelectItem>
              {sessions.map(session => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Filter Logic Utilities (for testing)
// ============================================================================

/**
 * Filters groups by search query (case-insensitive name match)
 * Property 4: Search Filter Correctness
 */
export function filterGroupsBySearch<T extends { name: string }>(
  groups: T[],
  search: string,
): T[] {
  if (!search.trim()) return groups;
  const normalizedSearch = search.toLowerCase().trim();
  return groups.filter(group =>
    group.name.toLowerCase().includes(normalizedSearch),
  );
}

/**
 * Filters groups by session ID
 * Property 5: Session Filter Correctness
 */
export function filterGroupsBySession<T extends { sessionId: string }>(
  groups: T[],
  sessionId: string | null,
): T[] {
  if (!sessionId) return groups;
  return groups.filter(group => group.sessionId === sessionId);
}

/**
 * Calculates filter counts for all filter options
 * Property 6: Filter Count Accuracy
 */
export function calculateFilterCounts<
  T extends {
    sessionId: string;
    ownerJid: string | null;
    // For admin filter, we need to check if user is admin
    // This would typically come from a participant lookup
  },
>(
  groups: T[],
  currentUserJid?: string,
  isAdminInGroup?: (group: T) => boolean,
): FilterCounts {
  return {
    all: groups.length,
    admin: isAdminInGroup
      ? groups.filter(group => isAdminInGroup(group)).length
      : 0,
    archived: 0, // Would need archived flag on group
    muted: 0, // Would need muted flag on group
  };
}

/**
 * Applies all filters to a groups list
 */
export function applyGroupFilters<
  T extends { name: string; sessionId: string },
>(
  groups: T[],
  filters: {
    search: string;
    sessionId: string | null;
    filter: GroupFilterType;
  },
): T[] {
  let result = groups;

  // Apply search filter
  result = filterGroupsBySearch(result, filters.search);

  // Apply session filter
  result = filterGroupsBySession(result, filters.sessionId);

  // Note: filter type (admin, archived, muted) would be applied server-side
  // as it requires additional data not present on the group object

  return result;
}
