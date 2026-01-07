import {
  MoreVertical,
  QrCode,
  Trash2,
  Wifi,
  WifiOff,
  Loader2,
  MessageSquare,
  Settings,
} from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SessionStatus } from './session-status-badge';

interface MenuItemProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

function MenuItem({
  icon,
  iconBg,
  label,
  description,
  onClick,
  disabled,
  destructive,
}: MenuItemProps) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className={`gap-3 rounded-md px-3 py-2.5 ${destructive ? 'text-destructive focus:text-destructive' : ''}`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-md ${iconBg}`}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="font-medium">{label}</span>
        <span
          className={`text-[10px] ${destructive ? 'text-destructive/70' : 'text-muted-foreground'}`}
        >
          {description}
        </span>
      </div>
    </DropdownMenuItem>
  );
}

interface SessionActionsMenuProps {
  status: SessionStatus;
  hasJid: boolean;
  isLoading: boolean;
  isReconnecting: boolean;
  isDisconnecting: boolean;
  onScanQR: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSendTest: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function SessionActionsMenu({
  status,
  hasJid,
  isLoading,
  isReconnecting,
  isDisconnecting,
  onScanQR,
  onConnect,
  onDisconnect,
  onSendTest,
  onSettings,
  onDelete,
}: SessionActionsMenuProps) {
  const needsAuth = status === 'pending' || status === 'logged_out';
  const isConnected = status === 'connected';
  const canReconnect = status === 'disconnected' && hasJid;
  const canDisconnect = isConnected;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="hover:border-border hover:bg-accent flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-transparent opacity-0 transition-all group-hover:opacity-100 focus:opacity-100">
        <MoreVertical className="h-4 w-4" />
        <span className="sr-only">Open menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 rounded-lg p-1">
        {needsAuth && (
          <>
            <MenuItem
              icon={<QrCode className="text-primary h-4 w-4" />}
              iconBg="bg-primary/10"
              label="Scan QR Code"
              description="Authenticate session"
              onClick={onScanQR}
            />
            <DropdownMenuSeparator className="my-1" />
          </>
        )}

        {canReconnect && (
          <>
            <MenuItem
              icon={
                isReconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                ) : (
                  <Wifi className="h-4 w-4 text-emerald-500" />
                )
              }
              iconBg="bg-emerald-500/10"
              label="Connect"
              description="Reconnect to WhatsApp"
              onClick={onConnect}
              disabled={isLoading}
            />
            <DropdownMenuSeparator className="my-1" />
          </>
        )}

        {canDisconnect && (
          <>
            <MenuItem
              icon={
                isDisconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-orange-500" />
                )
              }
              iconBg="bg-orange-500/10"
              label="Disconnect"
              description="Keep credentials"
              onClick={onDisconnect}
              disabled={isLoading}
            />
            <MenuItem
              icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
              iconBg="bg-blue-500/10"
              label="Send Test Message"
              description="Verify connection"
              onClick={onSendTest}
            />
            <DropdownMenuSeparator className="my-1" />
          </>
        )}

        <MenuItem
          icon={<Settings className="text-muted-foreground h-4 w-4" />}
          iconBg="bg-muted"
          label="Settings"
          description="Configure session"
          onClick={onSettings}
        />

        <DropdownMenuSeparator className="my-1" />

        <MenuItem
          icon={<Trash2 className="h-4 w-4" />}
          iconBg="bg-destructive/10"
          label="Delete Session"
          description="Remove permanently"
          onClick={onDelete}
          destructive
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
