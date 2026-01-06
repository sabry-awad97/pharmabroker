import { QrCode, Wifi, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { SessionStatus } from './session-status-badge';

interface SessionStatusIndicatorProps {
  status: SessionStatus;
  hasJid: boolean;
  isReconnecting: boolean;
  onScanQR: () => void;
  onConnect: () => void;
}

export function SessionStatusIndicator({
  status,
  hasJid,
  isReconnecting,
  onScanQR,
  onConnect,
}: SessionStatusIndicatorProps) {
  const needsAuth = status === 'pending' || status === 'logged_out';
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const canReconnect = status === 'disconnected' && hasJid;

  if (needsAuth) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-dashed"
        onClick={onScanQR}
      >
        <QrCode className="h-4 w-4" />
        Authenticate with QR
      </Button>
    );
  }

  if (canReconnect) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={onConnect}
        disabled={isReconnecting}
      >
        {isReconnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wifi className="h-4 w-4" />
        )}
        {isReconnecting ? 'Connecting...' : 'Reconnect'}
      </Button>
    );
  }

  if (status === 'disconnected' && !hasJid) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 border-dashed"
        onClick={onScanQR}
      >
        <QrCode className="h-4 w-4" />
        Setup with QR Code
      </Button>
    );
  }

  if (isConnecting) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-blue-500/10 bg-blue-500/5 px-3 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        <span className="text-xs font-medium text-blue-600">Connecting...</span>
      </div>
    );
  }

  if (isConnected) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <div className="flex cursor-default items-center gap-2 rounded-md border border-emerald-500/10 bg-emerald-500/5 px-3 py-2">
            <Radio className="h-4 w-4 animate-pulse text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Active</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Session is connected and listening for messages</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
