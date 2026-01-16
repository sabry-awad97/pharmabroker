/**
 * WhatsApp Messages Page
 *
 * Displays messages for the currently active session with
 * filtering, sorting, and AI processing capabilities.
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Sparkles, Download, Keyboard } from 'lucide-react';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useHotkeys } from 'react-hotkeys-hook';

import { Button } from '@/components/ui/button';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  MessagesDataTable,
  MessagesEmptyState,
  MessagesSkeleton,
  MessagesFilterPanel,
  MessageDetailDialog,
  DeleteMessageDialog,
  BulkProcessDialog,
  ExportDialog,
  DateRangeFilter,
} from '@/components/whatsapp/messages';
import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';
import type { MessageSource } from '@/components/whatsapp/messages/messages-filter-panel';
import { SessionRequiredState } from '@/components/session-picker';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useActiveSession } from '@/stores/active-session.store';
import {
  useWhatsappMessages,
  useWhatsappMessage,
  useSyncMessages,
  useProcessMessageAI,
  useBulkProcessAI,
  useRetryAI,
  useReprocessAI,
  useDeleteMessage,
  useBulkDeleteMessages,
  useExportMessages,
  useInvalidateMessages,
} from '@/hooks/whatsapp-messages';
import type { WhatsAppMessageWithGroup } from '@pharmabroker/schemas/whatsapp';

export const Route = createFileRoute('/whatsapp/messages/')({
  component: WhatsappMessagesPage,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      redirect({ to: '/login', throw: true });
    }
    return { session };
  },
});

function WhatsappMessagesPage() {
  const navigate = useNavigate();
  const activeSession = useActiveSession();
  const invalidateMessages = useInvalidateMessages();

  // Filter state
  const [search, setSearch] = useState('');
  const [messageType, setMessageType] = useState<MessageType | 'all'>('all');
  const [aiStatus, setAIStatus] = useState<AIStatus | 'all'>('all');
  const [source, setSource] = useState<MessageSource>('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [pageSize, setPageSize] = useState(20);

  // UI state
  const [selectedMessage, setSelectedMessage] =
    useState<WhatsAppMessageWithGroup | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkProcessDialogOpen, setBulkProcessDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [messagesToDelete, setMessagesToDelete] = useState<
    WhatsAppMessageWithGroup[]
  >([]);
  const [messagesToProcess, setMessagesToProcess] = useState<
    WhatsAppMessageWithGroup[]
  >([]);
  const [processingMessageId, setProcessingMessageId] = useState<string | null>(
    null,
  );

  // Data fetching
  const {
    data: messagesData,
    isLoading,
    isFetching,
  } = useWhatsappMessages({
    sessionId: activeSession?.id,
    search: search || undefined,
    messageType,
    aiStatus,
    source,
    dateFrom,
    dateTo,
    limit: pageSize,
  });

  const { data: messageDetail, isLoading: isLoadingDetail } =
    useWhatsappMessage(selectedMessage?.id);

  // Mutations
  const syncMessages = useSyncMessages();
  const processAI = useProcessMessageAI();
  const bulkProcessAI = useBulkProcessAI();
  const retryAI = useRetryAI();
  const reprocessAI = useReprocessAI();
  const deleteMessage = useDeleteMessage();
  const bulkDeleteMessages = useBulkDeleteMessages();
  const exportMessages = useExportMessages();

  // Derived state
  const messages = messagesData?.messages || [];
  const totalCount = messagesData?.total || 0;
  const hasFiltersApplied =
    search.length > 0 ||
    messageType !== 'all' ||
    aiStatus !== 'all' ||
    source !== 'all' ||
    dateFrom !== undefined ||
    dateTo !== undefined;
  const hasMessages = messages.length > 0;
  const hasNoResults = !hasMessages && hasFiltersApplied;
  const hasNoMessages = !hasMessages && !hasFiltersApplied && !isLoading;
  const isProcessing =
    processAI.isPending ||
    bulkProcessAI.isPending ||
    retryAI.isPending ||
    reprocessAI.isPending;
  const isDeleting = deleteMessage.isPending || bulkDeleteMessages.isPending;

  // Keyboard shortcuts
  useHotkeys(
    'mod+a',
    (e: KeyboardEvent) => {
      e.preventDefault();
      // Select all is handled by the table
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    'mod+e',
    (e: KeyboardEvent) => {
      e.preventDefault();
      setExportDialogOpen(true);
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    'mod+r',
    (e: KeyboardEvent) => {
      e.preventDefault();
      invalidateMessages();
    },
    { enableOnFormTags: false },
  );

  useHotkeys('escape', () => {
    setDetailSheetOpen(false);
    setDeleteDialogOpen(false);
    setBulkProcessDialogOpen(false);
    setExportDialogOpen(false);
  });

  // Handlers
  const handleClearFilters = useCallback(() => {
    setSearch('');
    setMessageType('all');
    setAIStatus('all');
    setSource('all');
    setDateFrom(undefined);
    setDateTo(undefined);
  }, []);

  const handleDateChange = useCallback(
    (from: Date | undefined, to: Date | undefined) => {
      setDateFrom(from);
      setDateTo(to);
    },
    [],
  );

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

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      try {
        const blob = await exportMessages.mutateAsync({
          format,
          sessionId: activeSession?.id,
          messageType: messageType !== 'all' ? messageType : undefined,
          aiStatus: aiStatus !== 'all' ? aiStatus : undefined,
          source: source !== 'all' ? source : undefined,
          dateFrom,
          dateTo,
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
          `Exported ${totalCount} messages as ${format.toUpperCase()}`,
        );
        setExportDialogOpen(false);
      } catch {
        toast.error('Failed to export messages');
      }
    },
    [
      exportMessages,
      activeSession?.id,
      messageType,
      aiStatus,
      source,
      dateFrom,
      dateTo,
      totalCount,
    ],
  );

  const handleProcessAllPending = useCallback(() => {
    const pendingMessages = messages.filter(m => m.aiStatus === 'pending');
    if (pendingMessages.length === 0) {
      toast.info('No pending messages to process');
      return;
    }
    handleBulkProcess(pendingMessages);
  }, [messages, handleBulkProcess]);

  // Show session required state if no active session
  if (!activeSession) {
    return <SessionRequiredState />;
  }

  return (
    <div className="p-6">
      {/* Dialogs */}
      <MessageDetailDialog
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        message={selectedMessage}
        extractedData={messageDetail?.extractedData?.map(ed => ({
          id: ed.id,
          dataType: ed.dataType,
          data: ed.data,
          confidence: ed.confidence ?? 0,
          model: ed.model,
          createdAt: ed.createdAt,
        }))}
        rawPayload={
          messageDetail?.rawPayload as Record<string, unknown> | undefined
        }
        isLoading={isLoadingDetail}
        onProcessAI={() => selectedMessage && handleProcessAI(selectedMessage)}
        onRetryAI={() => selectedMessage && handleRetryAI(selectedMessage)}
        isProcessing={isProcessing}
      />

      <DeleteMessageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        isLoading={isDeleting}
        count={messagesToDelete.length}
      />

      <BulkProcessDialog
        open={bulkProcessDialogOpen}
        onOpenChange={setBulkProcessDialogOpen}
        onConfirm={handleConfirmBulkProcess}
        isLoading={bulkProcessAI.isPending}
        count={messagesToProcess.length}
      />

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        onConfirm={handleExport}
        isLoading={exportMessages.isPending}
        count={totalCount}
      />

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <h1 className="text-lg font-semibold">Messages</h1>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                {activeSession.name}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              View and process WhatsApp messages with AI
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExportDialogOpen(true)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export messages (Ctrl+E)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={invalidateMessages}
                  disabled={isFetching}
                  aria-label="Refresh messages"
                >
                  <RefreshCw
                    className={cn(
                      'h-4 w-4 transition-transform duration-500',
                      isFetching && 'animate-spin',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh (Ctrl+R)</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              disabled={isProcessing}
              className="bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
              onClick={handleProcessAllPending}
            >
              <Sparkles
                className={cn(
                  'mr-1.5 h-3.5 w-3.5',
                  isProcessing && 'animate-pulse',
                )}
              />
              {isProcessing ? 'Processing...' : 'Process Pending'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <MessagesFilterPanel
          search={search}
          messageType={messageType}
          aiStatus={aiStatus}
          source={source}
          onSearchChange={setSearch}
          onMessageTypeChange={setMessageType}
          onAIStatusChange={setAIStatus}
          onSourceChange={setSource}
          onClear={handleClearFilters}
          totalCount={totalCount}
          filteredCount={messages.length}
        />
        <div className="flex items-center gap-3">
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateChange={handleDateChange}
          />
          <div className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs">
              <div className="space-y-1 text-xs">
                <p>
                  <kbd className="bg-muted rounded px-1">Ctrl+A</kbd> Select all
                </p>
                <p>
                  <kbd className="bg-muted rounded px-1">Ctrl+E</kbd> Export
                </p>
                <p>
                  <kbd className="bg-muted rounded px-1">Ctrl+R</kbd> Refresh
                </p>
                <p>
                  <kbd className="bg-muted rounded px-1">Esc</kbd> Close dialogs
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Content */}
      {isLoading && !messages.length ? (
        <MessagesSkeleton count={10} />
      ) : hasNoMessages ? (
        <MessagesEmptyState
          variant="no-messages"
          onSync={() => syncMessages.mutate(activeSession.id)}
          isSyncing={syncMessages.isPending}
        />
      ) : hasNoResults ? (
        <MessagesEmptyState
          variant="no-results"
          onClearFilters={handleClearFilters}
          searchQuery={search}
        />
      ) : (
        <LoadingOverlay isLoading={isFetching && messages.length > 0}>
          <MessagesDataTable
            data={messages}
            onView={handleViewMessage}
            onProcessAI={handleProcessAI}
            onRetryAI={handleRetryAI}
            onReprocessAI={handleReprocessAI}
            onDelete={handleDeleteMessage}
            onBulkProcess={handleBulkProcess}
            onBulkDelete={handleBulkDelete}
            isProcessing={isProcessing}
            processingMessageId={processingMessageId}
            pageSize={pageSize}
          />
        </LoadingOverlay>
      )}
    </div>
  );
}
