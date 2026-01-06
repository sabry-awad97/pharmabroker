/**
 * ParticipantCard Component
 *
 * Displays a WhatsApp group participant with avatar, name (with JID fallback),
 * role badge, join date, added-by info, and owner indicator.
 *
 * Requirements: 4.2, 4.3, 4.4, 3.5
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Crown, Shield, ShieldCheck, User } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { getInitials } from '@/utils/avatar';
import { extractPhoneFromJid } from '@/utils/jid';
import type {
  WhatsAppGroupParticipant,
  ParticipantRole,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Role Badge Variants
// ============================================================================

const roleBadgeVariants = cva('gap-1 rounded-full px-2 py-0.5', {
  variants: {
    role: {
      superadmin:
        'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      admin: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      member: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
  },
  defaultVariants: {
    role: 'member',
  },
});

// ============================================================================
// Types
// ============================================================================

export interface ParticipantCardProps {
  /** The participant data */
  participant: WhatsAppGroupParticipant;
  /** Whether this participant is the group owner */
  isOwner?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show compact view (less details) */
  compact?: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the display name for a participant.
 * Falls back to phone number extracted from JID if no display name is set.
 */
export function getParticipantDisplayName(
  participant: WhatsAppGroupParticipant,
): string {
  if (participant.displayName && participant.displayName.trim()) {
    return participant.displayName;
  }
  return extractPhoneFromJid(participant.jid);
}

/**
 * Gets the role icon component for a participant role.
 */
function getRoleIcon(role: ParticipantRole) {
  switch (role) {
    case 'superadmin':
      return ShieldCheck;
    case 'admin':
      return Shield;
    default:
      return User;
  }
}

/**
 * Gets the human-readable role label.
 */
export function getRoleLabel(role: ParticipantRole): string {
  switch (role) {
    case 'superadmin':
      return 'Super Admin';
    case 'admin':
      return 'Admin';
    default:
      return 'Member';
  }
}

// ============================================================================
// Component
// ============================================================================

export function ParticipantCard({
  participant,
  isOwner = false,
  className,
  compact = false,
}: ParticipantCardProps) {
  const displayName = getParticipantDisplayName(participant);
  const initials = getInitials(displayName);
  const RoleIcon = getRoleIcon(participant.role);
  const phoneNumber = extractPhoneFromJid(participant.jid);

  return (
    <div
      className={cn(
        'hover:bg-muted/50 flex items-center gap-3 rounded-lg p-2 transition-colors',
        className,
      )}
      data-testid="participant-card"
    >
      {/* Avatar with owner crown */}
      <div className="relative">
        <Avatar className="size-10">
          {participant.avatarUrl && (
            <AvatarImage
              src={participant.avatarUrl}
              alt={`${displayName} avatar`}
            />
          )}
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {initials || <User className="size-4" />}
          </AvatarFallback>
        </Avatar>

        {/* Owner crown indicator */}
        {isOwner && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
                data-testid="owner-indicator"
              >
                <Crown className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Group Owner</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Participant info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate text-sm font-medium"
            data-testid="participant-name"
          >
            {displayName}
          </span>

          {/* Role badge */}
          <Badge
            variant="secondary"
            className={cn(roleBadgeVariants({ role: participant.role }))}
            data-testid="role-badge"
          >
            <RoleIcon className="size-3" />
            <span className="text-xs">{getRoleLabel(participant.role)}</span>
          </Badge>
        </div>

        {/* Secondary info - phone number if different from display name */}
        {!compact && participant.displayName && (
          <p
            className="text-muted-foreground truncate text-xs"
            data-testid="participant-phone"
          >
            +{phoneNumber}
          </p>
        )}

        {/* Join info */}
        {!compact && (
          <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
            <span data-testid="join-date">
              Joined {formatRelativeTime(participant.joinedAt)}
            </span>
            {participant.addedBy && (
              <>
                <span>•</span>
                <span data-testid="added-by">
                  Added by +{extractPhoneFromJid(participant.addedBy)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Checks if a participant is the owner of a group.
 * Compares the participant's JID with the group's ownerJid.
 */
export function isParticipantOwner(
  participantJid: string,
  ownerJid: string | null | undefined,
): boolean {
  if (!ownerJid) return false;
  // Compare the phone number portions to handle device suffix differences
  return extractPhoneFromJid(participantJid) === extractPhoneFromJid(ownerJid);
}

/**
 * Sorts participants by role priority: superadmin > admin > member
 */
export function sortParticipantsByRole(
  participants: WhatsAppGroupParticipant[],
): WhatsAppGroupParticipant[] {
  const rolePriority: Record<ParticipantRole, number> = {
    superadmin: 0,
    admin: 1,
    member: 2,
  };

  return [...participants].sort(
    (a, b) => rolePriority[a.role] - rolePriority[b.role],
  );
}

/**
 * Groups participants by their role.
 */
export function groupParticipantsByRole(
  participants: WhatsAppGroupParticipant[],
): Record<ParticipantRole, WhatsAppGroupParticipant[]> {
  return {
    superadmin: participants.filter(p => p.role === 'superadmin'),
    admin: participants.filter(p => p.role === 'admin'),
    member: participants.filter(p => p.role === 'member'),
  };
}
