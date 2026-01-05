import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const featureCardVariants = cva(
  'flex items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-muted/50',
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

const iconVariants = cva('rounded-md p-2', {
  variants: {
    color: {
      emerald: 'bg-emerald-500/10 text-emerald-500',
      teal: 'bg-teal-500/10 text-teal-500',
      cyan: 'bg-cyan-500/10 text-cyan-500',
      blue: 'bg-blue-500/10 text-blue-500',
      indigo: 'bg-indigo-500/10 text-indigo-500',
      violet: 'bg-violet-500/10 text-violet-500',
      amber: 'bg-amber-500/10 text-amber-500',
      red: 'bg-red-500/10 text-red-500',
    },
  },
  defaultVariants: {
    color: 'emerald',
  },
});

export interface FeatureCardProps
  extends VariantProps<typeof featureCardVariants>,
    VariantProps<typeof iconVariants> {
  icon: React.ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({
  icon,
  title,
  description,
  color,
  size,
  className,
}: FeatureCardProps) {
  return (
    <div className={cn(featureCardVariants({ size }), className)}>
      <div className={iconVariants({ color })}>{icon}</div>
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
    </div>
  );
}
