/**
 * WhatsApp Groups TanStack Query Hooks
 *
 * Professional hooks for WhatsApp group management procedures.
 * Provides type-safe queries and mutations for groups and participants.
 */

import type {
  GroupFilterInput,
  GroupFilterType,
  ParticipantFilterInput,
  ParticipantRole,
  WhatsAppGroup,
  WhatsAppGroupParticipant,
  WhatsAppGroupWithParticipants,
} from '@pharmabroker/schemas/whatsapp';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { useCallback } from 'react';

import { orpc } from '../utils/orpc';

// ============================================================================
// Query Keys
// ============================================================================

export const whatsappGroupsKeys = {
  all: () => orpc.whatsapp.groups.key(),
  lists: () => [...whatsappGroupsKeys.all(), 'list'] as const,
  list: (filters: Partial<GroupFilterInput>) =>
    [...whatsappGroupsKeys.lists(), filters] as const,
  details: () => [...whatsappGroupsKeys.all(), 'detail'] as const,
  detail: (groupId: string) =>
    [...whatsappGroupsKeys.details(), groupId] as const,
  participants: () => [...whatsappGroupsKeys.all(), 'participants'] as const,
  participantList: (
    groupId: string,
    filters?: Partial<ParticipantFilterInput>,
  ) => [...whatsappGroupsKeys.participants(), groupId, filters] as const,
  counts: (sessionId?: string) =>
    [...whatsappGroupsKeys.all(), 'counts', sessionId] as const,
} as const;

// ============================================================================
// Group List Hooks
// ============================================================================

export interface UseWhatsappGroupsOptions {
  sessionId?: string;
  search?: string;
  filter?: GroupFilterType;
  limit?: number;
  enabled?: boolean;
}

/**
 * Fetch WhatsApp groups with filtering and pagination
 */
export function useWhatsappGroups(options: UseWhatsappGroupsOptions = {}) {
  const {
    sessionId,
    search,
    filter = 'all',
    limit = 50,
    enabled = true,
  } = options;

  return useInfiniteQuery({
    queryKey: whatsappGroupsKeys.list({ sessionId, search, filter }),
    queryFn: async ({ pageParam }) => {
      return orpc.whatsapp.groups.list.call({
        sessionId,
        search,
        filter,
        limit,
        cursor: pageParam,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Fetch all groups as a flat list (non-paginated for simpler use cases)
 */
export function useWhatsappGroupsFlat(options: UseWhatsappGroupsOptions = {}) {
  const {
    sessionId,
    search,
    filter = 'all',
    limit = 100,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: whatsappGroupsKeys.list({ sessionId, search, filter, limit }),
    queryFn: async () => {
      const result = await orpc.whatsapp.groups.list.call({
        sessionId,
        search,
        filter,
        limit,
      });
      return result.groups;
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

/**
 * Fetch WhatsApp groups with Suspense
 */
export function useWhatsappGroupsSuspense(
  options: Omit<UseWhatsappGroupsOptions, 'enabled'> = {},
) {
  const { sessionId, search, filter = 'all', limit = 100 } = options;

  return useSuspenseQuery({
    queryKey: whatsappGroupsKeys.list({ sessionId, search, filter, limit }),
    queryFn: async () => {
      const result = await orpc.whatsapp.groups.list.call({
        sessionId,
        search,
        filter,
        limit,
      });
      return result.groups;
    },
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Single Group Hooks
// ============================================================================

/**
 * Fetch a single WhatsApp group by ID with participants
 */
export function useWhatsappGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: whatsappGroupsKeys.detail(groupId!),
    queryFn: async () => {
      return orpc.whatsapp.groups.get.call({ groupId: groupId! });
    },
    enabled: !!groupId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch a single WhatsApp group with Suspense
 */
export function useWhatsappGroupSuspense(groupId: string) {
  return useSuspenseQuery({
    queryKey: whatsappGroupsKeys.detail(groupId),
    queryFn: async () => {
      return orpc.whatsapp.groups.get.call({ groupId });
    },
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Filter Counts Hook
// ============================================================================

export interface UseGroupFilterCountsOptions {
  sessionId?: string;
  enabled?: boolean;
}

/**
 * Fetch filter counts for WhatsApp groups (all, admin, archived, muted)
 */
export function useGroupFilterCounts(
  options: UseGroupFilterCountsOptions = {},
) {
  const { sessionId, enabled = true } = options;

  return useQuery({
    queryKey: whatsappGroupsKeys.counts(sessionId),
    queryFn: async () => {
      return orpc.whatsapp.groups.counts.call({ sessionId });
    },
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================================
// Participant Hooks
// ============================================================================

export interface UseGroupParticipantsOptions {
  groupId: string;
  search?: string;
  role?: ParticipantRole;
  limit?: number;
  enabled?: boolean;
}

/**
 * Fetch group participants with filtering and pagination
 */
export function useGroupParticipants(options: UseGroupParticipantsOptions) {
  const { groupId, search, role, limit = 50, enabled = true } = options;

  return useInfiniteQuery({
    queryKey: whatsappGroupsKeys.participantList(groupId, { search, role }),
    queryFn: async ({ pageParam }) => {
      return orpc.whatsapp.groups.participants.call({
        groupId,
        search,
        role,
        limit,
        cursor: pageParam,
      });
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.nextCursor,
    enabled: enabled && !!groupId,
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch all participants as a flat list
 */
export function useGroupParticipantsFlat(options: UseGroupParticipantsOptions) {
  const { groupId, search, role, limit = 100, enabled = true } = options;

  return useQuery({
    queryKey: whatsappGroupsKeys.participantList(groupId, {
      search,
      role,
      limit,
    }),
    queryFn: async () => {
      const result = await orpc.whatsapp.groups.participants.call({
        groupId,
        search,
        role,
        limit,
      });
      return result.participants;
    },
    enabled: enabled && !!groupId,
    staleTime: 30 * 1000,
  });
}

// ============================================================================
// Sync Mutation Hook
// ============================================================================

/**
 * Sync groups from WhatsApp
 */
export function useSyncGroups() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      return orpc.whatsapp.groups.sync.call({ sessionId });
    },
    onSuccess: (_, sessionId) => {
      // Invalidate all group queries for this session
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.lists(),
      });
      // Also invalidate individual group details
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.details(),
      });
      // Invalidate filter counts (both session-specific and global)
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.counts(sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: whatsappGroupsKeys.counts(undefined),
      });
    },
  });
}

// ============================================================================
// Utility Hooks
// ============================================================================

/**
 * Invalidate all group queries
 */
export function useInvalidateGroups() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: whatsappGroupsKeys.all() });
  }, [queryClient]);
}

/**
 * Prefetch groups for a session
 */
export function usePrefetchGroups() {
  const queryClient = useQueryClient();

  return useCallback(
    (sessionId?: string) => {
      queryClient.prefetchQuery({
        queryKey: whatsappGroupsKeys.list({ sessionId, filter: 'all' }),
        queryFn: async () => {
          const result = await orpc.whatsapp.groups.list.call({
            sessionId,
            filter: 'all',
            limit: 50,
          });
          return result.groups;
        },
      });
    },
    [queryClient],
  );
}

/**
 * Prefetch a single group
 */
export function usePrefetchGroup() {
  const queryClient = useQueryClient();

  return useCallback(
    (groupId: string) => {
      queryClient.prefetchQuery({
        queryKey: whatsappGroupsKeys.detail(groupId),
        queryFn: async () => {
          return orpc.whatsapp.groups.get.call({ groupId });
        },
      });
    },
    [queryClient],
  );
}

// ============================================================================
// Re-export types
// ============================================================================

export type {
  WhatsAppGroup,
  WhatsAppGroupParticipant,
  WhatsAppGroupWithParticipants,
  GroupFilterInput,
  GroupFilterType,
  ParticipantFilterInput,
  ParticipantRole,
  FilterCountsResponse,
} from '@pharmabroker/schemas/whatsapp';
