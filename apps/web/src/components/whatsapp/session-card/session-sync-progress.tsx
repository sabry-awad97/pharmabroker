import { CheckCircle2, XCircle, Info, Loader2, Ban } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import type { HistorySyncStatus } from '@pharmabroker/schemas/whatsapp';

interface SessionSyncProgressProps {
  status: HistorySyncStatus;
  progress: number;
  total?: number;
  onCancel?: () => void;
  className?: string;
}

export function SessionSyncProgress({
  status,
  progress,
  total,
  onCancel,
  className,
}: SessionSyncProgressProps) {
  if (status === 'not_started') {
    return null;
  }

  if (status === 'in_progress') {
    const percentage = total ? Math.round((progress / total) * 100) : 0;

    return (
      <Alert className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <AlertDescription>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Syncing history...</span>
              <span className="text-muted-foreground text-xs">
                {total
                  ? `${progress.toLocaleString()} / ${total.toLocaleString()}`
                  : `${progress.toLocaleString()} messages`}
              </span>
            </div>
            {total && <Progress value={percentage} className="h-2" />}
            {onCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="mt-2"
              >
                Cancel Sync
              </Button>
            )}
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'completed') {
    return (
      <Alert className={className}>
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <AlertDescription>
          Sync completed successfully. {progress.toLocaleString()} messages
          synced.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'skipped') {
    return (
      <Alert className={className}>
        <Info className="h-4 w-4" />
        <AlertDescription>
          History sync was skipped. Only new messages will be received.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'failed') {
    return (
      <Alert className={className} variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          Sync failed. Please try reconnecting the session.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === 'cancelled') {
    return (
      <Alert className={className}>
        <Ban className="h-4 w-4" />
        <AlertDescription>
          Sync was cancelled. You can sync history later from settings.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
