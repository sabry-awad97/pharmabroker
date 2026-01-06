/**
 * ParticipantList Component
 *
 * Displays a list of WhatsApp group participants grouped by role.
 * Includes search functionality and handles loading/empty states.
 *
 * Requirements: 4.1, 4.5, 3.4, 3.6
 */

import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import type {
  WhatsAppGroupParticipant,
  ParticipantRole,
} from '@pharmabroker/schemas/whatsapp';

import {
  ParticipantCard,
  isParticipantOwner,
  groupParticipantsByRole,
  getParticipantDisplayName,
  getRoleLabel,
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
}

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
      {/* Role group skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
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
  onClearSearch,
}: {
  searchQuery?: string;
  onClearSearch?: () => void;
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
              <span className="font-medium">{searchQuery}</span>".
            </>
          ) : (
            'This group has no participants.'
          )}
        </EmptyDescription>
      </EmptyHeader>
      {searchQuery && onClearSearch && (
        <EmptyContent>
          <button
            onClick={onClearSearch}
            className="text-primary text-sm hover:underline"
          >
            Clear search
          </button>
        </EmptyContent>
      )}
    </Empty>
  );
}

// ============================================================================
// Role Group Component
// ============================================================================

interface RoleGroupProps {
  role: ParticipantRole;
  participants: WhatsAppGroupParticipant[];
  ownerJid?: string | null;
}

function RoleGroup({ role, participants, ownerJid }: RoleGroupProps) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1" data-testid={`role-group-${role}`}>
      <h3 className="text-muted-foreground px-2 text-xs font-medium tracking-wider uppercase">
        {getRoleLabel(role)} ({participants.length})
      </h3>
      <div className="space-y-0.5">
        {participants.map(participant => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            isOwner={isParticipantOwner(participant.jid, ownerJid)}
          />
        ))}
      </div>
    </div>
  );
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
}: ParticipantListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter participants by search query
  const filteredParticipants = useMemo(
    () => filterParticipantsBySearch(participants, searchQuery),
    [participants, searchQuery],
  );

  // Group filtered participants by role
  const groupedParticipants = useMemo(
    () => groupParticipantsByRole(filteredParticipants),
    [filteredParticipants],
  );

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('space-y-4', className)}>
        {showSearch && (
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        <ParticipantListSkeleton />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Search input */}
      {showSearch && (
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8"
            aria-label="Search participants"
          />
        </div>
      )}

      {/* Empty state */}
      {filteredParticipants.length === 0 ? (
        <ParticipantEmptyState
          searchQuery={searchQuery}
          onClearSearch={searchQuery ? handleClearSearch : undefined}
        />
      ) : (
        /* Participant groups by role */
        <div className="space-y-4" data-testid="participant-groups">
          <RoleGroup
            role="superadmin"
            participants={groupedParticipants.superadmin}
            ownerJid={ownerJid}
          />
          <RoleGroup
            role="admin"
            participants={groupedParticipants.admin}
            ownerJid={ownerJid}
          />
          <RoleGroup
            role="member"
            participants={groupedParticipants.member}
            ownerJid={ownerJid}
          />
        </div>
      )}
    </div>
  );
}

export { ParticipantListSkeleton, ParticipantCardSkeleton };
