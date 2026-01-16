/**
 * Session Picker Route
 *
 * Full-page session selection screen, similar to Chrome's profile picker.
 * Users must select a session before accessing the main app.
 */

import type { Session } from '@pharmabroker/schemas/whatsapp';

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

import { SessionPicker } from '@/components/session-picker';
import { WhatsappNewSessionDialog } from '@/components/whatsapp';
import { authClient } from '@/lib/auth-client';
import { useActiveSession } from '@/stores/active-session.store';

export const Route = createFileRoute('/sessions/pick')({
  component: SessionPickerPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function SessionPickerPage() {
  const navigate = useNavigate();
  const activeSession = useActiveSession();
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);

  const handleSessionSelect = (_session: Session) => {
    // Navigate to groups page after selection
    navigate({ to: '/whatsapp/groups' });
  };

  const handleCreateSession = () => {
    setShowNewSessionDialog(true);
  };

  // If already has active session, redirect to groups
  if (activeSession) {
    navigate({ to: '/whatsapp/groups' });
    return null;
  }

  return (
    <>
      <SessionPicker
        onSessionSelect={handleSessionSelect}
        onCreateSession={handleCreateSession}
      />

      {/* New Session Dialog */}
      {showNewSessionDialog && (
        <NewSessionDialogWrapper
          open={showNewSessionDialog}
          onOpenChange={setShowNewSessionDialog}
        />
      )}
    </>
  );
}

// Wrapper to handle the dialog trigger pattern
function NewSessionDialogWrapper({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!open) return null;

  return (
    <WhatsappNewSessionDialog defaultOpen onOpenChange={onOpenChange}>
      {/* Hidden trigger - dialog opens via defaultOpen */}
      <span className="hidden" />
    </WhatsappNewSessionDialog>
  );
}
