import type { Session } from '@/hooks/whatsapp';

import { cva } from 'class-variance-authority';
import { Zap } from 'lucide-react';

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatRelativeTime, extractPhoneNumber } from '@/lib/utils';
import {
  useReconnectWhatsappSession,
  useDisconnectWhatsappSession,
} from '@/hooks/whatsapp';
import { useDialogActions } from '@/stores/whatsapp-session.store';

import { SessionAvatar } from './session-avatar';
import { SessionStatusBadge, type SessionStatus } from './session-status-badge';
import { SessionActionsMenu } from './session-actions-menu';
import { SessionStatusIndicator } from './session-status-indicator';

const cardVariants = cva(
  'group relative border-l-4 transition-all duration-200 hover:shadow-md hover:shadow-black/5',
  {
    variants: {
      status: {
        connected: 'border-l-emerald-500',
        connecting: 'border-l-blue-500',
        pending: 'border-l-amber-500',
        disconnected: 'border-l-muted-foreground/50',
        logged_out: 'border-l-orange-500',
        expired: 'border-l-red-500',
      },
    },
    defaultVariants: {
      status: 'disconnected',
    },
  },
);

interface WhatsappSessionCardProps {
  session: Session;
}

export function WhatsappSessionCard({ session }: WhatsappSessionCardProps) {
  const {
    openQRDialog,
    openDeleteDialog,
    openTestMessageDialog,
    openSettingsDialog,
  } = useDialogActions();

  const reconnectSession = useReconnectWhatsappSession();
  const disconnectSession = useDisconnectWhatsappSession();

  const status = (session.status as SessionStatus) || 'disconnected';
  const hasJid = Boolean(session.jid);
  const isLoading = reconnectSession.isPending || disconnectSession.isPending;

  const sessionData = {
    id: session.id,
    name: session.name,
    jid: session.jid,
    auto_connect: session.auto_connect,
  };

  const handleReconnect = () => {
    reconnectSession.mutate({ id: session.id });
  };

  const handleDisconnect = () => {
    disconnectSession.mutate({ id: session.id });
  };

  return (
    <Card className={cardVariants({ status })}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <SessionAvatar status={status} />
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{session.name}</CardTitle>
            {session.jid && (
              <p className="text-muted-foreground mt-0.5 text-sm font-medium tabular-nums">
                +{extractPhoneNumber(session.jid)}
              </p>
            )}
          </div>
        </div>

        <CardAction>
          <div className="flex items-center gap-2">
            {session.auto_connect && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/10">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>Auto-connect enabled</TooltipContent>
              </Tooltip>
            )}
            <SessionStatusBadge status={status} />
            <SessionActionsMenu
              status={status}
              hasJid={hasJid}
              isLoading={isLoading}
              isReconnecting={reconnectSession.isPending}
              isDisconnecting={disconnectSession.isPending}
              onScanQR={() => openQRDialog(sessionData)}
              onConnect={handleReconnect}
              onDisconnect={handleDisconnect}
              onSendTest={() => openTestMessageDialog(sessionData)}
              onSettings={() => openSettingsDialog(sessionData)}
              onDelete={() => openDeleteDialog(sessionData)}
            />
          </div>
        </CardAction>
      </CardHeader>

      <CardContent className="pb-3">
        <SessionStatusIndicator
          status={status}
          hasJid={hasJid}
          isReconnecting={reconnectSession.isPending}
          onScanQR={() => openQRDialog(sessionData)}
          onConnect={handleReconnect}
        />
      </CardContent>

      <CardFooter className="bg-muted/30 py-2.5">
        <div className="text-muted-foreground flex w-full items-center justify-between text-xs">
          <span>Created {formatRelativeTime(session.created_at)}</span>
          <span className="text-muted-foreground/60 font-mono">
            {session.id.slice(0, 8)}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}
