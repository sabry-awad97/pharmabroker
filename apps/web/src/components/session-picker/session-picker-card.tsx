/**
 * Session Picker Card
 *
 * Beautiful card component for selecting a WhatsApp session/profile.
 * Features gradient borders, status indicators, and smooth animations.
 */

import type { Session } from '@pharmabroker/schemas/whatsapp';

import { motion } from 'motion/react';
import { Check, MessageCircle, Smartphone, Wifi, WifiOff } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/utils/avatar';

interface SessionPickerCardProps {
  session: Session;
  isSelected?: boolean;
  onSelect: (session: Session) => void;
  index: number;
}

const statusConfig = {
  connected: {
    color: 'emerald',
    icon: Wifi,
    label: 'Connected',
    glow: 'shadow-emerald-500/20',
  },
  connecting: {
    color: 'amber',
    icon: Wifi,
    label: 'Connecting...',
    glow: 'shadow-amber-500/20',
  },
  disconnected: {
    color: 'slate',
    icon: WifiOff,
    label: 'Disconnected',
    glow: 'shadow-slate-500/10',
  },
  pending: {
    color: 'blue',
    icon: Smartphone,
    label: 'Pending Setup',
    glow: 'shadow-blue-500/20',
  },
  logged_out: {
    color: 'red',
    icon: WifiOff,
    label: 'Logged Out',
    glow: 'shadow-red-500/20',
  },
  expired: {
    color: 'orange',
    icon: WifiOff,
    label: 'Session Expired',
    glow: 'shadow-orange-500/20',
  },
} as const;

export function SessionPickerCard({
  session,
  isSelected,
  onSelect,
  index,
}: SessionPickerCardProps) {
  const config = statusConfig[session.status];
  const StatusIcon = config.icon;

  // Extract initials from session name
  const initials = session.name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <motion.button
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(session)}
      className={cn(
        'group relative flex w-full flex-col items-center rounded-2xl p-6 text-left transition-all duration-300',
        'from-card to-card/80 bg-linear-to-b',
        'border-border/50 hover:border-border border',
        'shadow-lg hover:shadow-xl',
        config.glow,
        isSelected &&
          'ring-offset-background ring-2 ring-emerald-500 ring-offset-2',
      )}
    >
      {/* Selection indicator */}
      {isSelected && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
        >
          <Check className="h-3.5 w-3.5" />
        </motion.div>
      )}

      {/* Avatar with status ring */}
      <div className="relative mb-4">
        <div
          className={cn(
            'absolute -inset-1 rounded-full opacity-60 blur-sm transition-opacity duration-300',
            session.status === 'connected' && 'bg-emerald-500/30',
            session.status === 'connecting' && 'animate-pulse bg-amber-500/30',
            session.status === 'pending' && 'bg-blue-500/30',
          )}
        />
        <Avatar className="ring-background relative h-16 w-16 ring-2">
          <AvatarImage
            src={getAvatarUrl(session.jid || session.name)}
            alt={session.name}
          />
          <AvatarFallback className="bg-linear-to-br from-emerald-500/20 to-teal-500/20 text-lg font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Status dot */}
        <div
          className={cn(
            'border-background absolute -right-0.5 -bottom-0.5 h-4 w-4 rounded-full border-2',
            session.status === 'connected' && 'bg-emerald-500',
            session.status === 'connecting' && 'animate-pulse bg-amber-500',
            session.status === 'disconnected' && 'bg-slate-400',
            session.status === 'pending' && 'bg-blue-500',
            session.status === 'logged_out' && 'bg-red-500',
            session.status === 'expired' && 'bg-orange-500',
          )}
        />
      </div>

      {/* Session name */}
      <h3 className="text-foreground mb-1 text-sm font-semibold transition-colors group-hover:text-emerald-500">
        {session.name}
      </h3>

      {/* Status badge */}
      <div
        className={cn(
          'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
          session.status === 'connected' &&
            'bg-emerald-500/10 text-emerald-500',
          session.status === 'connecting' && 'bg-amber-500/10 text-amber-500',
          session.status === 'disconnected' && 'bg-slate-500/10 text-slate-400',
          session.status === 'pending' && 'bg-blue-500/10 text-blue-500',
          session.status === 'logged_out' && 'bg-red-500/10 text-red-500',
          session.status === 'expired' && 'bg-orange-500/10 text-orange-500',
        )}
      >
        <StatusIcon className="h-3 w-3" />
        <span>{config.label}</span>
      </div>

      {/* Phone number if available */}
      {session.jid && (
        <p className="text-muted-foreground mt-2 text-xs">
          {session.jid.split('@')[0]}
        </p>
      )}

      {/* Hover gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-linear-to-t from-emerald-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </motion.button>
  );
}
