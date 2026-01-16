/**
 * ParticipantList Component
 *
 * Displays a table of WhatsApp group participants with role filtering.
 * Includes search functionality, pagination, and handles loading/empty states.
 *
 * Requirements: 4.1, 4.5, 3.4, 3.6
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Search,
  Shield,
  User,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';
import { extractPhoneFromJid } from '@/utils/jid';
import { getAvatarUrl, getInitials } from '@/utils/avatar';
import type {
  WhatsAppGroupParticipant,
  ParticipantRole,
} from '@pharmabroker/schemas/whatsapp';

import {
  isParticipantOwner,
  groupParticipantsByRole,
  getParticipantDisplayName,
} from './participant-card';

// ============================================================================
// Types
// ============================================================================

export interface ParticipantListProps {
  /** List of participants to display */
  participants: WhatsAppGroupParticipant[];
  /** The group owner's JID for owner identification */
  ownerJid?: string | null;
  /** Whether the list is loading */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the search input */
  showSearch?: boolean;
  /** Placeholder text for search input */
  searchPlaceholder?: string;
  /** Number of participants per page */
  pageSize?: number;
}

type RoleFilter = 'all' | ParticipantRole;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filters participants by search query.
 * Matches against display name or phone number extracted from JID.
 */
export function filterParticipantsBySearch(
  participants: WhatsAppGroupParticipant[],
  search: string,
): WhatsAppGroupParticipant[] {
  if (!search.trim()) {
    return participants;
  }

  const normalizedSearch = search.toLowerCase().trim();

  return participants.filter(participant => {
    const displayName = getParticipantDisplayName(participant).toLowerCase();
    const phoneNumber = extractPhoneFromJid(participant.jid).toLowerCase();

    return (
      displayName.includes(normalizedSearch) ||
      phoneNumber.includes(normalizedSearch)
    );
  });
}

// ============================================================================
// Role Filter Pills
// ============================================================================

interface RoleFilterPillsProps {
  activeFilter: RoleFilter;
  onFilterChange: (filter: RoleFilter) => void;
  counts: Record<ParticipantRole | 'all', number>;
}

const roleConfig = {
  all: {
    icon: Users,
    label: 'All',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
  },
  superadmin: {
    icon: Crown,
    label: 'Owners',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
  },
  admin: {
    icon: Shield,
    label: 'Admins',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
  },
  member: {
    icon: User,
    label: 'Members',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10 border-slate-500/30',
  },
} as const;

function RoleFilterPills({
  activeFilter,
  onFilterChange,
  counts,
}: RoleFilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {(Object.keys(roleConfig) as RoleFilter[]).map(role => {
        const config = roleConfig[role];
        const Icon = config.icon;
        const isActive = activeFilter === role;
        const count = counts[role];

        // Don't show role if count is 0 (except 'all')
        if (count === 0 && role !== 'all') return null;

        return (
          <motion.button
            key={role}
            onClick={() => onFilterChange(role)}
            className={cn(
              'relative flex items-center gap-1.5 rounded-full border px-3 py-1.5',
              'text-xs font-medium transition-all duration-200',
              isActive
                ? cn(config.bgColor, config.color)
                : 'border-border/50 text-muted-foreground hover:text-foreground hover:border-border',
            )}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {isActive && (
              <motion.div
                layoutId="active-role-filter"
                className={cn(
                  'absolute inset-0 rounded-full opacity-30 blur-sm',
                  role === 'all' && 'bg-emerald-500',
                  role === 'superadmin' && 'bg-amber-500',
                  role === 'admin' && 'bg-blue-500',
                  role === 'member' && 'bg-slate-500',
                )}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <Icon
              className={cn('relative h-3.5 w-3.5', isActive && config.color)}
            />
            <span className="relative">{config.label}</span>
            <Badge
              variant="secondary"
              className={cn(
                'relative ml-0.5 h-5 min-w-5 justify-center px-1.5 text-[10px] font-semibold',
                isActive ? cn('bg-background/80', config.color) : 'bg-muted',
              )}
            >
              {count}
            </Badge>
          </motion.button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Pagination Component
// ============================================================================

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const startItem = currentPage * pageSize + 1;
  const endItem = Math.min((currentPage + 1) * pageSize, totalItems);

  if (totalPages <= 1) return null;

  // Calculate visible page dots (max 5)
  const maxVisibleDots = 5;
  const getVisiblePages = () => {
    if (totalPages <= maxVisibleDots) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const half = Math.floor(maxVisibleDots / 2);
    let start = currentPage - half;
    let end = currentPage + half;

    if (start < 0) {
      start = 0;
      end = maxVisibleDots - 1;
    }

    if (end >= totalPages) {
      end = totalPages - 1;
      start = totalPages - maxVisibleDots;
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };

  const visiblePages = getVisiblePages();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-border/50 flex items-center justify-between border-t pt-4"
    >
      <p className="text-muted-foreground text-xs">
        Showing <span className="text-foreground font-medium">{startItem}</span>
        -<span className="text-foreground font-medium">{endItem}</span> of{' '}
        <span className="text-foreground font-medium">{totalItems}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page dots - limited to maxVisibleDots */}
        <div className="flex items-center gap-1 px-2">
          {visiblePages[0] > 0 && (
            <span className="text-muted-foreground px-1 text-xs">...</span>
          )}
          {visiblePages.map(idx => (
            <button
              key={idx}
              onClick={() => onPageChange(idx)}
              className={cn(
                'h-2 rounded-full transition-all duration-200',
                currentPage === idx
                  ? 'w-6 bg-emerald-500'
                  : 'bg-muted hover:bg-muted-foreground/30 w-2',
              )}
              aria-label={`Go to page ${idx + 1}`}
            />
          ))}
          {visiblePages[visiblePages.length - 1] < totalPages - 1 && (
            <span className="text-muted-foreground px-1 text-xs">...</span>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages - 1}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

// ============================================================================
// Skeleton Component
// ============================================================================

function ParticipantCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg p-2">
      <Skeleton className="size-10 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

function ParticipantListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading participants">
      {/* Filter pills skeleton */}
      <div className="flex gap-2">
        {[1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* Participant cards skeleton */}
      <div className="space-y-1">
        {Array.from({ length: count }).map((_, index) => (
          <ParticipantCardSkeleton key={index} />
        ))}
      </div>
      <span className="sr-only">Loading participants...</span>
    </div>
  );
}

// ============================================================================
// Empty State Component
// ============================================================================

function ParticipantEmptyState({
  searchQuery,
  roleFilter,
  onClearSearch,
  onClearFilter,
}: {
  searchQuery?: string;
  roleFilter?: RoleFilter;
  onClearSearch?: () => void;
  onClearFilter?: () => void;
}) {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyMedia>
          <Users className="text-muted-foreground size-10" />
        </EmptyMedia>
        <EmptyTitle className="text-base">No participants found</EmptyTitle>
        <EmptyDescription>
          {searchQuery ? (
            <>
              No participants match "
              <span className="font-medium">{searchQuery}</span>"
              {roleFilter && roleFilter !== 'all' && (
                <> in {roleConfig[roleFilter].label.toLowerCase()}</>
              )}
              .
            </>
          ) : roleFilter && roleFilter !== 'all' ? (
            <>No {roleConfig[roleFilter].label.toLowerCase()} in this group.</>
          ) : (
            'This group has no participants.'
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex gap-2">
        {searchQuery && onClearSearch && (
          <Button variant="outline" size="sm" onClick={onClearSearch}>
            Clear search
          </Button>
        )}
        {roleFilter && roleFilter !== 'all' && onClearFilter && (
          <Button variant="outline" size="sm" onClick={onClearFilter}>
            Show all
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}

// ============================================================================
// Table Row Component
// ============================================================================

interface ParticipantTableRowProps {
  participant: WhatsAppGroupParticipant;
  isOwner: boolean;
  index: number;
}

function ParticipantTableRow({
  participant,
  isOwner,
  index,
}: ParticipantTableRowProps) {
  const displayName = getParticipantDisplayName(participant);
  const phone = extractPhoneFromJid(participant.jid);

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(phone);
    toast.success('Phone number copied');
  };

  const roleConfig = {
    superadmin: {
      icon: Crown,
      label: 'Owner',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10 border-amber-500/30',
    },
    admin: {
      icon: Shield,
      label: 'Admin',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10 border-blue-500/30',
    },
    member: {
      icon: User,
      label: 'Member',
      color: 'text-slate-500',
      bgColor: 'bg-slate-500/10 border-slate-500/30',
    },
  };

  const config = roleConfig[participant.role];
  const RoleIcon = config.icon;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className="group border-border/50 hover:bg-muted/30 border-b transition-colors"
    >
      {/* Participant info */}
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-9 w-9">
              <AvatarImage
                src={participant.avatarUrl || getAvatarUrl(displayName)}
                alt={displayName}
              />
              <AvatarFallback className="text-xs">
                {getInitials(displayName)}
              </AvatarFallback>
            </Avatar>
            {/* Owner crown overlay */}
            {isOwner && (
              <div className="ring-background absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 ring-2">
                <Crown className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            {isOwner && (
              <p className="text-[10px] font-medium text-amber-500">
                Group Owner
              </p>
            )}
          </div>
        </div>
      </TableCell>

      {/* Role badge */}
      <TableCell>
        <Badge
          variant="secondary"
          className={cn('gap-1 border', config.bgColor, config.color)}
        >
          <RoleIcon className="h-3 w-3" />
          {config.label}
        </Badge>
      </TableCell>

      {/* Phone */}
      <TableCell>
        <span className="text-muted-foreground font-mono text-xs">
          +{phone}
        </span>
      </TableCell>

      {/* Joined date */}
      <TableCell>
        <span className="text-muted-foreground text-xs">
          {formatJoinedDate(participant.joinedAt)}
        </span>
      </TableCell>

      {/* Actions */}
      <TableCell>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopyPhone}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy phone</TooltipContent>
        </Tooltip>
      </TableCell>
    </motion.tr>
  );
}

/**
 * Format joined date for display
 */
function formatJoinedDate(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 1) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return d.toLocaleDateString();
}

// ============================================================================
// Main Component
// ============================================================================

export function ParticipantList({
  participants,
  ownerJid,
  isLoading = false,
  className,
  showSearch = true,
  searchPlaceholder = 'Search participants...',
  pageSize = 10,
}: ParticipantListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Calculate role counts
  const roleCounts = useMemo(() => {
    const grouped = groupParticipantsByRole(participants);
    return {
      all: participants.length,
      superadmin: grouped.superadmin.length,
      admin: grouped.admin.length,
      member: grouped.member.length,
    };
  }, [participants]);

  // Filter participants by search and role
  const filteredParticipants = useMemo(() => {
    let result = filterParticipantsBySearch(participants, searchQuery);

    if (roleFilter !== 'all') {
      result = result.filter(p => p.role === roleFilter);
    }

    return result;
  }, [participants, searchQuery, roleFilter]);

  // Paginate
  const totalPages = Math.ceil(filteredParticipants.length / pageSize);
  const paginatedParticipants = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredParticipants.slice(start, start + pageSize);
  }, [filteredParticipants, currentPage, pageSize]);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(0);
  }, [searchQuery, roleFilter]);

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleClearFilter = () => {
    setRoleFilter('all');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {showSearch && <Skeleton className="h-10 w-full rounded-lg" />}
        <ParticipantListSkeleton count={pageSize} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search input */}
      {showSearch && (
        <div className="relative">
          <motion.div
            className={cn(
              'absolute inset-0 rounded-lg transition-all duration-300',
              isSearchFocused
                ? 'bg-emerald-500/5 ring-2 ring-emerald-500/20'
                : 'bg-transparent',
            )}
          />
          <Search
            className={cn(
              'absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transition-colors',
              isSearchFocused ? 'text-emerald-500' : 'text-muted-foreground',
            )}
          />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="border-border/50 bg-transparent pr-9 pl-9 focus:border-emerald-500/50"
            aria-label="Search participants"
          />
          <AnimatePresence>
            {searchQuery && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={handleClearSearch}
                className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Role filter pills */}
      <RoleFilterPills
        activeFilter={roleFilter}
        onFilterChange={setRoleFilter}
        counts={roleCounts}
      />

      {/* Participants table */}
      {filteredParticipants.length === 0 ? (
        <ParticipantEmptyState
          searchQuery={searchQuery}
          roleFilter={roleFilter}
          onClearSearch={searchQuery ? handleClearSearch : undefined}
          onClearFilter={roleFilter !== 'all' ? handleClearFilter : undefined}
        />
      ) : (
        <div className="border-border overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-[300px]">Participant</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence mode="popLayout">
                {paginatedParticipants.map((participant, index) => (
                  <ParticipantTableRow
                    key={participant.id}
                    participant={participant}
                    isOwner={isParticipantOwner(participant.jid, ownerJid)}
                    index={index}
                  />
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={filteredParticipants.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}

export { ParticipantListSkeleton, ParticipantCardSkeleton };
