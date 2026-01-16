/**
 * Message Type Badge Component
 *
 * Displays a beautiful badge for different message types.
 */

import {
  FileText,
  Image,
  Video,
  Mic,
  File,
  Sticker,
  MapPin,
  Contact,
  BarChart3,
  Heart,
  Settings,
  HelpCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'poll'
  | 'reaction'
  | 'protocol'
  | 'unknown';

interface MessageTypeConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
}

const messageTypeConfig: Record<MessageType, MessageTypeConfig> = {
  text: {
    icon: FileText,
    label: 'Text',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  image: {
    icon: Image,
    label: 'Image',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
  video: {
    icon: Video,
    label: 'Video',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
  },
  audio: {
    icon: Mic,
    label: 'Audio',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
  },
  document: {
    icon: File,
    label: 'Document',
    color: 'text-slate-600',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
  },
  sticker: {
    icon: Sticker,
    label: 'Sticker',
    color: 'text-pink-600',
    bgColor: 'bg-pink-500/10 border-pink-500/20',
  },
  contact: {
    icon: Contact,
    label: 'Contact',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
  },
  location: {
    icon: MapPin,
    label: 'Location',
    color: 'text-red-600',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  poll: {
    icon: BarChart3,
    label: 'Poll',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-500/10 border-indigo-500/20',
  },
  reaction: {
    icon: Heart,
    label: 'Reaction',
    color: 'text-rose-600',
    bgColor: 'bg-rose-500/10 border-rose-500/20',
  },
  protocol: {
    icon: Settings,
    label: 'System',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
  unknown: {
    icon: HelpCircle,
    label: 'Unknown',
    color: 'text-gray-600',
    bgColor: 'bg-gray-500/10 border-gray-500/20',
  },
};

interface MessageTypeBadgeProps {
  type: MessageType;
  showLabel?: boolean;
  className?: string;
}

export function MessageTypeBadge({
  type,
  showLabel = true,
  className,
}: MessageTypeBadgeProps) {
  const config = messageTypeConfig[type] || messageTypeConfig.unknown;
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="secondary"
      className={cn(config.bgColor, config.color, 'gap-1', className)}
    >
      <Icon className="h-3 w-3" />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );

  if (!showLabel) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>{config.label}</TooltipContent>
      </Tooltip>
    );
  }

  return badge;
}
