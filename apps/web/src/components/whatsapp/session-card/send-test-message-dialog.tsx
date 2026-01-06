import { useState } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  XCircle,
  CheckCircle2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useSendWhatsappMessage } from '@/hooks/whatsapp';

type SendState = 'idle' | 'sending' | 'success' | 'error';

interface StateDisplayProps {
  state: SendState;
  onRetry: () => void;
  onClose: () => void;
}

function StateDisplay({ state, onRetry, onClose }: StateDisplayProps) {
  if (state === 'sending') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
          <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
        </div>
        <div className="text-center">
          <p className="font-semibold">Sending message...</p>
          <p className="text-muted-foreground text-sm">
            Please wait while we deliver your message
          </p>
        </div>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-emerald-600">Message sent!</p>
          <p className="text-muted-foreground text-sm">
            Your test message was delivered successfully
          </p>
        </div>
        <Button variant="outline" onClick={onClose} className="mt-2">
          Close
        </Button>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
          <XCircle className="h-8 w-8 text-red-500" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-red-600">Failed to send</p>
          <p className="text-muted-foreground text-sm">
            Something went wrong. Please try again.
          </p>
        </div>
        <Button variant="outline" onClick={onRetry} className="mt-2">
          Try Again
        </Button>
      </div>
    );
  }

  return null;
}

interface SendTestMessageDialogProps {
  sessionId: string;
  defaultPhone?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTestMessageDialog({
  sessionId,
  defaultPhone = '',
  open,
  onOpenChange,
}: SendTestMessageDialogProps) {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(
    'Hello! This is a test message from PharmaBroker. 🚀',
  );
  const [sendState, setSendState] = useState<SendState>('idle');

  const sendMessage = useSendWhatsappMessage();

  const handleSend = () => {
    if (!phone || !message) return;

    const formattedPhone = phone.startsWith('+')
      ? phone
      : `+${phone.replace(/\D/g, '')}`;

    setSendState('sending');
    sendMessage.mutate(
      {
        session_id:
          sessionId as unknown as import('@pharmabroker/schemas/whatsapp').SessionID,
        to: formattedPhone as unknown as import('@pharmabroker/schemas/whatsapp').E164Phone,
        type: 'text',
        content: { text: message },
      },
      {
        onSuccess: () => setSendState('success'),
        onError: () => setSendState('error'),
      },
    );
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => setSendState('idle'), 200);
  };

  const handleRetry = () => setSendState('idle');

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && sendState === 'sending') return;
    if (!newOpen) {
      handleClose();
    } else {
      setPhone(defaultPhone);
      setSendState('idle');
      onOpenChange(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <MessageSquare className="h-4 w-4 text-blue-500" />
            </div>
            Send Test Message
          </DialogTitle>
          <DialogDescription>
            Verify your WhatsApp connection by sending a test message.
          </DialogDescription>
        </DialogHeader>

        {sendState !== 'idle' ? (
          <StateDisplay
            state={sendState}
            onRetry={handleRetry}
            onClose={handleClose}
          />
        ) : (
          <>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  placeholder="+1234567890"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="font-mono"
                />
                <p className="text-muted-foreground text-xs">
                  Include country code (e.g., +1 for US, +44 for UK)
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="message" className="text-sm font-medium">
                  Message
                </Label>
                <Textarea
                  id="message"
                  placeholder="Type your message..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleSend}
                disabled={!phone || !message}
                className="gap-2"
              >
                <Send className="h-4 w-4" />
                Send Message
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
