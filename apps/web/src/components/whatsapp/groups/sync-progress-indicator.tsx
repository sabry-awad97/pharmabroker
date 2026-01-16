/**
 * Sync Progress Indicator Component
 *
 * Displays real-time sync progress with animated states.
 * Shows syncing groups, processing messages, and completion states.
 *
 * Feature: auto-sync-groups-messages
 * Requirements: 3.4, 4.1
 */

import { CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncStatusState, SyncProgress } from '@/hooks/use-sync-status';

// ============================================================================
// Types
// ============================================================================

export interface SyncProgressIndicatorProps {
  status: SyncStatusState;
  progress: SyncProgress | null;
  error: string | null;
  groupsSynced: number;
  messagesProcessed: number;
  className?: string;
  compact?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Animated sync progress indicator
 */
export function SyncProgressIndicator({
  status,
  progress,
  error,
  groupsSynced,
  messagesProcessed,
  className,
  compact = false,
}: SyncProgressIndicatorProps) {
  // Don't render anything when idle
  if (status === 'idle') {
    return null;
  }

  if (compact) {
    return (
      <CompactIndicator
        status={status}
        progress={progress}
        error={error}
        groupsSynced={groupsSynced}
        messagesProcessed={messagesProcessed}
        className={className}
      />
    );
  }

  return (
    <FullIndicator
      status={status}
      progress={progress}
      error={error}
      groupsSynced={groupsSynced}
      messagesProcessed={messagesProcessed}
      className={className}
    />
  );
}

// ============================================================================
// Compact Indicator (for header/inline use)
// ============================================================================

function CompactIndicator({
  status,
  progress,
  error,
  groupsSynced,
  messagesProcessed,
  className,
}: SyncProgressIndicatorProps) {
  if (status === 'syncing') {
    const phase = progress?.phase ?? 'groups';
    const current = progress?.current ?? 0;

    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400',
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>
          {phase === 'groups'
            ? `Syncing groups${current > 0 ? ` (${current})` : '...'}`
            : `Processing messages${current > 0 ? ` (${current})` : '...'}`}
        </span>
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div
        className={cn(
          'animate-in fade-in flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 duration-300 dark:text-emerald-400',
          className,
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>
          Synced {groupsSynced} groups
          {messagesProcessed > 0 && `, ${messagesProcessed} messages`}
        </span>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400',
          className,
        )}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{error ?? 'Sync failed'}</span>
      </div>
    );
  }

  return null;
}

// ============================================================================
// Full Indicator (for prominent display)
// ============================================================================

function FullIndicator({
  status,
  progress,
  error,
  groupsSynced,
  messagesProcessed,
  className,
}: SyncProgressIndicatorProps) {
  if (status === 'syncing') {
    const phase = progress?.phase ?? 'groups';
    const current = progress?.current ?? 0;
    const total = progress?.total;

    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/50',
          className,
        )}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-blue-400 opacity-25" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-blue-500">
              <RefreshCw className="h-5 w-5 animate-spin text-white" />
            </div>
          </div>
          <div>
            <p className="font-medium text-blue-700 dark:text-blue-300">
              {phase === 'groups'
                ? 'Syncing groups...'
                : 'Processing messages...'}
            </p>
            <p className="text-sm text-blue-600/70 dark:text-blue-400/70">
              {total
                ? `${current} of ${total}`
                : current > 0
                  ? `${current} processed`
                  : 'Please wait...'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {total && total > 0 && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${Math.min((current / total) * 100, 100)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  if (status === 'completed') {
    return (
      <div
        className={cn(
          'animate-in fade-in slide-in-from-top-2 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 duration-300 dark:border-emerald-800 dark:bg-emerald-950/50',
          className,
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500">
          <CheckCircle2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-medium text-emerald-700 dark:text-emerald-300">
            Sync completed
          </p>
          <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70">
            {groupsSynced} groups synced
            {messagesProcessed > 0 &&
              `, ${messagesProcessed} messages processed`}
          </p>
        </div>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/50',
          className,
        )}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500">
          <AlertCircle className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="font-medium text-red-700 dark:text-red-300">
            Sync failed
          </p>
          <p className="text-sm text-red-600/70 dark:text-red-400/70">
            {error ??
              'Unable to sync groups. The session may need to reconnect.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default SyncProgressIndicator;
