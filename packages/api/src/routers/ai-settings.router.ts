/**
 * AI Settings Router
 *
 * Type-safe oRPC router for user AI processing settings.
 */

import {
  updateAISettingsInput,
  aiSettingsResponse,
  autoProcessStatsResponse,
} from '@pharmabroker/schemas/ai';
import prisma, { Prisma } from '@pharmabroker/db';

import { o, protectedProcedure } from '..';
import { autoProcessorService } from '../services/auto-processor.service';

// ============================================================================
// AI Settings Router
// ============================================================================

export const aiSettingsRouter = o.router({
  // ─────────────────────────────────────────────────────────────────────────
  // Get Settings
  // ─────────────────────────────────────────────────────────────────────────

  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/ai/settings',
        tags: ['AI Settings'],
        summary: 'Get AI settings',
        description: 'Returns the current user AI processing settings.',
      },
    })
    .output(aiSettingsResponse.nullable())
    .handler(async ({ context }) => {
      const userId = context.session!.user.id;

      const settings = await prisma.userAISettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        return null;
      }

      return {
        ...settings,
        enabledSessionIds: settings.enabledSessionIds as string[] | null,
        enabledGroupIds: settings.enabledGroupIds as string[] | null,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Update Settings
  // ─────────────────────────────────────────────────────────────────────────

  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/ai/settings',
        tags: ['AI Settings'],
        summary: 'Update AI settings',
        description: 'Updates the user AI processing settings.',
      },
    })
    .input(updateAISettingsInput)
    .output(aiSettingsResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Transform input for Prisma JSON fields
      const createData: Prisma.UserAISettingsCreateInput = {
        user: { connect: { id: userId } },
        autoProcessEnabled: input.autoProcessEnabled,
        autoProcessRealtime: input.autoProcessRealtime,
        autoProcessHistory: input.autoProcessHistory,
        processTextOnly: input.processTextOnly,
        minTextLength: input.minTextLength,
        excludeFromMe: input.excludeFromMe,
        maxProcessPerMinute: input.maxProcessPerMinute,
        maxProcessPerHour: input.maxProcessPerHour,
        enabledSessionIds:
          input.enabledSessionIds === null
            ? Prisma.JsonNull
            : input.enabledSessionIds,
        enabledGroupIds:
          input.enabledGroupIds === null
            ? Prisma.JsonNull
            : input.enabledGroupIds,
      };

      const updateData: Prisma.UserAISettingsUpdateInput = {
        autoProcessEnabled: input.autoProcessEnabled,
        autoProcessRealtime: input.autoProcessRealtime,
        autoProcessHistory: input.autoProcessHistory,
        processTextOnly: input.processTextOnly,
        minTextLength: input.minTextLength,
        excludeFromMe: input.excludeFromMe,
        maxProcessPerMinute: input.maxProcessPerMinute,
        maxProcessPerHour: input.maxProcessPerHour,
        enabledSessionIds:
          input.enabledSessionIds === null
            ? Prisma.JsonNull
            : input.enabledSessionIds,
        enabledGroupIds:
          input.enabledGroupIds === null
            ? Prisma.JsonNull
            : input.enabledGroupIds,
      };

      const settings = await prisma.userAISettings.upsert({
        where: { userId },
        create: createData,
        update: updateData,
      });

      // Invalidate the settings cache
      autoProcessorService.invalidateSettingsCache(userId);

      return {
        ...settings,
        enabledSessionIds: settings.enabledSessionIds as string[] | null,
        enabledGroupIds: settings.enabledGroupIds as string[] | null,
      };
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Get Stats
  // ─────────────────────────────────────────────────────────────────────────

  stats: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/ai/settings/stats',
        tags: ['AI Settings'],
        summary: 'Get auto-processing stats',
        description:
          'Returns statistics about auto-processing for the current user.',
      },
    })
    .output(autoProcessStatsResponse)
    .handler(async ({ context }) => {
      const userId = context.session!.user.id;
      return autoProcessorService.getStats(userId);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Toggle Auto-Processing
  // ─────────────────────────────────────────────────────────────────────────

  toggle: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/ai/settings/toggle',
        tags: ['AI Settings'],
        summary: 'Toggle auto-processing',
        description: 'Quickly enable or disable auto-processing.',
      },
    })
    .output(aiSettingsResponse)
    .handler(async ({ context }) => {
      const userId = context.session!.user.id;

      // Get current settings or create default
      const current = await prisma.userAISettings.findUnique({
        where: { userId },
      });

      const newEnabled = current ? !current.autoProcessEnabled : true;

      const settings = await prisma.userAISettings.upsert({
        where: { userId },
        create: {
          user: { connect: { id: userId } },
          autoProcessEnabled: newEnabled,
        },
        update: {
          autoProcessEnabled: newEnabled,
        },
      });

      // Invalidate the settings cache
      autoProcessorService.invalidateSettingsCache(userId);

      return {
        ...settings,
        enabledSessionIds: settings.enabledSessionIds as string[] | null,
        enabledGroupIds: settings.enabledGroupIds as string[] | null,
      };
    }),
});
