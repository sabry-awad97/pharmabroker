import { useState } from 'react';
import { Plus, History } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateWhatsappSession } from '@/hooks/whatsapp';

interface WhatsappNewSessionDialogProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function WhatsappNewSessionDialog({
  children,
  defaultOpen = false,
  onOpenChange,
}: WhatsappNewSessionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = internalOpen;

  const handleOpenChange = (newOpen: boolean) => {
    setInternalOpen(newOpen);
    onOpenChange?.(newOpen);
  };
  const [name, setName] = useState('');
  const [enableHistorySync, setEnableHistorySync] = useState(false);
  const createSession = useCreateWhatsappSession();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createSession.mutate(
      {
        name: name.trim(),
        enable_history_sync: enableHistorySync,
      },
      {
        onSuccess: () => {
          handleOpenChange(false);
          setName('');
          setEnableHistorySync(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none">
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create WhatsApp Session</DialogTitle>
            <DialogDescription>
              Create a new session to connect a WhatsApp account
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="session-name" className="mb-2 block">
              Session Name
            </Label>
            <Input
              id="session-name"
              placeholder="e.g., Main Business Line"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={100}
              autoFocus
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              Give your session a memorable name to identify it later
            </p>
          </div>

          <div className="border-t pt-4">
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
                checked={enableHistorySync}
                onCheckedChange={setEnableHistorySync}
              />
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              This may take several minutes for large histories (40,000+
              messages). You can always sync history later from settings.
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={!name.trim() || createSession.isPending}
            >
              {createSession.isPending ? (
                'Creating...'
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Session
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
