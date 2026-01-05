import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const statCardVariants = cva('rounded-md border border-border bg-card', {
  variants: {
    size: {
      default: 'p-3',
      sm: 'p-2',
      lg: 'p-4',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

const changeVariants = cva('text-xs', {
  variants: {
    trend: {
      positive: 'text-emerald-500',
      negative: 'text-red-500',
      neutral: 'text-muted-foreground',
    },
  },
  defaultVariants: {
    trend: 'neutral',
  },
});

export interface DashboardStatCardProps
  extends VariantProps<typeof statCardVariants> {
  icon: React.ReactNode;
  label: string;
  value: string;
  change?: string;
  trend?: 'positive' | 'negative' | 'neutral';
  className?: string;
}

export function DashboardStatCard({
  icon,
  label,
  value,
  change,
  trend = 'neutral',
  size,
  className,
}: DashboardStatCardProps) {
  return (
    <div className={cn(statCardVariants({ size }), className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-muted-foreground text-xs">{label}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {change && <div className={changeVariants({ trend })}>{change}</div>}
    </div>
  );
}
