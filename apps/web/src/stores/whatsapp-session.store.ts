import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { extractPhoneFromJid } from '@/utils/jid';

type DialogType = 'qr' | 'delete' | 'testMessage' | 'settings' | null;

interface SelectedSession {
  id: string;
  name: string;
  jid?: string;
  auto_connect?: boolean;
}

interface WhatsappSessionState {
  // Dialog state
  activeDialog: DialogType;
  selectedSession: SelectedSession | null;

  // Actions
  openQRDialog: (session: SelectedSession) => void;
  openDeleteDialog: (session: SelectedSession) => void;
  openTestMessageDialog: (session: SelectedSession) => void;
  openSettingsDialog: (session: SelectedSession) => void;
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

  openSettingsDialog: session =>
    set({ activeDialog: 'settings', selectedSession: session }),

  closeDialog: () => set({ activeDialog: null, selectedSession: null }),

  // Test message form actions
  setTestMessagePhone: phone => set({ testMessagePhone: phone }),
  setTestMessageText: text => set({ testMessageText: text }),
  resetTestMessageForm: () =>
    set({ testMessagePhone: '', testMessageText: DEFAULT_TEST_MESSAGE }),
}));

// Selector hooks for better performance
export const useActiveDialog = () =>
  useWhatsappSessionStore(state => state.activeDialog);

export const useSelectedSession = () =>
  useWhatsappSessionStore(state => state.selectedSession);

export const useDialogActions = () =>
  useWhatsappSessionStore(
    useShallow(state => ({
      openQRDialog: state.openQRDialog,
      openDeleteDialog: state.openDeleteDialog,
      openTestMessageDialog: state.openTestMessageDialog,
      openSettingsDialog: state.openSettingsDialog,
      closeDialog: state.closeDialog,
    })),
  );

export const useTestMessageForm = () =>
  useWhatsappSessionStore(
    useShallow(state => ({
      phone: state.testMessagePhone,
      message: state.testMessageText,
      setPhone: state.setTestMessagePhone,
      setMessage: state.setTestMessageText,
      reset: state.resetTestMessageForm,
    })),
  );
