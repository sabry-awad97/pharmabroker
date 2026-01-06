/**
 * GroupStatusBadges Component
 *
 * Displays status badges for WhatsApp group settings:
 * - Announce-only: Only admins can send messages
 * - Locked: Only admins can edit group info
 * - Ephemeral: Messages disappear after a set time
 *
 * Requirements: 1.6, 3.3
 */

import { Megaphone, Lock, Timer } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface GroupSettings {
  /** Only admins can send messages */
  isAnnounce: boolean;
  /** Only admins can edit group info */
  isLocked: boolean;
  /** Messages disappear after a set time */
  isEphemeral: boolean;
  /** Ephemeral message duration in seconds (optional) */
  ephemeralTime?: number | null;
}

export interface GroupStatusBadgesProps {
  /** Group settings to display badges for */
  settings: GroupSettings;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show labels alongside icons */
  showLabels?: boolean;
}

/** Format ephemeral time for display */
function formatEphemeralTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function GroupStatusBadges({
  settings,
  className,
  showLabels = false,
}: GroupStatusBadgesProps) {
  const { isAnnounce, isLocked, isEphemeral, ephemeralTime } = settings;

  // Don't render anything if no settings are active
  if (!isAnnounce && !isLocked && !isEphemeral) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {isAnnounce && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="gap-1 rounded-full px-2 py-0.5"
              data-testid="badge-announce"
            >
              <Megaphone className="size-3" />
              {showLabels && <span>Announce</span>}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Announce Only</p>
            <p className="text-muted-foreground text-xs">
              Only admins can send messages
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      {isLocked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="gap-1 rounded-full px-2 py-0.5"
              data-testid="badge-locked"
            >
              <Lock className="size-3" />
              {showLabels && <span>Locked</span>}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Locked</p>
            <p className="text-muted-foreground text-xs">
              Only admins can edit group info
            </p>
          </TooltipContent>
        </Tooltip>
      )}

      {isEphemeral && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              className="gap-1 rounded-full px-2 py-0.5"
              data-testid="badge-ephemeral"
            >
              <Timer className="size-3" />
              {showLabels && (
                <span>
                  {ephemeralTime ? formatEphemeralTime(ephemeralTime) : 'On'}
                </span>
              )}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-medium">Disappearing Messages</p>
            <p className="text-muted-foreground text-xs">
              {ephemeralTime
                ? `Messages disappear after ${formatEphemeralTime(ephemeralTime)}`
                : 'Messages disappear automatically'}
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Utility function to check if a group has any active settings
 * Useful for conditional rendering
 */
export function hasActiveSettings(settings: GroupSettings): boolean {
  return settings.isAnnounce || settings.isLocked || settings.isEphemeral;
}

/**
 * Get the list of active setting names for a group
 * Useful for testing and accessibility
 */
export function getActiveSettingNames(settings: GroupSettings): string[] {
  const names: string[] = [];
  if (settings.isAnnounce) names.push('announce');
  if (settings.isLocked) names.push('locked');
  if (settings.isEphemeral) names.push('ephemeral');
  return names;
}
