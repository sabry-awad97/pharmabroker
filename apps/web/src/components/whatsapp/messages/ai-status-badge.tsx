/**
 * AI Status Badge Component
 *
 * Displays the AI processing status with beautiful animations.
 */

import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  SkipForward,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type AIStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'skipped';

interface AIStatusConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  animate?: boolean;
}

const aiStatusConfig: Record<AIStatus, AIStatusConfig> = {
  pending: {
    icon: Clock,
    label: 'Pending',
    description: 'Waiting for AI processing',
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    description: 'AI is analyzing this message',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    description: 'AI processing completed successfully',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    description: 'AI processing failed',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  skipped: {
    icon: SkipForward,
    label: 'Skipped',
    description: 'Message skipped (media-only or system message)',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
};

interface AIStatusBadgeProps {
  status: AIStatus;
  showLabel?: boolean;
  error?: string | null;
  model?: string | null;
  className?: string;
}

export function AIStatusBadge({
  status,
  showLabel = false,
  error,
  model,
  className,
}: AIStatusBadgeProps) {
  const config = aiStatusConfig[status] || aiStatusConfig.pending;
  const Icon = config.icon;

  const tooltipContent = (
    <div className="space-y-1">
      <p className="font-medium">{config.description}</p>
      {model && <p className="text-muted-foreground text-xs">Model: {model}</p>}
      {error && <p className="text-xs text-red-400">Error: {error}</p>}
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className={cn(config.bgColor, config.color, 'gap-1', className)}
        >
          <Icon className={cn('h-3 w-3', config.animate && 'animate-spin')} />
          {showLabel && <span>{config.label}</span>}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
