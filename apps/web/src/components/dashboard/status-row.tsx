import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const statusDotVariants = cva('h-1.5 w-1.5 rounded-full', {
  variants: {
    status: {
      online: 'bg-emerald-500',
      offline: 'bg-red-500',
      checking: 'bg-yellow-500 animate-pulse',
      warning: 'bg-amber-500',
    },
  },
  defaultVariants: {
    status: 'checking',
  },
});

const statusLabels: Record<string, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: '...',
  warning: 'Warning',
};

export interface StatusRowProps extends VariantProps<typeof statusDotVariants> {
  label: string;
  status: 'online' | 'offline' | 'checking' | 'warning';
  statusText?: string;
  className?: string;
}

export function StatusRow({
  label,
  status,
  statusText,
  className,
}: StatusRowProps) {
  return (
    <div className={cn('flex items-center justify-between text-xs', className)}>
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <div className={statusDotVariants({ status })} />
        <span>{statusText || statusLabels[status]}</span>
      </div>
    </div>
  );
}
