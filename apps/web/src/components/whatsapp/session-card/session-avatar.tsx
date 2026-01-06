import { cva } from 'class-variance-authority';
import { Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SessionStatus } from './session-status-badge';

const avatarVariants = cva(
  'flex items-center justify-center rounded-full transition-all duration-300',
  {
    variants: {
      status: {
        connected: 'bg-emerald-500/10',
        connecting: 'bg-blue-500/10',
        pending: 'bg-amber-500/10',
        disconnected: 'bg-muted',
        logged_out: 'bg-orange-500/10',
        expired: 'bg-red-500/10',
      },
      size: {
        sm: 'h-10 w-10',
        md: 'h-12 w-12',
        lg: 'h-14 w-14',
      },
    },
    defaultVariants: {
      status: 'disconnected',
      size: 'md',
    },
  },
);

const iconVariants = cva('transition-colors', {
  variants: {
    status: {
      connected: 'text-emerald-500',
      connecting: 'text-blue-500',
      pending: 'text-amber-500',
      disconnected: 'text-muted-foreground',
      logged_out: 'text-orange-500',
      expired: 'text-red-500',
    },
    size: {
      sm: 'h-5 w-5',
      md: 'h-6 w-6',
      lg: 'h-7 w-7',
    },
  },
  defaultVariants: {
    status: 'disconnected',
    size: 'md',
  },
});

const pulseVariants = cva('', {
  variants: {
    status: {
      connected: 'bg-emerald-500',
      connecting: 'bg-blue-500',
      pending: 'bg-amber-500',
      disconnected: 'bg-muted-foreground',
      logged_out: 'bg-orange-500',
      expired: 'bg-red-500',
    },
  },
  defaultVariants: {
    status: 'disconnected',
  },
});

interface SessionAvatarProps {
  status: SessionStatus;
  size?: 'sm' | 'md' | 'lg';
  showPulse?: boolean;
}

export function SessionAvatar({
  status,
  size = 'md',
  showPulse = true,
}: SessionAvatarProps) {
  const isConnected = status === 'connected';

  return (
    <div className="relative">
      <div className={avatarVariants({ status, size })}>
        <Smartphone className={iconVariants({ status, size })} />
      </div>
      {showPulse && isConnected && (
        <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4">
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
              pulseVariants({ status }),
            )}
          />
          <span
            className={cn(
              'border-background relative inline-flex h-4 w-4 rounded-full border-2',
              pulseVariants({ status }),
            )}
          />
        </span>
      )}
    </div>
  );
}
