/**
 * WhatsApp Messages Page
 *
 * Displays messages for the currently active session with
 * filtering, sorting, and AI processing capabilities.
 *
 * Pagination Implementation:
 * - Uses cursor-based pagination for efficient large dataset handling
 * - Backend returns nextCursor for forward navigation
 * - Cursor resets to undefined (first page) when filters change
 * - Page size changes also reset to first page
 * - Previous page navigation returns to first page (simplified bidirectional)
 * - Total count is always accurate from backend
 * - Loading states prevent duplicate requests
 * - placeholderData keeps previous data visible during page transitions
 */

import { createFileRoute, redirect } from '@tanstack/react-router';
import { RefreshCw, Sparkles, Download, Settings2 } from 'lucide-react';
import { useState } from 'react';
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
  ScheduleAIDialog,
  AISettingsDialog,
  KeyboardShortcutsDialog,
} from '@/components/whatsapp/messages';
import { SessionRequiredState } from '@/components/session-picker';
import { MessagesErrorBoundary } from '@/components/errors/messages-error-boundary';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useActiveSession } from '@/stores/active-session.store';
import {
  useWhatsappMessages,
  useWhatsappMessage,
  useSyncMessages,
  useInvalidateMessages,
  useFetchAllMessages,
} from '@/hooks/whatsapp-messages';
import { useMessageFilters } from '@/hooks/use-message-filters';
import { useMessageActions } from '@/hooks/use-message-actions';

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
  const activeSession = useActiveSession();
  const invalidateMessages = useInvalidateMessages();
  const fetchAllMessages = useFetchAllMessages();

  // Custom hooks for state management
  const filters = useMessageFilters();
  const actions = useMessageActions();

  // Keyboard shortcuts dialog state
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  // Data fetching
  const {
    data: messagesData,
    isLoading,
    isFetching,
  } = useWhatsappMessages({
    sessionId: activeSession?.id,
    search: filters.search || undefined,
    messageType: filters.messageType,
    aiStatus: filters.aiStatus,
    source: filters.source,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    limit: filters.pageSize,
    cursor: filters.cursor,
  });

  const { data: messageDetail, isLoading: isLoadingDetail } =
    useWhatsappMessage(actions.selectedMessage?.id);

  // Mutations
  const syncMessages = useSyncMessages();

  // Derived state
  const messages = messagesData?.messages || [];
  const totalCount = messagesData?.total || 0;
  const nextCursor = messagesData?.nextCursor;
  const hasNextPage = !!nextCursor;
  const hasPreviousPage = !!filters.cursor;
  const hasMessages = messages.length > 0;
  const hasNoResults = !hasMessages && filters.hasFiltersApplied;
  const hasNoMessages =
    !hasMessages && !filters.hasFiltersApplied && !isLoading;

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
      actions.setExportDialogOpen(true);
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

  useHotkeys(
    'ArrowLeft',
    (e: KeyboardEvent) => {
      if (hasPreviousPage && !isFetching) {
        e.preventDefault();
        handlePreviousPage();
      }
    },
    { enableOnFormTags: false },
  );

  useHotkeys(
    'ArrowRight',
    (e: KeyboardEvent) => {
      if (hasNextPage && !isFetching) {
        e.preventDefault();
        handleNextPage();
      }
    },
    { enableOnFormTags: false },
  );

  useHotkeys('escape', () => {
    actions.closeAllDialogs();
    setShortcutsDialogOpen(false);
  });

  useHotkeys('shift+/', () => {
    setShortcutsDialogOpen(true);
  });

  // Pagination handlers
  const handleNextPage = () => {
    if (nextCursor) {
      filters.setCursor(nextCursor);
    }
  };

  const handlePreviousPage = () => {
    // For previous page, we reset to first page
    // Note: True bidirectional cursor pagination would require tracking cursor history
    filters.setCursor(undefined);
  };

  // Select all handler
  const handleSelectAll = async () => {
    return await fetchAllMessages({
      sessionId: activeSession?.id,
      search: filters.search || undefined,
      messageType: filters.messageType,
      aiStatus: filters.aiStatus,
      source: filters.source,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  };

  // Show session required state if no active session
  if (!activeSession) {
    return <SessionRequiredState />;
  }

  return (
    <MessagesErrorBoundary onReset={invalidateMessages}>
      <div className="p-6">
        {/* Dialogs */}
        <MessageDetailDialog
          open={actions.detailSheetOpen}
          onOpenChange={actions.setDetailSheetOpen}
          message={actions.selectedMessage}
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
          onProcessAI={() =>
            actions.selectedMessage &&
            actions.handleProcessAI(actions.selectedMessage)
          }
          onRetryAI={() =>
            actions.selectedMessage &&
            actions.handleRetryAI(actions.selectedMessage)
          }
          isProcessing={actions.isProcessing}
        />

        <DeleteMessageDialog
          open={actions.deleteDialogOpen}
          onOpenChange={actions.setDeleteDialogOpen}
          onConfirm={actions.handleConfirmDelete}
          isLoading={actions.isDeleting}
          count={actions.messagesToDelete.length}
        />

        <BulkProcessDialog
          open={actions.bulkProcessDialogOpen}
          onOpenChange={actions.setBulkProcessDialogOpen}
          onConfirm={actions.handleConfirmBulkProcess}
          isLoading={actions.isProcessing}
          count={actions.messagesToProcess.length}
        />

        <ExportDialog
          open={actions.exportDialogOpen}
          onOpenChange={actions.setExportDialogOpen}
          onConfirm={format =>
            actions.handleExport(format, {
              sessionId: activeSession?.id,
              messageType: filters.messageType,
              aiStatus: filters.aiStatus,
              source: filters.source,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
              totalCount,
            })
          }
          isLoading={false}
          count={totalCount}
        />

        <ScheduleAIDialog
          open={actions.scheduleDialogOpen}
          onOpenChange={actions.setScheduleDialogOpen}
          messageIds={actions.messagesToSchedule}
          onSuccess={() => actions.setScheduleDialogOpen(false)}
        />

        <AISettingsDialog
          open={actions.settingsDialogOpen}
          onOpenChange={actions.setSettingsDialogOpen}
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
                    onClick={() => actions.setExportDialogOpen(true)}
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
                    onClick={() => actions.setSettingsDialogOpen(true)}
                    aria-label="AI Settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>AI Processing Settings</TooltipContent>
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
                disabled={actions.isProcessing}
                className="bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                onClick={() => actions.handleProcessAllPending(messages)}
              >
                <Sparkles
                  className={cn(
                    'mr-1.5 h-3.5 w-3.5',
                    actions.isProcessing && 'animate-pulse',
                  )}
                />
                {actions.isProcessing ? 'Processing...' : 'Process Pending'}
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          <MessagesFilterPanel
            search={filters.search}
            messageType={filters.messageType}
            aiStatus={filters.aiStatus}
            source={filters.source}
            onSearchChange={filters.setSearch}
            onMessageTypeChange={filters.setMessageType}
            onAIStatusChange={filters.setAIStatus}
            onSourceChange={filters.setSource}
            onClear={filters.clearFilters}
            totalCount={totalCount}
            filteredCount={messages.length}
          />
          <div className="flex items-center gap-3">
            <DateRangeFilter
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onDateChange={filters.setDateRange}
            />
            <div className="flex-1" />
            <KeyboardShortcutsDialog />
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
            onClearFilters={filters.clearFilters}
            searchQuery={filters.search}
          />
        ) : (
          <LoadingOverlay isLoading={isFetching && messages.length > 0}>
            <MessagesDataTable
              data={messages}
              onView={actions.handleViewMessage}
              onProcessAI={actions.handleProcessAI}
              onRetryAI={actions.handleRetryAI}
              onReprocessAI={actions.handleReprocessAI}
              onDelete={actions.handleDeleteMessage}
              onBulkProcess={actions.handleBulkProcess}
              onBulkDelete={actions.handleBulkDelete}
              onScheduleAI={actions.handleScheduleAI}
              onSelectAll={handleSelectAll}
              isProcessing={actions.isProcessing}
              processingMessageId={actions.processingMessageId}
              pageSize={filters.pageSize}
              onPageSizeChange={filters.setPageSize}
              totalCount={totalCount}
              hasNextPage={hasNextPage}
              hasPreviousPage={hasPreviousPage}
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
              isLoadingPage={isFetching}
            />
          </LoadingOverlay>
        )}
      </div>
    </MessagesErrorBoundary>
  );
}
