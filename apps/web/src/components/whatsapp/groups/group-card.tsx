/**
 * GroupCard Component
 *
 * Displays a WhatsApp group summary card with avatar, name, member count,
 * last activity, status badges, and quick actions.
 *
 * Requirements: 1.5, 1.6, 6.4, 6.5, 7.1, 7.2
 */

import {
  AlertTriangle,
  Archive,
  BellOff,
  Copy,
  Eye,
  RefreshCw,
  Users,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { WhatsAppGroup } from '@pharmabroker/schemas';
import type { SessionStatus } from '@pharmabroker/schemas/whatsapp';

import { GroupAvatar } from './group-avatar';
import { GroupStatusBadges } from './group-status-badges';

/** Quick action types for group cards */
export type GroupQuickAction = 'view' | 'copy-jid' | 'refresh';

/** Session info for displaying session indicator */
export interface SessionInfo {
  id: string;
  name: string;
  status: SessionStatus;
}

export interface GroupCardProps {
  /** The WhatsApp group data */
  group: WhatsAppGroup;
  /** Session information for displaying session indicator (Requirements 6.4, 6.5) */
  session?: SessionInfo;
  /** Whether to show the session indicator (when viewing all sessions) */
  showSessionIndicator?: boolean;
  /** Callback when the card is clicked to view details */
  onSelect?: (groupId: string) => void;
  /** Callback when a quick action is triggered */
  onQuickAction?: (action: GroupQuickAction, groupId: string) => void;
  /** Whether quick actions are loading */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function GroupCard({
  group,
  session,
  showSessionIndicator = false,
  onSelect,
  onQuickAction,
  isLoading = false,
  className,
}: GroupCardProps) {
  const handleCardClick = () => {
    onSelect?.(group.id);
  };

  const handleQuickAction = (action: GroupQuickAction, e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickAction?.(action, group.id);
  };

  const lastActivity = group.lastSyncAt || group.updatedAt;

  // Determine if the group is stale (session disconnected or logged out)
  // Requirements 6.5
  const isStale = session
    ? session.status === 'disconnected' || session.status === 'logged_out'
    : false;

  return (
    <Card
      className={cn(
        'group relative cursor-pointer transition-all duration-200 hover:shadow-md hover:shadow-black/5',
        'border-l-4',
        // Border color based on status
        group.isArchived
          ? 'border-l-slate-400/50 hover:border-l-slate-400'
          : group.isMuted
            ? 'border-l-rose-400/50 hover:border-l-rose-400'
            : 'border-l-emerald-500/50 hover:border-l-emerald-500',
        // Stale indicator styling (Requirements 6.5)
        isStale && 'border-l-amber-500/50 opacity-75 hover:border-l-amber-500',
        // Archived/muted opacity
        (group.isArchived || group.isMuted) && 'opacity-80',
        className,
      )}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`${group.name} group with ${group.memberCount} members${isStale ? ', session disconnected' : ''}${group.isMuted ? ', muted' : ''}${group.isArchived ? ', archived' : ''}`}
    >
      {/* Muted/Archived ribbon */}
      {(group.isMuted || group.isArchived) && (
        <div className="absolute top-3 -right-8 z-10 rotate-45">
          <div
            className={cn(
              'px-8 py-0.5 text-[10px] font-semibold tracking-wider text-white uppercase shadow-sm',
              group.isArchived ? 'bg-slate-500' : 'bg-rose-500',
            )}
          >
            {group.isArchived ? 'Archived' : 'Muted'}
          </div>
        </div>
      )}

      {/* Stale indicator banner (Requirements 6.5) */}
      {isStale && (
        <div
          className="flex items-center gap-1.5 bg-amber-500/10 px-3 py-1 text-xs text-amber-600"
          data-testid="stale-indicator"
        >
          <AlertTriangle className="size-3" />
          <span>Session disconnected - data may be outdated</span>
        </div>
      )}

      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          {/* Avatar with status overlay */}
          <div className="relative">
            <GroupAvatar
              name={group.name}
              avatarUrl={group.avatarUrl}
              size="md"
              className={cn(
                (group.isArchived || group.isMuted) && 'grayscale-30',
              )}
            />
            {/* Muted/Archived icon overlay */}
            {(group.isMuted || group.isArchived) && (
              <div
                className={cn(
                  'border-background absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded-full border-2',
                  group.isArchived ? 'bg-slate-500' : 'bg-rose-500',
                )}
              >
                {group.isArchived ? (
                  <Archive className="h-2.5 w-2.5 text-white" />
                ) : (
                  <BellOff className="h-2.5 w-2.5 text-white" />
                )}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle
              className={cn(
                'truncate text-base',
                (group.isArchived || group.isMuted) && 'text-muted-foreground',
              )}
              data-testid="group-name"
            >
              {group.name}
            </CardTitle>
            <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-sm">
              <Users className="size-3.5" />
              <span data-testid="member-count">
                {group.memberCount} members
              </span>
            </div>
          </div>
        </div>

        <CardAction>
          <div className="flex flex-col items-end gap-1">
            <GroupStatusBadges
              settings={{
                isAnnounce: group.isAnnounce,
                isLocked: group.isLocked,
                isEphemeral: group.isEphemeral,
                ephemeralTime: group.ephemeralTime,
              }}
            />
            {/* Session indicator (Requirements 6.4) */}
            {showSessionIndicator && session && (
              <Badge
                variant="secondary"
                className="h-auto px-1.5 py-0.5 text-[10px]"
                data-testid="session-indicator"
              >
                {session.name}
              </Badge>
            )}
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="pb-2">
        {group.description && (
          <p className="text-muted-foreground line-clamp-2 text-xs">
            {group.description}
          </p>
        )}
      </CardContent>

      <CardFooter className="bg-muted/30 py-2.5">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="text-muted-foreground text-xs"
              data-testid="last-activity"
            >
              {formatRelativeTime(lastActivity)}
            </span>
            {/* Muted until indicator */}
            {group.isMuted && group.mutedUntil && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="secondary"
                    className="h-5 gap-1 bg-rose-500/10 px-1.5 text-[10px] text-rose-500"
                  >
                    <BellOff className="h-2.5 w-2.5" />
                    {formatMutedUntil(group.mutedUntil)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Muted until {new Date(group.mutedUntil).toLocaleString()}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Quick Actions - visible on hover/focus */}
          <div
            className={cn(
              'flex items-center gap-1 transition-opacity duration-200',
              'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={e => handleQuickAction('view', e)}
                  disabled={isLoading}
                  aria-label="View group details"
                >
                  <Eye className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">View details</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={e => handleQuickAction('copy-jid', e)}
                  disabled={isLoading}
                  aria-label="Copy group JID"
                >
                  <Copy className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Copy JID</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={e => handleQuickAction('refresh', e)}
                  disabled={isLoading}
                  aria-label="Refresh group"
                >
                  <RefreshCw
                    className={cn('size-3.5', isLoading && 'animate-spin')}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Refresh</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

/**
 * Format muted until time for display
 */
function formatMutedUntil(date: Date | string): string {
  const mutedUntil = new Date(date);
  const now = new Date();
  const diffMs = mutedUntil.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return '<1h';
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.floor(diffDays / 7)}w`;
  return 'Forever';
}

/**
 * Extracts the data needed for GroupCard display from a WhatsAppGroup
 * Useful for testing and data transformation
 */
export function extractGroupCardData(group: WhatsAppGroup) {
  return {
    id: group.id,
    name: group.name,
    memberCount: group.memberCount,
    lastActivity: group.lastSyncAt || group.updatedAt,
    avatarUrl: group.avatarUrl,
    description: group.description,
    settings: {
      isAnnounce: group.isAnnounce,
      isLocked: group.isLocked,
      isEphemeral: group.isEphemeral,
      ephemeralTime: group.ephemeralTime,
    },
  };
}

/**
 * Validates that a group has all required data for display
 * Returns true if the group has name, memberCount, and a valid timestamp
 */
export function isGroupCardDataComplete(group: WhatsAppGroup): boolean {
  return (
    typeof group.name === 'string' &&
    group.name.length > 0 &&
    typeof group.memberCount === 'number' &&
    group.memberCount >= 0 &&
    (group.lastSyncAt instanceof Date ||
      group.updatedAt instanceof Date ||
      typeof group.lastSyncAt === 'string' ||
      typeof group.updatedAt === 'string')
  );
}

/**
 * Determines if a session indicator should be displayed for a group
 * Returns true when viewing all sessions and multiple sessions exist
 * Requirements 6.4
 */
export function shouldShowSessionIndicator(
  showAllSessions: boolean,
  sessionCount: number,
): boolean {
  return showAllSessions && sessionCount > 1;
}

/**
 * Determines if a group should be marked as stale based on session status
 * Returns true if the session is disconnected or logged out
 * Requirements 6.5
 */
export function isGroupStale(
  sessionStatus: SessionStatus | undefined,
): boolean {
  if (!sessionStatus) return false;
  return sessionStatus === 'disconnected' || sessionStatus === 'logged_out';
}
