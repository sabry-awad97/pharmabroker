import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const loaderVariants = cva('animate-spin', {
  variants: {
    size: {
      default: 'h-6 w-6',
      sm: 'h-4 w-4',
      lg: 'h-8 w-8',
    },
  },
  defaultVariants: {
    size: 'default',
  },
});

export interface LoaderProps extends VariantProps<typeof loaderVariants> {
  className?: string;
}

export function Loader({ size, className }: LoaderProps) {
  return <Loader2 className={cn(loaderVariants({ size }), className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center pt-8">
      <Loader />
    </div>
  );
}
