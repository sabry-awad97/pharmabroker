import { cva, type VariantProps } from 'class-variance-authority';
import {
  Wifi,
  WifiOff,
  Clock,
  AlertCircle,
  Loader2,
  LogOut,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SessionStatus =
  | 'connected'
  | 'connecting'
  | 'pending'
  | 'disconnected'
  | 'logged_out'
  | 'expired';

const statusConfig: Record<
  SessionStatus,
  {
    label: string;
    description: string;
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
    icon: typeof Wifi;
    animate?: boolean;
  }
> = {
  connected: {
    label: 'Connected',
    description: 'Session is active and ready',
    variant: 'default',
    icon: Wifi,
  },
  connecting: {
    label: 'Connecting',
    description: 'Establishing connection...',
    variant: 'secondary',
    icon: Loader2,
    animate: true,
  },
  pending: {
    label: 'Pending',
    description: 'Waiting for QR authentication',
    variant: 'secondary',
    icon: Clock,
  },
  disconnected: {
    label: 'Disconnected',
    description: 'Session is offline',
    variant: 'outline',
    icon: WifiOff,
  },
  logged_out: {
    label: 'Logged Out',
    description: 'Session was logged out from device',
    variant: 'outline',
    icon: LogOut,
  },
  expired: {
    label: 'Expired',
    description: 'Session has expired',
    variant: 'destructive',
    icon: AlertCircle,
  },
};

const badgeVariants = cva('gap-1.5 rounded-full px-2.5 py-1 transition-all', {
  variants: {
    status: {
      connected:
        'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20',
      connecting: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
      pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
      disconnected: 'bg-muted text-muted-foreground',
      logged_out: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
      expired: 'bg-red-500/10 text-red-600 border-red-500/20',
    },
  },
  defaultVariants: {
    status: 'disconnected',
  },
});

interface SessionStatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: SessionStatus;
  showLabel?: boolean;
}

export function SessionStatusBadge({
  status,
  showLabel = true,
}: SessionStatusBadgeProps) {
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={badgeVariants({ status })}>
          <StatusIcon
            className={`h-3 w-3 ${config.animate ? 'animate-spin' : ''}`}
          />
          {showLabel && (
            <span className="hidden sm:inline">{config.label}</span>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">{config.label}</p>
        <p className="text-muted-foreground text-xs">{config.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export { statusConfig };
