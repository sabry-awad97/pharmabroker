/**
 * AI Settings Hooks
 *
 * Query and mutation hooks for AI processing settings.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/utils/orpc';
import type {
  UserAISettings,
  UpdateAISettingsInput,
  AutoProcessStatsResponse,
} from '@pharmabroker/schemas/ai';

// ============================================================================
// Query Keys
// ============================================================================

export const aiSettingsKeys = {
  all: ['ai-settings'] as const,
  settings: () => [...aiSettingsKeys.all, 'settings'] as const,
  stats: () => [...aiSettingsKeys.all, 'stats'] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Get current AI settings
 */
export function useAISettings() {
  return useQuery({
    queryKey: aiSettingsKeys.settings(),
    queryFn: async (): Promise<UserAISettings | null> => {
      const response = await client.ai.settings.get({});
      return response;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Get auto-processing stats
 */
export function useAutoProcessStats() {
  return useQuery({
    queryKey: aiSettingsKeys.stats(),
    queryFn: async (): Promise<AutoProcessStatsResponse> => {
      const response = await client.ai.settings.stats({});
      return response;
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Update AI settings
 */
export function useUpdateAISettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      input: UpdateAISettingsInput,
    ): Promise<UserAISettings> => {
      const response = await client.ai.settings.update(input);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
    },
  });
}

/**
 * Toggle auto-processing on/off
 */
export function useToggleAutoProcess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<UserAISettings> => {
      const response = await client.ai.settings.toggle({});
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: aiSettingsKeys.all });
    },
  });
}
