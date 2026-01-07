import { Settings, Zap } from 'lucide-react';
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
import { useUpdateWhatsappSession } from '@/hooks/whatsapp';

interface SessionSettingsDialogProps {
  session: {
    id: string;
    name: string;
    auto_connect: boolean;
  };
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
