import { useEffect } from 'react';
import {
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  Timer,
  XCircle,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWhatsappQRStream } from '@/hooks/whatsapp';

interface WhatsappQRDialogProps {
  sessionId: string;
  sessionName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsappQRDialog({
  sessionId,
  sessionName,
  open,
  onOpenChange,
}: WhatsappQRDialogProps) {
  const { status, qrCode, error, startStream, stopStream, retry, isStreaming } =
    useWhatsappQRStream(sessionId);

  // Start streaming when dialog opens
  useEffect(() => {
    if (open && status === 'idle') {
      startStream();
    }
    return () => {
      if (!open) {
        stopStream();
      }
    };
  }, [open, status, startStream, stopStream]);

  // Close dialog on successful authentication
  useEffect(() => {
    if (status === 'authenticated') {
      const timer = setTimeout(() => onOpenChange(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Authenticate {sessionName}
          </DialogTitle>
          <DialogDescription>
            Scan this QR code with WhatsApp on your phone to connect
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-4">
          {/* QR Code Display */}
          <div
            className={cn(
              'relative flex h-64 w-64 items-center justify-center rounded-lg border-2 border-dashed transition-colors',
              status === 'authenticated' &&
                'border-emerald-500 bg-emerald-500/5',
              status === 'error' && 'border-red-500 bg-red-500/5',
              status === 'timeout' && 'border-amber-500 bg-amber-500/5',
              (status === 'streaming' || status === 'connecting') &&
                'border-border bg-muted/50',
            )}
          >
            {status === 'connecting' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                <span className="text-muted-foreground text-sm">
                  Connecting...
                </span>
              </div>
            )}

            {status === 'streaming' && qrCode && (
              <img
                src={`data:image/png;base64,${qrCode}`}
                alt="WhatsApp QR Code"
                className="h-full w-full rounded-md p-2"
              />
            )}

            {status === 'streaming' && !qrCode && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
                <span className="text-muted-foreground text-sm">
                  Waiting for QR...
                </span>
              </div>
            )}

            {status === 'authenticated' && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                </div>
                <span className="font-medium text-emerald-500">Connected!</span>
              </div>
            )}

            {status === 'timeout' && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
                  <Timer className="h-10 w-10 text-amber-500" />
                </div>
                <span className="font-medium text-amber-500">QR Expired</span>
                <Button variant="outline" size="sm" onClick={retry}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Generate New QR
                </Button>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-10 w-10 text-red-500" />
                </div>
                <span className="font-medium text-red-500">
                  Connection Failed
                </span>
                <p className="text-muted-foreground max-w-[200px] text-center text-xs">
                  {error?.message || 'Unable to generate QR code'}
                </p>
                <Button variant="outline" size="sm" onClick={retry}>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Try Again
                </Button>
              </div>
            )}

            {status === 'idle' && (
              <div className="flex flex-col items-center gap-3">
                <QrCode className="text-muted-foreground h-12 w-12" />
                <Button variant="outline" size="sm" onClick={startStream}>
                  Generate QR Code
                </Button>
              </div>
            )}
          </div>

          {/* Instructions */}
          {(status === 'streaming' || status === 'connecting') && (
            <div className="mt-4 space-y-2 text-center">
              <p className="text-muted-foreground text-xs">
                1. Open WhatsApp on your phone
              </p>
              <p className="text-muted-foreground text-xs">
                2. Go to Settings → Linked Devices
              </p>
              <p className="text-muted-foreground text-xs">
                3. Tap "Link a Device" and scan this code
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
