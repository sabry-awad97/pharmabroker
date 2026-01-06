/**
 * GroupDetailHeader Component
 *
 * Displays the header section of a group detail page with large avatar,
 * name, description, creation date, and last sync time.
 * Includes back navigation.
 *
 * Requirements: 3.2, 5.5
 */

import { ArrowLeft, Calendar, RefreshCw } from 'lucide-react';
import { Link } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import type { WhatsAppGroup } from '@pharmabroker/schemas/whatsapp';

import { GroupAvatar } from './group-avatar';
import { GroupStatusBadges } from './group-status-badges';

export interface GroupDetailHeaderProps {
  /** The WhatsApp group data */
  group: WhatsAppGroup;
  /** Callback when sync button is clicked */
  onSync?: () => void;
  /** Whether sync is in progress */
  isSyncing?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Formats a date for display in the header.
 * Shows full date for creation, relative time for sync.
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'Unknown';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function GroupDetailHeader({
  group,
  onSync,
  isSyncing = false,
  className,
}: GroupDetailHeaderProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Back navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="gap-2">
          <Link to="/whatsapp/groups">
            <ArrowLeft className="size-4" />
            Back to Groups
          </Link>
        </Button>

        {onSync && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
                className="gap-2"
              >
                <RefreshCw
                  className={cn('size-4', isSyncing && 'animate-spin')}
                />
                {isSyncing ? 'Syncing...' : 'Sync Group'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh group data from WhatsApp</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Group info header */}
      <div className="bg-card border-border rounded-lg border p-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Large avatar */}
          <GroupAvatar
            name={group.name}
            avatarUrl={group.avatarUrl}
            size="lg"
            className="shrink-0"
          />

          {/* Group details */}
          <div className="min-w-0 flex-1 space-y-3">
            {/* Name and badges */}
            <div className="flex flex-wrap items-start gap-3">
              <h1
                className="text-xl leading-tight font-semibold"
                data-testid="group-detail-name"
              >
                {group.name}
              </h1>
              <GroupStatusBadges
                settings={{
                  isAnnounce: group.isAnnounce,
                  isLocked: group.isLocked,
                  isEphemeral: group.isEphemeral,
                  ephemeralTime: group.ephemeralTime,
                }}
                showLabels
              />
            </div>

            {/* Description */}
            {group.description && (
              <p
                className="text-muted-foreground text-sm leading-relaxed"
                data-testid="group-detail-description"
              >
                {group.description}
              </p>
            )}

            {/* Metadata row */}
            <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
              {/* Member count */}
              <span data-testid="group-detail-member-count">
                {group.memberCount} members
              </span>

              {/* Creation date */}
              {group.groupCreatedAt && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex items-center gap-1.5"
                      data-testid="group-detail-created"
                    >
                      <Calendar className="size-3.5" />
                      Created {formatDate(group.groupCreatedAt)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Group creation date</TooltipContent>
                </Tooltip>
              )}

              {/* Last sync time */}
              {group.lastSyncAt && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex items-center gap-1.5"
                      data-testid="group-detail-synced"
                    >
                      <RefreshCw className="size-3.5" />
                      Synced {formatRelativeTime(group.lastSyncAt)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Last synchronization time</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
