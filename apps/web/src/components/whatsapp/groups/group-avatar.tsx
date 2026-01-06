/**
 * GroupAvatar Component
 *
 * Displays a WhatsApp group avatar with fallback initials when no image is available.
 * Supports multiple size variants for different contexts.
 *
 * Requirements: 1.4
 */

import { cva, type VariantProps } from 'class-variance-authority';
import { Users } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { getInitials } from '@/utils/avatar';

const avatarSizeVariants = cva('', {
  variants: {
    size: {
      sm: 'size-8',
      md: 'size-10',
      lg: 'size-14',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const fallbackTextVariants = cva('font-medium', {
  variants: {
    size: {
      sm: 'text-xs',
      md: 'text-sm',
      lg: 'text-lg',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const iconVariants = cva('text-muted-foreground', {
  variants: {
    size: {
      sm: 'size-3',
      md: 'size-4',
      lg: 'size-6',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

export interface GroupAvatarProps
  extends VariantProps<typeof avatarSizeVariants> {
  /** Group name for generating fallback initials */
  name: string;
  /** Optional avatar image URL */
  avatarUrl?: string | null;
  /** Additional CSS classes */
  className?: string;
}

export function GroupAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: GroupAvatarProps) {
  const initials = getInitials(name);

  return (
    <Avatar className={cn(avatarSizeVariants({ size }), className)}>
      {avatarUrl && (
        <AvatarImage src={avatarUrl} alt={`${name} group avatar`} />
      )}
      <AvatarFallback className="bg-primary/10 text-primary">
        {initials ? (
          <span className={fallbackTextVariants({ size })}>{initials}</span>
        ) : (
          <Users className={iconVariants({ size })} />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
