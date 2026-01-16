/**
 * Add Session Card
 *
 * Card for creating a new WhatsApp session from the picker.
 */

import { motion } from 'motion/react';
import { Plus, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';

interface AddSessionCardProps {
  onClick: () => void;
  index: number;
}

export function AddSessionCard({ onClick, index }: AddSessionCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: index * 0.1,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col items-center justify-center rounded-2xl p-6',
        'border-border/50 border-2 border-dashed hover:border-emerald-500/50',
        'from-card/50 bg-linear-to-b to-transparent',
        'transition-all duration-300',
        'min-h-[180px]',
      )}
    >
      {/* Animated plus icon */}
      <motion.div
        className={cn(
          'mb-4 flex h-16 w-16 items-center justify-center rounded-full',
          'bg-linear-to-br from-emerald-500/10 to-teal-500/10',
          'border border-emerald-500/20',
          'transition-all duration-300 group-hover:border-emerald-500/40',
          'group-hover:from-emerald-500/20 group-hover:to-teal-500/20',
        )}
        whileHover={{ rotate: 90 }}
        transition={{ duration: 0.3 }}
      >
        <Plus className="h-7 w-7 text-emerald-500 transition-transform duration-300" />
      </motion.div>

      {/* Label */}
      <h3 className="text-muted-foreground group-hover:text-foreground mb-1 text-sm font-semibold transition-colors">
        Add Session
      </h3>

      {/* Subtitle */}
      <p className="text-muted-foreground/70 flex items-center gap-1 text-xs">
        <Sparkles className="h-3 w-3" />
        Connect new device
      </p>

      {/* Hover gradient */}
      <div className="absolute inset-0 rounded-2xl bg-linear-to-t from-emerald-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </motion.button>
  );
}
