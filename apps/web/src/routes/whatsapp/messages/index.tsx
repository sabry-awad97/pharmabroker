/**
 * WhatsApp Messages Page
 *
 * Displays messages for the currently active session with
 * filtering, sorting, and AI processing capabilities.
 */

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { RefreshCw, Sparkles, Download } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { toast } from 'sonner';

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
  type WhatsAppMessage,
} from '@/components/whatsapp/messages';
import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';
import type { MessageSource } from '@/components/whatsapp/messages/messages-filter-panel';
import { SessionRequiredState } from '@/components/session-picker';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useActiveSession } from '@/stores/active-session.store';

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

// Placeholder data generator for demo
function generatePlaceholderMessages(count: number): WhatsAppMessage[] {
  const messageTypes: MessageType[] = [
    'text',
    'image',
    'video',
    'audio',
    'document',
    'sticker',
    'location',
  ];
  const aiStatuses: AIStatus[] = [
    'pending',
    'processing',
    'completed',
    'failed',
    'skipped',
  ];
  const sources: ('realtime' | 'history')[] = ['realtime', 'history'];
  const senders = [
    { name: 'Ahmed Hassan', jid: '201012345678@s.whatsapp.net' },
    { name: 'Sarah Mohamed', jid: '201098765432@s.whatsapp.net' },
    { name: 'Omar Ali', jid: '201055544433@s.whatsapp.net' },
    { name: 'Fatima Ibrahim', jid: '201077788899@s.whatsapp.net' },
    { name: null, jid: '201033322211@s.whatsapp.net' },
  ];
  const groups = [
    { id: 'g1', name: 'Pharmacy Orders' },
    { id: 'g2', name: 'Customer Support' },
    { id: 'g3', name: 'Team Updates' },
    { id: 'g4', name: 'Suppliers Network' },
  ];
  const sampleTexts = [
    'Hello, I need to order some medications for my pharmacy.',
    'Can you check the availability of Paracetamol 500mg?',
    'The delivery was successful, thank you!',
    'Please send me the invoice for the last order.',
    'When will the next shipment arrive?',
    'I have a question about the pricing.',
    'The order #12345 has been confirmed.',
    'Please update the stock levels.',
    null,
  ];

  return Array.from({ length: count }, (_, i) => {
    const sender = senders[Math.floor(Math.random() * senders.length)];
    const group = groups[Math.floor(Math.random() * groups.length)];
    const type = messageTypes[Math.floor(Math.random() * messageTypes.length)];
    const aiStatus = aiStatuses[Math.floor(Math.random() * aiStatuses.length)];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const text =
      type === 'text'
        ? sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
        : null;
    const caption =
      type !== 'text' && Math.random() > 0.5
        ? sampleTexts[Math.floor(Math.random() * (sampleTexts.length - 1))]
        : null;

    return {
      id: `msg-${i + 1}`,
      messageId: `3EB0${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      sessionId: 'session-1',
      groupId: group.id,
      groupName: group.name,
      senderJid: sender.jid,
      senderPushName: sender.name,
      participantId: `participant-${i}`,
      messageType: type,
      text,
      caption,
      filename: type === 'document' ? 'invoice.pdf' : null,
      isFromMe: Math.random() > 0.8,
      isForwarded: Math.random() > 0.9,
      quotedMessageId: Math.random() > 0.85 ? `msg-${i - 1}` : null,
      status: 'received' as const,
      messageTimestamp: new Date(
        Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000),
      ),
      source,
      aiStatus,
      aiModel: aiStatus === 'completed' ? 'gpt-4o' : null,
      aiError:
        aiStatus === 'failed' ? 'Rate limit exceeded. Please retry.' : null,
    };
  });
}

function WhatsappMessagesPage() {
  const navigate = useNavigate();
  const activeSession = useActiveSession();

  // Filter state
  const [search, setSearch] = useState('');
  const [messageType, setMessageType] = useState<MessageType | 'all'>('all');
  const [aiStatus, setAIStatus] = useState<AIStatus | 'all'>('all');
  const [source, setSource] = useState<MessageSource>('all');

  // Loading states (placeholders for future hooks)
  const [isLoading, setIsLoading] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Placeholder data
  const allMessages = useMemo(() => generatePlaceholderMessages(50), []);

  // Filter messages
  const filteredMessages = useMemo(() => {
    return allMessages.filter(msg => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesText = msg.text?.toLowerCase().includes(searchLower);
        const matchesCaption = msg.caption?.toLowerCase().includes(searchLower);
        const matchesSender = msg.senderPushName
          ?.toLowerCase()
          .includes(searchLower);
        const matchesGroup = msg.groupName.toLowerCase().includes(searchLower);
        if (
          !matchesText &&
          !matchesCaption &&
          !matchesSender &&
          !matchesGroup
        ) {
          return false;
        }
      }

      // Type filter
      if (messageType !== 'all' && msg.messageType !== messageType) {
        return false;
      }

      // AI status filter
      if (aiStatus !== 'all' && msg.aiStatus !== aiStatus) {
        return false;
      }

      // Source filter
      if (source !== 'all' && msg.source !== source) {
        return false;
      }

      return true;
    });
  }, [allMessages, search, messageType, aiStatus, source]);

  // Derived state
  const hasFiltersApplied =
    search.length > 0 ||
    messageType !== 'all' ||
    aiStatus !== 'all' ||
    source !== 'all';
  const hasMessages = filteredMessages.length > 0;
  const hasNoResults = !hasMessages && hasFiltersApplied;
  const hasNoMessages = !hasMessages && !hasFiltersApplied;

  // Handlers
  const handleRefresh = useCallback(async () => {
    setIsRefetching(true);
    // TODO: Replace with actual query invalidation
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefetching(false);
    toast.success('Messages refreshed');
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearch('');
    setMessageType('all');
    setAIStatus('all');
    setSource('all');
  }, []);

  const handleViewMessage = useCallback((message: WhatsAppMessage) => {
    // TODO: Navigate to message detail or open modal
    toast.info(`Viewing message: ${message.messageId}`);
  }, []);

  const handleProcessAI = useCallback(async (message: WhatsAppMessage) => {
    setIsProcessing(true);
    // TODO: Replace with actual AI processing mutation
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsProcessing(false);
    toast.success('AI processing started');
  }, []);

  const handleRetryAI = useCallback(async (message: WhatsAppMessage) => {
    setIsProcessing(true);
    // TODO: Replace with actual retry mutation
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsProcessing(false);
    toast.success('AI processing retried');
  }, []);

  const handleDeleteMessage = useCallback(async (message: WhatsAppMessage) => {
    // TODO: Replace with actual delete mutation
    toast.success('Message deleted');
  }, []);

  const handleBulkProcess = useCallback(async (messages: WhatsAppMessage[]) => {
    setIsProcessing(true);
    // TODO: Replace with actual bulk processing mutation
    await new Promise(resolve => setTimeout(resolve, 2000));
    setIsProcessing(false);
    toast.success(`Processing ${messages.length} messages with AI`);
  }, []);

  const handleBulkDelete = useCallback(async (messages: WhatsAppMessage[]) => {
    // TODO: Replace with actual bulk delete mutation
    toast.success(`Deleted ${messages.length} messages`);
  }, []);

  const handleExport = useCallback(() => {
    // TODO: Implement export functionality
    toast.info('Export feature coming soon');
  }, []);

  // Show session required state if no active session
  if (!activeSession) {
    return <SessionRequiredState />;
  }

  return (
    <div className="p-6">
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
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Export
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export messages to CSV</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleRefresh}
                  disabled={isRefetching}
                  aria-label="Refresh messages"
                >
                  <RefreshCw
                    className={cn(
                      'h-4 w-4 transition-transform duration-500',
                      isRefetching && 'animate-spin',
                    )}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh messages</TooltipContent>
            </Tooltip>
            <Button
              size="sm"
              disabled={isProcessing}
              className="bg-linear-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
              onClick={() =>
                handleBulkProcess(
                  filteredMessages.filter(m => m.aiStatus === 'pending'),
                )
              }
            >
              <Sparkles
                className={cn(
                  'mr-1.5 h-3.5 w-3.5',
                  isProcessing && 'animate-pulse',
                )}
              />
              {isProcessing ? 'Processing...' : 'Process All Pending'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
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
        totalCount={allMessages.length}
        filteredCount={filteredMessages.length}
        className="mb-6"
      />

      {/* Content */}
      {isLoading ? (
        <MessagesSkeleton count={10} />
      ) : hasNoMessages ? (
        <MessagesEmptyState
          variant="no-messages"
          onSync={handleRefresh}
          isSyncing={isRefetching}
        />
      ) : hasNoResults ? (
        <MessagesEmptyState
          variant="no-results"
          onClearFilters={handleClearFilters}
          searchQuery={search}
        />
      ) : (
        <LoadingOverlay isLoading={isRefetching}>
          <MessagesDataTable
            data={filteredMessages}
            onView={handleViewMessage}
            onProcessAI={handleProcessAI}
            onRetryAI={handleRetryAI}
            onDelete={handleDeleteMessage}
            onBulkProcess={handleBulkProcess}
            onBulkDelete={handleBulkDelete}
            isProcessing={isProcessing}
            pageSize={20}
          />
        </LoadingOverlay>
      )}
    </div>
  );
}
