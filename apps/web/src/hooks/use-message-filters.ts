/**
 * Message Filters Hook
 *
 * Manages filter state for WhatsApp messages with automatic
 * cursor reset when filters change.
 */

import { useState, useCallback } from 'react';
import type { MessageType } from '@/components/whatsapp/messages/message-type-badge';
import type { AIStatus } from '@/components/whatsapp/messages/ai-status-badge';
import type { MessageSource } from '@/components/whatsapp/messages/messages-filter-panel';

export interface MessageFiltersState {
  search: string;
  messageType: MessageType | 'all';
  aiStatus: AIStatus | 'all';
  source: MessageSource;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
  pageSize: number;
  cursor: string | undefined;
}

export interface MessageFiltersActions {
  setSearch: (value: string) => void;
  setMessageType: (value: MessageType | 'all') => void;
  setAIStatus: (value: AIStatus | 'all') => void;
  setSource: (value: MessageSource) => void;
  setDateRange: (from: Date | undefined, to: Date | undefined) => void;
  setPageSize: (size: number) => void;
  setCursor: (cursor: string | undefined) => void;
  clearFilters: () => void;
  hasFiltersApplied: boolean;
}

const DEFAULT_FILTERS: MessageFiltersState = {
  search: '',
  messageType: 'all',
  aiStatus: 'all',
  source: 'all',
  dateFrom: undefined,
  dateTo: undefined,
  pageSize: 20,
  cursor: undefined,
};

export function useMessageFilters(): MessageFiltersState &
  MessageFiltersActions {
  const [filters, setFilters] = useState<MessageFiltersState>(DEFAULT_FILTERS);

  const setSearch = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, search: value, cursor: undefined }));
  }, []);

  const setMessageType = useCallback((value: MessageType | 'all') => {
    setFilters(prev => ({ ...prev, messageType: value, cursor: undefined }));
  }, []);

  const setAIStatus = useCallback((value: AIStatus | 'all') => {
    setFilters(prev => ({ ...prev, aiStatus: value, cursor: undefined }));
  }, []);

  const setSource = useCallback((value: MessageSource) => {
    setFilters(prev => ({ ...prev, source: value, cursor: undefined }));
  }, []);

  const setDateRange = useCallback(
    (from: Date | undefined, to: Date | undefined) => {
      setFilters(prev => ({
        ...prev,
        dateFrom: from,
        dateTo: to,
        cursor: undefined,
      }));
    },
    [],
  );

  const setPageSize = useCallback((size: number) => {
    setFilters(prev => ({ ...prev, pageSize: size, cursor: undefined }));
  }, []);

  const setCursor = useCallback((cursor: string | undefined) => {
    setFilters(prev => ({ ...prev, cursor }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const hasFiltersApplied =
    filters.search.length > 0 ||
    filters.messageType !== 'all' ||
    filters.aiStatus !== 'all' ||
    filters.source !== 'all' ||
    filters.dateFrom !== undefined ||
    filters.dateTo !== undefined;

  return {
    ...filters,
    setSearch,
    setMessageType,
    setAIStatus,
    setSource,
    setDateRange,
    setPageSize,
    setCursor,
    clearFilters,
    hasFiltersApplied,
  };
}
