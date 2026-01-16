/**
 * Session Sync Indicator Component
 *
 * Displays sync progress within a session card.
 * Shows syncing groups, processing messages, and completion states.
 *
 * Feature: auto-sync-groups-messages
 */

import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Users,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SyncStatusState, SyncProgress } from '@/hooks/use-sync-status';

// ============================================================================
// Types
// ============================================================================

export interface SessionSyncIndicatorProps {
  status: SyncStatusState;
  progress: SyncProgress | null;
  error: string | null;
  groupsSynced: number;
  messagesProcessed: number;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function SessionSyncIndicator({
  status,
  progress,
  error,
  groupsSynced,
  messagesProcessed,
  className,
}: SessionSyncIndicatorProps) {
  if (status === 'idle') {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-md border p-3',
        status === 'syncing' && 'border-blue-500/30 bg-blue-500/5',
        status === 'completed' && 'border-emerald-500/30 bg-emerald-500/5',
        status === 'failed' && 'border-red-500/30 bg-red-500/5',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {/* Icon */}
        {status === 'syncing' && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        )}
        {status === 'completed' && (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        )}
        {status === 'failed' && (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}

        {/* Status Text */}
        <div className="min-w-0 flex-1">
          {status === 'syncing' && progress && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-blue-500">
                {progress.phase === 'groups'
                  ? 'Syncing groups'
                  : 'Processing messages'}
              </span>
              {progress.phase === 'groups' && (
                <Users className="h-3.5 w-3.5 text-blue-500/70" />
              )}
              {progress.phase === 'messages' && (
                <MessageCircle className="h-3.5 w-3.5 text-blue-500/70" />
              )}
            </div>
          )}

          {status === 'completed' && (
            <span className="text-sm font-medium text-emerald-500">
              Sync completed
            </span>
          )}

          {status === 'failed' && (
            <span className="text-sm font-medium text-red-500">
              Sync failed
            </span>
          )}
        </div>

        {/* Stats */}
        {(status === 'syncing' || status === 'completed') && (
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            {groupsSynced > 0 && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {groupsSynced}
              </span>
            )}
            {messagesProcessed > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {messagesProcessed}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress bar for syncing */}
      {status === 'syncing' && progress?.total && progress.total > 0 && (
        <div className="mt-2">
          <div className="h-1 w-full rounded-full bg-blue-500/20">
            <div
              className="h-1 rounded-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${Math.min((progress.current / progress.total) * 100, 100)}%`,
              }}
            />
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            {progress.current} / {progress.total}
          </div>
        </div>
      )}

      {/* Error message */}
      {status === 'failed' && error && (
        <p className="mt-1 truncate text-xs text-red-500/80">{error}</p>
      )}
    </div>
  );
}
