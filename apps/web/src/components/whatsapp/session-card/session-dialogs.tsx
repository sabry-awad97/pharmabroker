import {
  useActiveDialog,
  useSelectedSession,
  useDialogActions,
  useTestMessageForm,
} from '@/stores/whatsapp-session.store';
import { useDeleteWhatsappSession } from '@/hooks/whatsapp';

import { WhatsappQRDialog } from '../qr-dialog';
import { SendTestMessageDialog } from './send-test-message-dialog';
import { DeleteSessionDialog } from './delete-session-dialog';
import { SessionSettingsDialog } from './session-settings-dialog';

export function WhatsappSessionDialogs() {
  const activeDialog = useActiveDialog();
  const selectedSession = useSelectedSession();
  const { closeDialog } = useDialogActions();
  const { phone } = useTestMessageForm();

  const deleteSession = useDeleteWhatsappSession();

  const handleDelete = () => {
    if (!selectedSession) return;
    deleteSession.mutate(
      { id: selectedSession.id },
      { onSuccess: closeDialog },
    );
  };

  if (!selectedSession) return null;

  return (
    <>
      <WhatsappQRDialog
        sessionId={selectedSession.id}
        sessionName={selectedSession.name}
        open={activeDialog === 'qr'}
        onOpenChange={open => !open && closeDialog()}
      />

      <SendTestMessageDialog
        sessionId={selectedSession.id}
        defaultPhone={phone}
        open={activeDialog === 'testMessage'}
        onOpenChange={open => !open && closeDialog()}
      />

      <DeleteSessionDialog
        sessionName={selectedSession.name}
        open={activeDialog === 'delete'}
        onOpenChange={open => !open && closeDialog()}
        onConfirm={handleDelete}
        isDeleting={deleteSession.isPending}
      />

      <SessionSettingsDialog
        session={selectedSession}
        open={activeDialog === 'settings'}
        onOpenChange={open => !open && closeDialog()}
      />
    </>
  );
}
