import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const actionButtonVariants = cva(
  'flex w-full items-center gap-2 rounded text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:h-3.5 [&_svg]:w-3.5',
  {
    variants: {
      size: {
        default: 'px-2 py-1.5',
        sm: 'px-1.5 py-1 text-xs',
        lg: 'px-3 py-2',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export interface ActionButtonProps
  extends VariantProps<typeof actionButtonVariants>,
    React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  label: string;
}

export function ActionButton({
  icon,
  label,
  size,
  className,
  ...props
}: ActionButtonProps) {
  return (
    <button className={cn(actionButtonVariants({ size }), className)} {...props}>
      {icon}
      {label}
    </button>
  );
}
