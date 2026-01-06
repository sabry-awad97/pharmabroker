/**
 * Sync Groups Dialog Component
 *
 * Displays sync progress and results for WhatsApp groups.
 * Handles success and error states with appropriate feedback.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface SyncResult {
  synced: number;
  errors: string[];
}

export interface SyncGroupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SyncStatus;
  result?: SyncResult;
  error?: Error | null;
  onRetry?: () => void;
  sessionName?: string;
}

/**
 * Dialog component for displaying group sync progress and results
 */
export function SyncGroupsDialog({
  open,
  onOpenChange,
  status,
  result,
  error,
  onRetry,
  sessionName,
}: SyncGroupsDialogProps) {
  const title = sessionName ? `Sync Groups - ${sessionName}` : 'Sync Groups';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {status === 'idle' && 'Ready to sync groups from WhatsApp'}
            {status === 'syncing' && 'Syncing groups from WhatsApp...'}
            {status === 'success' && 'Sync completed successfully'}
            {status === 'error' && 'Sync failed'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          <SyncStatusDisplay status={status} result={result} error={error} />
        </div>

        <DialogFooter>
          {status === 'error' && onRetry && (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              Try Again
            </Button>
          )}
          <Button
            variant={status === 'error' ? 'ghost' : 'default'}
            onClick={() => onOpenChange(false)}
            disabled={status === 'syncing'}
          >
            {status === 'success' ? 'Done' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Internal component for displaying sync status
 */
function SyncStatusDisplay({
  status,
  result,
  error,
}: {
  status: SyncStatus;
  result?: SyncResult;
  error?: Error | null;
}) {
  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="bg-muted flex h-16 w-16 items-center justify-center rounded-full">
          <RefreshCw className="text-muted-foreground h-8 w-8" />
        </div>
        <p className="text-muted-foreground text-sm">
          Click sync to fetch the latest groups
        </p>
      </div>
    );
  }

  if (status === 'syncing') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
          <Loader2 className="text-primary h-8 w-8 animate-spin" />
        </div>
        <p className="text-muted-foreground text-sm">
          Fetching groups from WhatsApp...
        </p>
        <p className="text-muted-foreground text-xs">This may take a moment</p>
      </div>
    );
  }

  if (status === 'success' && result) {
    const hasErrors = result.errors.length > 0;

    return (
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn(
            'flex h-16 w-16 items-center justify-center rounded-full',
            hasErrors ? 'bg-amber-500/20' : 'bg-emerald-500/20',
          )}
        >
          <CheckCircle2
            className={cn(
              'h-10 w-10',
              hasErrors ? 'text-amber-500' : 'text-emerald-500',
            )}
          />
        </div>
        <div className="text-center">
          <p
            className={cn(
              'font-medium',
              hasErrors ? 'text-amber-500' : 'text-emerald-500',
            )}
          >
            {hasErrors ? 'Sync completed with warnings' : 'Sync completed'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {result.synced} {result.synced === 1 ? 'group' : 'groups'} synced
          </p>
        </div>
        {hasErrors && (
          <div className="bg-muted mt-2 max-h-24 w-full overflow-y-auto rounded-md p-2">
            <p className="text-muted-foreground mb-1 text-xs font-medium">
              Warnings:
            </p>
            {result.errors.map((err, i) => (
              <p key={i} className="text-muted-foreground text-xs">
                • {err}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-medium text-red-500">Sync failed</p>
          <p className="text-muted-foreground mt-1 max-w-[250px] text-sm">
            {error?.message || 'Unable to sync groups. Please try again.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default SyncGroupsDialog;
