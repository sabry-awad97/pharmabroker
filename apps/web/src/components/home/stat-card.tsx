import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const statCardVariants = cva(
  'flex items-center gap-3 rounded-md border border-border bg-card',
  {
    variants: {
      size: {
        default: 'p-3',
        sm: 'p-2 gap-2',
        lg: 'p-4 gap-4',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const valueVariants = cva('font-bold', {
  variants: {
    color: {
      emerald: 'text-emerald-500',
      teal: 'text-teal-500',
      cyan: 'text-cyan-500',
      blue: 'text-blue-500',
      indigo: 'text-indigo-500',
      violet: 'text-violet-500',
      amber: 'text-amber-500',
      red: 'text-red-500',
      muted: 'text-foreground',
    },
    size: {
      default: 'text-lg',
      sm: 'text-base',
      lg: 'text-xl',
    },
  },
  defaultVariants: {
    color: 'emerald',
    size: 'default',
  },
});

export interface StatCardProps
  extends VariantProps<typeof statCardVariants>,
    VariantProps<typeof valueVariants> {
  icon: React.ReactNode;
  value: string;
  label: string;
  className?: string;
}

export function StatCard({
  icon,
  value,
  label,
  color,
  size,
  className,
}: StatCardProps) {
  return (
    <div className={cn(statCardVariants({ size }), className)}>
      <div className="text-muted-foreground">{icon}</div>
      <div>
        <div className={valueVariants({ color, size })}>{value}</div>
        <div className="text-muted-foreground text-xs">{label}</div>
      </div>
    </div>
  );
}
