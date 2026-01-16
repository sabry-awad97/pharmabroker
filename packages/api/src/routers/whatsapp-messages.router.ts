/**
 * WhatsApp Messages Router
 *
 * Type-safe oRPC router for WhatsApp message management.
 * Delegates business logic to WhatsAppMessagesService.
 * Messages are stored in PostgreSQL via Prisma.
 */

import {
  messageFilterInput,
  messageIdInput,
  bulkDeleteInput,
  exportMessagesInput,
  messagesListResponse,
  whatsAppMessageDetail,
  messageStatsResponse,
  bulkDeleteResponse,
  exportMessagesResponse,
  messageStatsInput,
  processMessageInput,
  bulkProcessInput,
  processMessageResponse,
  bulkProcessResponse,
  syncMessagesInput,
  syncMessagesResponse,
} from '@pharmabroker/schemas/whatsapp';

import { o, protectedProcedure } from '..';
import { whatsappMessagesService } from '../services/whatsapp-messages.service';
import { aiProcessorService } from '../services/ai-processor.service';

// ============================================================================
// WhatsApp Messages Router
// ============================================================================

export const whatsappMessagesRouter = o.router({
  // ─────────────────────────────────────────────────────────────────────────
  // Message Queries
  // ─────────────────────────────────────────────────────────────────────────

  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/messages',
        tags: ['WhatsApp Messages'],
        summary: 'List WhatsApp messages',
        description:
          'Returns a paginated list of WhatsApp messages with optional filtering by session, group, type, AI status, source, date range, and search.',
      },
    })
    .input(messageFilterInput)
    .output(messagesListResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.listMessages(userId, input);
    }),

  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/messages/{messageId}',
        tags: ['WhatsApp Messages'],
        summary: 'Get a WhatsApp message',
        description:
          'Returns details of a specific WhatsApp message including extracted data and raw payload.',
      },
    })
    .input(messageIdInput)
    .output(whatsAppMessageDetail)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.getMessage(userId, input.messageId);
    }),

  stats: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/messages/stats',
        tags: ['WhatsApp Messages'],
        summary: 'Get message statistics',
        description: 'Returns message counts by type, AI status, and source.',
      },
    })
    .input(messageStatsInput)
    .output(messageStatsResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.getMessageStats(userId, input.sessionId);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Message Mutations
  // ─────────────────────────────────────────────────────────────────────────

  delete: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/whatsapp/messages/{messageId}',
        tags: ['WhatsApp Messages'],
        summary: 'Delete a WhatsApp message',
        description:
          'Deletes a specific WhatsApp message and its extracted data.',
      },
    })
    .input(messageIdInput)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      await whatsappMessagesService.deleteMessage(userId, input.messageId);
      return { success: true as const };
    }),

  bulkDelete: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/bulk-delete',
        tags: ['WhatsApp Messages'],
        summary: 'Bulk delete WhatsApp messages',
        description: 'Deletes multiple WhatsApp messages at once.',
      },
    })
    .input(bulkDeleteInput)
    .output(bulkDeleteResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.bulkDeleteMessages(
        userId,
        input.messageIds,
      );
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Export
  // ─────────────────────────────────────────────────────────────────────────

  export: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/export',
        tags: ['WhatsApp Messages'],
        summary: 'Export WhatsApp messages',
        description:
          'Exports messages to JSON or CSV format with optional filtering.',
      },
    })
    .input(exportMessagesInput)
    .output(exportMessagesResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.exportMessages(userId, input);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Sync
  // ─────────────────────────────────────────────────────────────────────────

  sync: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/sync',
        tags: ['WhatsApp Messages'],
        summary: 'Get message sync status',
        description:
          'Returns the count of messages synced from WhatsApp history. History sync happens automatically when a session connects. Session must be connected.',
      },
    })
    .input(syncMessagesInput)
    .output(syncMessagesResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappMessagesService.getSyncStatus(userId, input.sessionId);
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // AI Processing
  // ─────────────────────────────────────────────────────────────────────────

  processAI: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/{messageId}/process',
        tags: ['WhatsApp Messages'],
        summary: 'Process message with AI',
        description:
          'Processes a single message with AI to extract structured data.',
      },
    })
    .input(processMessageInput)
    .output(processMessageResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      const result = await aiProcessorService.processMessage(
        userId,
        input.messageId,
      );
      return {
        status: result.status,
        model: result.model,
        error: result.error,
      };
    }),

  bulkProcessAI: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/bulk-process',
        tags: ['WhatsApp Messages'],
        summary: 'Bulk process messages with AI',
        description: 'Queues multiple messages for AI processing.',
      },
    })
    .input(bulkProcessInput)
    .output(bulkProcessResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return aiProcessorService.bulkProcess(userId, input.messageIds);
    }),

  retryAI: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/messages/{messageId}/retry',
        tags: ['WhatsApp Messages'],
        summary: 'Retry failed AI processing',
        description: 'Retries AI processing for a failed message.',
      },
    })
    .input(processMessageInput)
    .output(processMessageResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      const result = await aiProcessorService.retryMessage(
        userId,
        input.messageId,
      );
      return {
        status: result.status,
        model: result.model,
        error: result.error,
      };
    }),
});
