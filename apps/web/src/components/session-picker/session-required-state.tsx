/**
 * Session Required State
 *
 * Displayed when a page requires an active session but none is selected.
 * Prompts user to select a session from the picker.
 */

import { motion } from 'motion/react';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';

export function SessionRequiredState() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md text-center"
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500/20 to-teal-500/20 ring-1 ring-emerald-500/30"
        >
          <MessageSquare className="h-8 w-8 text-emerald-500" />
        </motion.div>

        {/* Title */}
        <h2 className="text-foreground mb-2 text-xl font-semibold">
          No Session Selected
        </h2>

        {/* Description */}
        <p className="text-muted-foreground mb-6 text-sm">
          Select a WhatsApp session to view and manage your groups. Each session
          has its own set of groups and contacts.
        </p>

        {/* Action */}
        <Button
          onClick={() => navigate({ to: '/sessions/pick' })}
          className="bg-linear-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Choose Session
        </Button>
      </motion.div>
    </div>
  );
}
