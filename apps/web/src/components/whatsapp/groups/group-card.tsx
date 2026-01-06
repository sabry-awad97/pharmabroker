/**
 * GroupCard Component
 *
 * Displays a WhatsApp group summary card with avatar, name, member count,
 * last activity, status badges, and quick actions.
 *
 * Requirements: 1.5, 1.6, 6.4, 6.5, 7.1, 7.2
 */

import { AlertTriangle, Copy, Eye, RefreshCw, Users } from 'lucide-react';

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
        'border-l-primary/50 hover:border-l-primary border-l-4',
        // Stale indicator styling (Requirements 6.5)
        isStale && 'border-l-amber-500/50 opacity-75 hover:border-l-amber-500',
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
      aria-label={`${group.name} group with ${group.memberCount} members${isStale ? ', session disconnected' : ''}`}
    >
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
          <GroupAvatar
            name={group.name}
            avatarUrl={group.avatarUrl}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base" data-testid="group-name">
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
          <span
            className="text-muted-foreground text-xs"
            data-testid="last-activity"
          >
            {formatRelativeTime(lastActivity)}
          </span>

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
