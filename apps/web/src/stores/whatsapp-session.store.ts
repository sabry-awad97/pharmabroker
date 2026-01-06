import { create } from 'zustand';

type DialogType = 'qr' | 'delete' | 'testMessage' | null;

interface SelectedSession {
  id: string;
  name: string;
  jid?: string;
}

interface WhatsappSessionState {
  // Dialog state
  activeDialog: DialogType;
  selectedSession: SelectedSession | null;

  // Actions
  openQRDialog: (session: SelectedSession) => void;
  openDeleteDialog: (session: SelectedSession) => void;
  openTestMessageDialog: (session: SelectedSession) => void;
  closeDialog: () => void;

  // Test message form state
  testMessagePhone: string;
  testMessageText: string;
  setTestMessagePhone: (phone: string) => void;
  setTestMessageText: (text: string) => void;
  resetTestMessageForm: () => void;
}

const DEFAULT_TEST_MESSAGE =
  'Hello! This is a test message from PharmaBroker. 🚀';

export const useWhatsappSessionStore = create<WhatsappSessionState>(set => ({
  // Initial state
  activeDialog: null,
  selectedSession: null,
  testMessagePhone: '',
  testMessageText: DEFAULT_TEST_MESSAGE,

  // Dialog actions
  openQRDialog: session =>
    set({ activeDialog: 'qr', selectedSession: session }),

  openDeleteDialog: session =>
    set({ activeDialog: 'delete', selectedSession: session }),

  openTestMessageDialog: session =>
    set({
      activeDialog: 'testMessage',
      selectedSession: session,
      testMessagePhone: session.jid ? extractPhoneFromJid(session.jid) : '',
    }),

  closeDialog: () => set({ activeDialog: null, selectedSession: null }),

  // Test message form actions
  setTestMessagePhone: phone => set({ testMessagePhone: phone }),
  setTestMessageText: text => set({ testMessageText: text }),
  resetTestMessageForm: () =>
    set({ testMessagePhone: '', testMessageText: DEFAULT_TEST_MESSAGE }),
}));

// Helper to extract phone number from JID
function extractPhoneFromJid(jid: string): string {
  const match = jid.match(/^(\d+)/);
  return match ? match[1] : '';
}

// Selector hooks for better performance
export const useActiveDialog = () =>
  useWhatsappSessionStore(state => state.activeDialog);

export const useSelectedSession = () =>
  useWhatsappSessionStore(state => state.selectedSession);

export const useDialogActions = () =>
  useWhatsappSessionStore(state => ({
    openQRDialog: state.openQRDialog,
    openDeleteDialog: state.openDeleteDialog,
    openTestMessageDialog: state.openTestMessageDialog,
    closeDialog: state.closeDialog,
  }));

export const useTestMessageForm = () =>
  useWhatsappSessionStore(state => ({
    phone: state.testMessagePhone,
    message: state.testMessageText,
    setPhone: state.setTestMessagePhone,
    setMessage: state.setTestMessageText,
    reset: state.resetTestMessageForm,
  }));
