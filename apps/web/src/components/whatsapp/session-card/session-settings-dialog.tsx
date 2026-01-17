import { Settings, Zap, History, Info } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUpdateWhatsappSession } from '@/hooks/whatsapp';
import type { Session } from '@/hooks/whatsapp';

interface SessionSettingsDialogProps {
  session: Session;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SessionSettingsDialog({
  session,
  open,
  onOpenChange,
}: SessionSettingsDialogProps) {
  const updateSession = useUpdateWhatsappSession();

  const handleAutoConnectChange = (checked: boolean) => {
    updateSession.mutate(
      { id: session.id, auto_connect: checked },
      {
        onSuccess: () => {
          toast.success(
            checked ? 'Auto-connect enabled' : 'Auto-connect disabled',
          );
        },
        onError: error => {
          toast.error('Failed to update settings', {
            description: error.message,
          });
        },
      },
    );
  };

  const handleHistorySyncChange = (checked: boolean) => {
    updateSession.mutate(
      { id: session.id, enable_history_sync: checked },
      {
        onSuccess: () => {
          toast.success(
            checked ? 'History sync enabled' : 'History sync disabled',
          );
        },
        onError: error => {
          toast.error('Failed to update settings', {
            description: error.message,
          });
        },
      },
    );
  };

  const isFirstConnection = !session.first_connected_at;
  const canToggleHistorySync = isFirstConnection;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
              <Settings className="text-primary h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Session Settings</DialogTitle>
              <DialogDescription className="mt-1">
                Configure settings for "{session.name}"
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div>
                  <Label htmlFor="auto-connect" className="text-sm font-medium">
                    Auto-connect
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Automatically reconnect when service restarts
                  </p>
                </div>
              </div>
              <Switch
                id="auto-connect"
                checked={session.auto_connect}
                onCheckedChange={handleAutoConnectChange}
                disabled={updateSession.isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
                  <History className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <Label
                    htmlFor="enable-history-sync"
                    className="text-sm font-medium"
                  >
                    Enable History Sync
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Download message history on first connection
                  </p>
                </div>
              </div>
              <Switch
                id="enable-history-sync"
                checked={session.enable_history_sync}
                onCheckedChange={handleHistorySyncChange}
                disabled={updateSession.isPending || !canToggleHistorySync}
              />
            </div>

            {!canToggleHistorySync && (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  This session has already connected. Future reconnections will
                  automatically sync missed messages.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
