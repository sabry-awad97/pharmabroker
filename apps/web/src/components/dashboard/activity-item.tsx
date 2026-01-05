import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const activityItemVariants = cva(
  'flex items-center gap-3 transition-colors hover:bg-muted/50',
  {
    variants: {
      size: {
        default: 'px-4 py-2.5',
        sm: 'px-3 py-2',
        lg: 'px-5 py-3',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

const iconWrapperVariants = cva('rounded p-1.5', {
  variants: {
    variant: {
      default: 'bg-muted',
      emerald: 'bg-emerald-500/10',
      blue: 'bg-blue-500/10',
      violet: 'bg-violet-500/10',
      amber: 'bg-amber-500/10',
      red: 'bg-red-500/10',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
});

export interface ActivityItemProps
  extends VariantProps<typeof activityItemVariants>,
    VariantProps<typeof iconWrapperVariants> {
  icon: React.ReactNode;
  title: string;
  description: string;
  time: string;
  className?: string;
}

export function ActivityItem({
  icon,
  title,
  description,
  time,
  size,
  variant,
  className,
}: ActivityItemProps) {
  return (
    <div className={cn(activityItemVariants({ size }), className)}>
      <div className={iconWrapperVariants({ variant })}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground truncate text-xs">{description}</p>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">{time}</span>
    </div>
  );
}
