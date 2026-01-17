/**
 * Message Actions Hook
 *
 * Manages selection, dialogs, and action handlers for WhatsApp messages.
 * Extracts complex UI state management from the route component.
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import type { WhatsAppMessageWithGroup } from '@pharmabroker/schemas/whatsapp';
import {
  useProcessMessageAI,
  useBulkProcessAI,
  useRetryAI,
  useReprocessAI,
  useDeleteMessage,
  useBulkDeleteMessages,
  useExportMessages,
} from './whatsapp-messages';

export interface MessageActionsState {
  // Dialog states
  detailSheetOpen: boolean;
  deleteDialogOpen: boolean;
  bulkProcessDialogOpen: boolean;
  exportDialogOpen: boolean;
  scheduleDialogOpen: boolean;
  settingsDialogOpen: boolean;

  // Selected data
  selectedMessage: WhatsAppMessageWithGroup | null;
  messagesToDelete: WhatsAppMessageWithGroup[];
  messagesToProcess: WhatsAppMessageWithGroup[];
  messagesToSchedule: string[];
  processingMessageId: string | null;

  // Loading states
  isProcessing: boolean;
  isDeleting: boolean;
}

export interface MessageActionsHandlers {
  // Dialog handlers
  setDetailSheetOpen: (open: boolean) => void;
  setDeleteDialogOpen: (open: boolean) => void;
  setBulkProcessDialogOpen: (open: boolean) => void;
  setExportDialogOpen: (open: boolean) => void;
  setScheduleDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;

  // Action handlers
  handleViewMessage: (message: WhatsAppMessageWithGroup) => void;
  handleProcessAI: (message: WhatsAppMessageWithGroup) => Promise<void>;
  handleRetryAI: (message: WhatsAppMessageWithGroup) => Promise<void>;
  handleReprocessAI: (message: WhatsAppMessageWithGroup) => Promise<void>;
  handleDeleteMessage: (message: WhatsAppMessageWithGroup) => void;
  handleConfirmDelete: () => Promise<void>;
  handleBulkProcess: (messages: WhatsAppMessageWithGroup[]) => void;
  handleConfirmBulkProcess: () => Promise<void>;
  handleBulkDelete: (messages: WhatsAppMessageWithGroup[]) => void;
  handleScheduleAI: (messages: WhatsAppMessageWithGroup[]) => void;
  handleExport: (
    format: 'csv' | 'json',
    exportOptions: ExportOptions,
  ) => Promise<void>;
  handleProcessAllPending: (messages: WhatsAppMessageWithGroup[]) => void;
  closeAllDialogs: () => void;
}

import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';

export interface ExportOptions {
  sessionId?: string;
  messageType?: MessageType | 'all';
  aiStatus?: AIStatus | 'all';
  source?: 'all' | 'realtime' | 'history';
  dateFrom?: Date;
  dateTo?: Date;
  totalCount: number;
}

export function useMessageActions(): MessageActionsState &
  MessageActionsHandlers {
  // Dialog states
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkProcessDialogOpen, setBulkProcessDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  // Selected data
  const [selectedMessage, setSelectedMessage] =
    useState<WhatsAppMessageWithGroup | null>(null);
  const [messagesToDelete, setMessagesToDelete] = useState<
    WhatsAppMessageWithGroup[]
  >([]);
  const [messagesToProcess, setMessagesToProcess] = useState<
    WhatsAppMessageWithGroup[]
  >([]);
  const [messagesToSchedule, setMessagesToSchedule] = useState<string[]>([]);
  const [processingMessageId, setProcessingMessageId] = useState<string | null>(
    null,
  );

  // Mutations
  const processAI = useProcessMessageAI();
  const bulkProcessAI = useBulkProcessAI();
  const retryAI = useRetryAI();
  const reprocessAI = useReprocessAI();
  const deleteMessage = useDeleteMessage();
  const bulkDeleteMessages = useBulkDeleteMessages();
  const exportMessages = useExportMessages();

  // Derived states
  const isProcessing =
    processAI.isPending ||
    bulkProcessAI.isPending ||
    retryAI.isPending ||
    reprocessAI.isPending;
  const isDeleting = deleteMessage.isPending || bulkDeleteMessages.isPending;

  // Action handlers
  const handleViewMessage = useCallback((message: WhatsAppMessageWithGroup) => {
    setSelectedMessage(message);
    setDetailSheetOpen(true);
  }, []);

  const handleProcessAI = useCallback(
    async (message: WhatsAppMessageWithGroup) => {
      setProcessingMessageId(message.id);
      try {
        await processAI.mutateAsync(message.id);
        toast.success('AI processing started');
      } catch {
        toast.error('Failed to start AI processing');
      } finally {
        setProcessingMessageId(null);
      }
    },
    [processAI],
  );

  const handleRetryAI = useCallback(
    async (message: WhatsAppMessageWithGroup) => {
      setProcessingMessageId(message.id);
      try {
        await retryAI.mutateAsync(message.id);
        toast.success('AI processing retried');
      } catch {
        toast.error('Failed to retry AI processing');
      } finally {
        setProcessingMessageId(null);
      }
    },
    [retryAI],
  );

  const handleReprocessAI = useCallback(
    async (message: WhatsAppMessageWithGroup) => {
      setProcessingMessageId(message.id);
      try {
        await reprocessAI.mutateAsync(message.id);
        toast.success('AI reprocessing started');
      } catch {
        toast.error('Failed to reprocess with AI');
      } finally {
        setProcessingMessageId(null);
      }
    },
    [reprocessAI],
  );

  const handleDeleteMessage = useCallback(
    (message: WhatsAppMessageWithGroup) => {
      setMessagesToDelete([message]);
      setDeleteDialogOpen(true);
    },
    [],
  );

  const handleConfirmDelete = useCallback(async () => {
    try {
      if (messagesToDelete.length === 1) {
        await deleteMessage.mutateAsync(messagesToDelete[0].id);
        toast.success('Message deleted');
      } else {
        await bulkDeleteMessages.mutateAsync(messagesToDelete.map(m => m.id));
        toast.success(`${messagesToDelete.length} messages deleted`);
      }
      setDeleteDialogOpen(false);
      setMessagesToDelete([]);
    } catch {
      toast.error('Failed to delete messages');
    }
  }, [messagesToDelete, deleteMessage, bulkDeleteMessages]);

  const handleBulkProcess = useCallback(
    (messages: WhatsAppMessageWithGroup[]) => {
      const pendingMessages = messages.filter(
        m => m.aiStatus === 'pending' || m.aiStatus === 'failed',
      );
      if (pendingMessages.length === 0) {
        toast.info('No messages to process');
        return;
      }
      setMessagesToProcess(pendingMessages);
      setBulkProcessDialogOpen(true);
    },
    [],
  );

  const handleConfirmBulkProcess = useCallback(async () => {
    try {
      await bulkProcessAI.mutateAsync(messagesToProcess.map(m => m.id));
      toast.success(`Processing ${messagesToProcess.length} messages with AI`);
      setBulkProcessDialogOpen(false);
      setMessagesToProcess([]);
    } catch {
      toast.error('Failed to start bulk processing');
    }
  }, [messagesToProcess, bulkProcessAI]);

  const handleBulkDelete = useCallback(
    (messages: WhatsAppMessageWithGroup[]) => {
      setMessagesToDelete(messages);
      setDeleteDialogOpen(true);
    },
    [],
  );

  const handleScheduleAI = useCallback(
    (messages: WhatsAppMessageWithGroup[]) => {
      const schedulableMessages = messages.filter(
        m => m.aiStatus === 'pending' || m.aiStatus === 'failed',
      );
      if (schedulableMessages.length === 0) {
        toast.info('No messages available for scheduling');
        return;
      }
      setMessagesToSchedule(schedulableMessages.map(m => m.id));
      setScheduleDialogOpen(true);
    },
    [],
  );

  const handleExport = useCallback(
    async (format: 'csv' | 'json', options: ExportOptions) => {
      try {
        const blob = await exportMessages.mutateAsync({
          format,
          sessionId: options.sessionId,
          messageType:
            options.messageType && options.messageType !== 'all'
              ? (options.messageType as MessageType)
              : undefined,
          aiStatus:
            options.aiStatus && options.aiStatus !== 'all'
              ? (options.aiStatus as AIStatus)
              : undefined,
          source:
            options.source && options.source !== 'all'
              ? (options.source as 'realtime' | 'history')
              : undefined,
          dateFrom: options.dateFrom,
          dateTo: options.dateTo,
        });

        // Download the file
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `messages-${new Date().toISOString().split('T')[0]}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast.success(
          `Exported ${options.totalCount} messages as ${format.toUpperCase()}`,
        );
        setExportDialogOpen(false);
      } catch {
        toast.error('Failed to export messages');
      }
    },
    [exportMessages],
  );

  const handleProcessAllPending = useCallback(
    (messages: WhatsAppMessageWithGroup[]) => {
      const pendingMessages = messages.filter(m => m.aiStatus === 'pending');
      if (pendingMessages.length === 0) {
        toast.info('No pending messages to process');
        return;
      }
      handleBulkProcess(pendingMessages);
    },
    [handleBulkProcess],
  );

  const closeAllDialogs = useCallback(() => {
    setDetailSheetOpen(false);
    setDeleteDialogOpen(false);
    setBulkProcessDialogOpen(false);
    setExportDialogOpen(false);
    setScheduleDialogOpen(false);
    setSettingsDialogOpen(false);
  }, []);

  return {
    // State
    detailSheetOpen,
    deleteDialogOpen,
    bulkProcessDialogOpen,
    exportDialogOpen,
    scheduleDialogOpen,
    settingsDialogOpen,
    selectedMessage,
    messagesToDelete,
    messagesToProcess,
    messagesToSchedule,
    processingMessageId,
    isProcessing,
    isDeleting,

    // Handlers
    setDetailSheetOpen,
    setDeleteDialogOpen,
    setBulkProcessDialogOpen,
    setExportDialogOpen,
    setScheduleDialogOpen,
    setSettingsDialogOpen,
    handleViewMessage,
    handleProcessAI,
    handleRetryAI,
    handleReprocessAI,
    handleDeleteMessage,
    handleConfirmDelete,
    handleBulkProcess,
    handleConfirmBulkProcess,
    handleBulkDelete,
    handleScheduleAI,
    handleExport,
    handleProcessAllPending,
    closeAllDialogs,
  };
}
