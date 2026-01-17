/**
 * WhatsApp Messages Hooks
 *
 * Query and mutation hooks for WhatsApp messages using oRPC API.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';
import { client } from '@/utils/orpc';
import type {
  WhatsAppMessageWithGroup,
  WhatsAppMessageDetail,
  WhatsAppExtractedData,
  MessageStatsResponse,
  MessagesListResponse,
  SyncMessagesResponse,
  ProcessMessageResponse,
  BulkProcessResponse,
  BulkDeleteResponse,
  ExportMessagesResponse,
  ScheduleProcessingResponse,
  CancelScheduleResponse,
  ScheduledMessagesResponse,
} from '@pharmabroker/schemas/whatsapp';

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
  limit?: number;
  cursor?: string;
}

export interface MessagesResponse {
  messages: WhatsAppMessageWithGroup[];
  nextCursor?: string;
  total: number;
}

export interface MessageDetail extends WhatsAppMessageDetail {}

export interface ExtractedData extends WhatsAppExtractedData {}

export interface SyncMessagesResult extends SyncMessagesResponse {}

export interface ExportOptions {
  format: 'csv' | 'json';
  sessionId?: string;
  groupId?: string;
  messageType?: MessageType;
  aiStatus?: AIStatus;
  source?: 'realtime' | 'history';
  dateFrom?: Date;
  dateTo?: Date;
}

// Re-export types for backward compatibility
export type { WhatsAppMessageWithGroup as WhatsAppMessage } from '@pharmabroker/schemas/whatsapp';

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
// Query Hooks
// ============================================================================

/**
 * Fetch messages with filters and pagination
 */
export function useWhatsappMessages(filters: MessageFilters) {
  return useQuery({
    queryKey: messageKeys.list(filters),
    queryFn: async (): Promise<MessagesResponse> => {
      const response = await client.whatsapp.messages.list({
        sessionId: filters.sessionId,
        groupId: filters.groupId,
        search: filters.search,
        messageType:
          filters.messageType && filters.messageType !== 'all'
            ? (filters.messageType as
                | 'text'
                | 'image'
                | 'video'
                | 'audio'
                | 'document'
                | 'sticker'
                | 'contact'
                | 'location'
                | 'poll'
                | 'reaction'
                | 'protocol'
                | 'unknown')
            : undefined,
        aiStatus:
          filters.aiStatus && filters.aiStatus !== 'all'
            ? (filters.aiStatus as
                | 'pending'
                | 'processing'
                | 'completed'
                | 'failed'
                | 'skipped')
            : undefined,
        source:
          filters.source && filters.source !== 'all'
            ? (filters.source as 'realtime' | 'history')
            : undefined,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        limit: filters.limit,
        cursor: filters.cursor,
      });
      return response;
    },
    enabled: !!filters.sessionId,
    staleTime: 30 * 1000,
    // Keep previous data while fetching next page to prevent UI flicker
    placeholderData: previousData => previousData,
  });
}

/**
 * Fetch single message detail
 */
export function useWhatsappMessage(messageId: string | undefined) {
  return useQuery({
    queryKey: messageKeys.detail(messageId || ''),
    queryFn: async (): Promise<MessageDetail> => {
      if (!messageId) {
        throw new Error('Message ID is required');
      }
      const response = await client.whatsapp.messages.get({
        messageId,
      });
      return response;
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
    queryFn: async (): Promise<MessageStatsResponse> => {
      const response = await client.whatsapp.messages.stats({
        sessionId,
      });
      return response;
    },
    enabled: !!sessionId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Sync messages from WhatsApp (get sync status)
 */
export function useSyncMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<SyncMessagesResult> => {
      const response = await client.whatsapp.messages.sync({
        sessionId,
      });
      return response;
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
    mutationFn: async (messageId: string): Promise<ProcessMessageResponse> => {
      const response = await client.whatsapp.messages.processAI({
        messageId,
      });
      return response;
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
    mutationFn: async (messageIds: string[]): Promise<BulkProcessResponse> => {
      const response = await client.whatsapp.messages.bulkProcessAI({
        messageIds,
      });
      return response;
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
    mutationFn: async (messageId: string): Promise<ProcessMessageResponse> => {
      const response = await client.whatsapp.messages.retryAI({
        messageId,
      });
      return response;
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
 * Reprocess AI for completed message (re-run extraction)
 */
export function useReprocessAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string): Promise<ProcessMessageResponse> => {
      const response = await client.whatsapp.messages.reprocessAI({
        messageId,
      });
      return response;
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
      await client.whatsapp.messages.delete({
        messageId,
      });
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
    mutationFn: async (messageIds: string[]): Promise<BulkDeleteResponse> => {
      const response = await client.whatsapp.messages.bulkDelete({
        messageIds,
      });
      return response;
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
      const response = await client.whatsapp.messages.export({
        format: options.format,
        sessionId: options.sessionId,
        groupId: options.groupId,
        messageType: options.messageType as
          | 'text'
          | 'image'
          | 'video'
          | 'audio'
          | 'document'
          | 'sticker'
          | 'contact'
          | 'location'
          | 'poll'
          | 'reaction'
          | 'protocol'
          | 'unknown'
          | undefined,
        aiStatus: options.aiStatus as
          | 'pending'
          | 'processing'
          | 'completed'
          | 'failed'
          | 'skipped'
          | undefined,
        source: options.source,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
      });

      // Decode base64 data to Blob
      const binaryString = atob(response.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: response.contentType });
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

// ============================================================================
// Scheduling Hooks
// ============================================================================

export const schedulingKeys = {
  all: ['whatsapp-scheduling'] as const,
  scheduled: (sessionId?: string) =>
    [...schedulingKeys.all, 'scheduled', sessionId] as const,
};

/**
 * Schedule AI processing for messages
 */
export function useScheduleAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      messageIds,
      scheduledFor,
      priority = 0,
    }: {
      messageIds: string[];
      scheduledFor: Date;
      priority?: number;
    }): Promise<ScheduleProcessingResponse> => {
      const response = await client.whatsapp.messages.scheduleAI({
        messageIds,
        scheduledFor,
        priority,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

/**
 * Cancel scheduled AI processing
 */
export function useCancelScheduleAI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      messageIds: string[],
    ): Promise<CancelScheduleResponse> => {
      const response = await client.whatsapp.messages.cancelScheduleAI({
        messageIds,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}

/**
 * Get scheduled messages
 */
export function useScheduledMessages(sessionId?: string, limit?: number) {
  return useQuery({
    queryKey: schedulingKeys.scheduled(sessionId),
    queryFn: async (): Promise<ScheduledMessagesResponse> => {
      const response = await client.whatsapp.messages.scheduledMessages({
        sessionId,
        limit,
      });
      return response;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Process due scheduled messages
 */
export function useProcessDueScheduled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ processed: number }> => {
      const response = await client.whatsapp.messages.processDueScheduled({});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: messageKeys.all });
      queryClient.invalidateQueries({ queryKey: schedulingKeys.all });
    },
  });
}
