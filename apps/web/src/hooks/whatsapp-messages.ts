/**
 * WhatsApp Messages Hooks
 *
 * Query hooks for WhatsApp messages with placeholder implementations.
 * Replace with actual API calls when backend is ready.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { WhatsAppMessage } from '@/components/whatsapp/messages';
import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';

// ============================================================================
// Types
// ============================================================================

export interface MessageFilters {
  sessionId?: string;
  groupId?: string;
  search?: string;
  messageType?: MessageType | 'all';
  aiStatus?: AIStatus | 'all';
  source?: 'all' | 'realtime' | 'history';
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
}

export interface MessagesResponse {
  messages: WhatsAppMessage[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MessageDetail extends WhatsAppMessage {
  rawPayload?: Record<string, unknown>;
  extractedData?: ExtractedData[];
}

export interface ExtractedData {
  id: string;
  dataType: string;
  data: Record<string, unknown>;
  confidence: number;
  model: string | null;
  createdAt: Date;
}

export interface SyncMessagesResult {
  synced: number;
  errors: string[];
}

export interface ExportOptions {
  format: 'csv' | 'json';
  filters: MessageFilters;
  columns?: string[];
}

// ============================================================================
// Query Keys
// ============================================================================

export const messageKeys = {
  all: ['whatsapp-messages'] as const,
  lists: () => [...messageKeys.all, 'list'] as const,
  list: (filters: MessageFilters) => [...messageKeys.lists(), filters] as const,
  details: () => [...messageKeys.all, 'detail'] as const,
  detail: (id: string) => [...messageKeys.details(), id] as const,
  stats: (sessionId?: string) =>
    [...messageKeys.all, 'stats', sessionId] as const,
};

// ============================================================================
// Placeholder Data Generator
// ============================================================================

function generatePlaceholderMessages(
  filters: MessageFilters,
): MessagesResponse {
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
    'We need urgent delivery for the following items.',
    'Thank you for your quick response!',
  ];

  const totalCount = 150;
  const page = filters.page || 1;
  const pageSize = filters.pageSize || 20;

  // Generate all messages first
  const allMessages: WhatsAppMessage[] = Array.from(
    { length: totalCount },
    (_, i) => {
      const sender = senders[Math.floor(Math.random() * senders.length)];
      const group = groups[Math.floor(Math.random() * groups.length)];
      const type =
        messageTypes[Math.floor(Math.random() * messageTypes.length)];
      const aiStatus =
        aiStatuses[Math.floor(Math.random() * aiStatuses.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];
      const text =
        type === 'text'
          ? sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
          : null;
      const caption =
        type !== 'text' && Math.random() > 0.5
          ? sampleTexts[Math.floor(Math.random() * sampleTexts.length)]
          : null;

      return {
        id: `msg-${i + 1}`,
        messageId: `3EB0${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        sessionId: filters.sessionId || 'session-1',
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
        aiError: aiStatus === 'failed' ? 'Rate limit exceeded.' : null,
      };
    },
  );

  // Apply filters
  let filtered = allMessages;

  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(
      msg =>
        msg.text?.toLowerCase().includes(searchLower) ||
        msg.caption?.toLowerCase().includes(searchLower) ||
        msg.senderPushName?.toLowerCase().includes(searchLower) ||
        msg.groupName.toLowerCase().includes(searchLower),
    );
  }

  if (filters.messageType && filters.messageType !== 'all') {
    filtered = filtered.filter(msg => msg.messageType === filters.messageType);
  }

  if (filters.aiStatus && filters.aiStatus !== 'all') {
    filtered = filtered.filter(msg => msg.aiStatus === filters.aiStatus);
  }

  if (filters.source && filters.source !== 'all') {
    filtered = filtered.filter(msg => msg.source === filters.source);
  }

  if (filters.groupId) {
    filtered = filtered.filter(msg => msg.groupId === filters.groupId);
  }

  if (filters.dateFrom) {
    filtered = filtered.filter(
      msg => new Date(msg.messageTimestamp) >= filters.dateFrom!,
    );
  }

  if (filters.dateTo) {
    filtered = filtered.filter(
      msg => new Date(msg.messageTimestamp) <= filters.dateTo!,
    );
  }

  // Sort by timestamp descending
  filtered.sort(
    (a, b) =>
      new Date(b.messageTimestamp).getTime() -
      new Date(a.messageTimestamp).getTime(),
  );

  // Paginate
  const start = (page - 1) * pageSize;
  const paginated = filtered.slice(start, start + pageSize);

  return {
    messages: paginated,
    total: filtered.length,
    page,
    pageSize,
    totalPages: Math.ceil(filtered.length / pageSize),
  };
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch messages with filters and pagination
 */
export function useWhatsappMessages(filters: MessageFilters) {
  return useQuery({
    queryKey: messageKeys.list(filters),
    queryFn: async (): Promise<MessagesResponse> => {
      // TODO: Replace with actual API call
      // const response = await orpc.whatsapp.messages.list.query(filters);
      await new Promise(resolve => setTimeout(resolve, 500));
      return generatePlaceholderMessages(filters);
    },
    enabled: !!filters.sessionId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch single message detail
 */
export function useWhatsappMessage(messageId: string | undefined) {
  return useQuery({
    queryKey: messageKeys.detail(messageId || ''),
    queryFn: async (): Promise<MessageDetail> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 300));

      const messages = generatePlaceholderMessages({ page: 1, pageSize: 200 });
      const message = messages.messages.find(m => m.id === messageId);

      if (!message) {
        throw new Error('Message not found');
      }

      return {
        ...message,
        rawPayload: {
          key: { remoteJid: message.senderJid, id: message.messageId },
          message: { conversation: message.text },
          messageTimestamp: Math.floor(
            new Date(message.messageTimestamp).getTime() / 1000,
          ),
        },
        extractedData:
          message.aiStatus === 'completed'
            ? [
                {
                  id: `ext-${message.id}-1`,
                  dataType: 'intent',
                  data: { intent: 'order_inquiry', confidence: 0.92 },
                  confidence: 0.92,
                  model: 'gpt-4o',
                  createdAt: new Date(),
                },
                {
                  id: `ext-${message.id}-2`,
                  dataType: 'entities',
                  data: {
                    products: ['Paracetamol 500mg'],
                    quantities: [100],
                  },
                  confidence: 0.88,
                  model: 'gpt-4o',
                  createdAt: new Date(),
                },
              ]
            : [],
      };
    },
    enabled: !!messageId,
  });
}

/**
 * Get message statistics
 */
export function useMessageStats(sessionId?: string) {
  return useQuery({
    queryKey: messageKeys.stats(sessionId),
    queryFn: async () => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 200));
      return {
        total: 150,
        pending: 45,
        processing: 3,
        completed: 85,
        failed: 12,
        skipped: 5,
        byType: {
          text: 80,
          image: 30,
          video: 15,
          audio: 10,
          document: 10,
          other: 5,
        },
        bySource: {
          realtime: 60,
          history: 90,
        },
      };
    },
    enabled: !!sessionId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Sync messages from WhatsApp
 */
export function useSyncMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<SyncMessagesResult> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { synced: 25, errors: [] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}

/**
 * Process single message with AI
 */
export function useProcessMessageAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1500));
    },
    onSuccess: (_, messageId) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.detail(messageId),
      });
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
    },
  });
}

/**
 * Bulk process messages with AI
 */
export function useBulkProcessAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      messageIds: string[],
    ): Promise<{ processed: number; errors: string[] }> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { processed: messageIds.length, errors: [] };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
    },
  });
}

/**
 * Retry AI processing for failed message
 */
export function useRetryAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1500));
    },
    onSuccess: (_, messageId) => {
      queryClient.invalidateQueries({
        queryKey: messageKeys.detail(messageId),
      });
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
    },
  });
}

/**
 * Delete single message
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<void> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 500));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
    },
  });
}

/**
 * Bulk delete messages
 */
export function useBulkDeleteMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageIds: string[]): Promise<{ deleted: number }> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { deleted: messageIds.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.lists() });
    },
  });
}

/**
 * Export messages
 */
export function useExportMessages() {
  return useMutation({
    mutationFn: async (options: ExportOptions): Promise<Blob> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      const data = generatePlaceholderMessages(options.filters);

      if (options.format === 'json') {
        return new Blob([JSON.stringify(data.messages, null, 2)], {
          type: 'application/json',
        });
      }

      // CSV format
      const headers = [
        'ID',
        'Sender',
        'Group',
        'Type',
        'Text',
        'Timestamp',
        'AI Status',
      ];
      const rows = data.messages.map(m => [
        m.messageId,
        m.senderPushName || m.senderJid,
        m.groupName,
        m.messageType,
        m.text || m.caption || '',
        new Date(m.messageTimestamp).toISOString(),
        m.aiStatus,
      ]);

      const csv = [headers, ...rows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');
      return new Blob([csv], { type: 'text/csv' });
    },
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Invalidate all message queries
 */
export function useInvalidateMessages() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: messageKeys.all });
  }, [queryClient]);
}
