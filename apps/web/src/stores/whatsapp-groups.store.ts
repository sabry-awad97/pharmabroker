import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// Filter types
export type GroupFilterType = 'all' | 'admin' | 'archived' | 'muted';

// Dialog types for groups
export type GroupDialogType = 'sync' | 'details' | null;

// Selected group info
interface SelectedGroup {
  id: string;
  name: string;
  jid: string;
}

interface WhatsappGroupsState {
  // Filter state (Requirements 2.1, 2.2, 6.1)
  search: string;
  filter: GroupFilterType;
  sessionId: string | null;

  // UI state
  selectedGroup: SelectedGroup | null;
  activeDialog: GroupDialogType;

  // Filter actions
  setSearch: (search: string) => void;
  setFilter: (filter: GroupFilterType) => void;
  setSessionId: (sessionId: string | null) => void;
  resetFilters: () => void;

  // Dialog actions
  openSyncDialog: () => void;
  openDetailsDialog: (group: SelectedGroup) => void;
  closeDialog: () => void;

  // Selection actions
  selectGroup: (group: SelectedGroup | null) => void;
}

export const useWhatsappGroupsStore = create<WhatsappGroupsState>(set => ({
  // Initial filter state
  search: '',
  filter: 'all',
  sessionId: null,

  // Initial UI state
  selectedGroup: null,
  activeDialog: null,

  // Filter actions
  setSearch: search => set({ search }),
  setFilter: filter => set({ filter }),
  setSessionId: sessionId => set({ sessionId }),
  resetFilters: () => set({ search: '', filter: 'all', sessionId: null }),

  // Dialog actions
  openSyncDialog: () => set({ activeDialog: 'sync' }),
  openDetailsDialog: group =>
    set({ activeDialog: 'details', selectedGroup: group }),
  closeDialog: () => set({ activeDialog: null }),

  // Selection actions
  selectGroup: group => set({ selectedGroup: group }),
}));

// Selector hooks for better performance using useShallow to prevent infinite loops

// Filter state selector
export const useGroupFilters = () =>
  useWhatsappGroupsStore(
    useShallow(state => ({
      search: state.search,
      filter: state.filter,
      sessionId: state.sessionId,
    })),
  );

// Filter actions selector
export const useGroupFilterActions = () =>
  useWhatsappGroupsStore(
    useShallow(state => ({
      setSearch: state.setSearch,
      setFilter: state.setFilter,
      setSessionId: state.setSessionId,
      resetFilters: state.resetFilters,
    })),
  );

// Dialog state selector
export const useGroupDialog = () =>
  useWhatsappGroupsStore(state => state.activeDialog);

// Selected group selector
export const useSelectedGroup = () =>
  useWhatsappGroupsStore(state => state.selectedGroup);

// Dialog actions selector
export const useGroupDialogActions = () =>
  useWhatsappGroupsStore(
    useShallow(state => ({
      openSyncDialog: state.openSyncDialog,
      openDetailsDialog: state.openDetailsDialog,
      closeDialog: state.closeDialog,
    })),
  );

// Selection actions selector
export const useGroupSelectionActions = () =>
  useWhatsappGroupsStore(
    useShallow(state => ({
      selectGroup: state.selectGroup,
    })),
  );
