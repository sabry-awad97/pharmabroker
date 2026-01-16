/**
 * AI Processor Service
 *
 * Service for processing WhatsApp messages with AI to extract structured data.
 * Uses the @pharmabroker/ai package for provider abstraction.
 */

import { ORPCError } from '@orpc/server';
import prisma from '@pharmabroker/db';
import {
  getAIClient,
  type AIClient,
  type MessageInput,
  type ProcessingResult,
} from '@pharmabroker/ai';
import type { AIStatus } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Types
// ============================================================================

export interface ProcessMessageResult {
  status: AIStatus;
  model: string | null;
  error: string | null;
  extractedCount: number;
}

export interface BulkProcessResult {
  queued: number;
  skipped: number;
  errors: string[];
}

// ============================================================================
// AI Processor Service
// ============================================================================

class AIProcessorService {
  private client: AIClient;

  constructor() {
    this.client = getAIClient();
  }

  /**
   * Process a single message with AI
   */
  async processMessage(
    userId: string,
    messageId: string,
  ): Promise<ProcessMessageResult> {
    // Get message and verify ownership
    const message = await prisma.whatsAppMessage.findFirst({
      where: {
        id: messageId,
        session: { userId },
      },
      include: {
        group: { select: { name: true } },
      },
    });

    if (!message) {
      throw new ORPCError('MESSAGE_NOT_FOUND', {
        message: 'Message not found',
      });
    }

    // Skip if already processed or processing
    if (message.aiStatus === 'completed' || message.aiStatus === 'processing') {
      return {
        status: message.aiStatus as AIStatus,
        model: message.aiModel,
        error: null,
        extractedCount: 0,
      };
    }

    // Skip messages without text content
    if (!message.text && !message.caption) {
      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: { aiStatus: 'skipped' },
      });

      return {
        status: 'skipped',
        model: null,
        error: null,
        extractedCount: 0,
      };
    }

    // Update status to processing
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { aiStatus: 'processing' },
    });

    try {
      // Build message input for AI
      const input: MessageInput = {
        id: message.id,
        text: message.text ?? message.caption ?? '',
        senderName: message.senderPushName ?? undefined,
        groupName: message.group.name,
        timestamp: message.messageTimestamp,
      };

      // Process with AI
      const result = await this.client.processMessage(input);

      if (result.status === 'failed') {
        await this.handleProcessingFailure(
          messageId,
          result.error ?? 'Unknown error',
        );
        return {
          status: 'failed',
          model: result.model,
          error: result.error ?? null,
          extractedCount: 0,
        };
      }

      // Store extracted data
      const extractedCount = await this.storeExtractions(messageId, result);

      // Update message status
      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          aiStatus: 'completed',
          aiModel: result.model,
          aiProcessedAt: new Date(),
          aiError: null,
        },
      });

      return {
        status: 'completed',
        model: result.model,
        error: null,
        extractedCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      await this.handleProcessingFailure(messageId, errorMessage);

      return {
        status: 'failed',
        model: this.client.modelName,
        error: errorMessage,
        extractedCount: 0,
      };
    }
  }

  /**
   * Process multiple messages in bulk
   */
  async bulkProcess(
    userId: string,
    messageIds: string[],
  ): Promise<BulkProcessResult> {
    const errors: string[] = [];
    let queued = 0;
    let skipped = 0;

    // Verify ownership of all messages
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        id: { in: messageIds },
        session: { userId },
      },
      select: {
        id: true,
        aiStatus: true,
        text: true,
        caption: true,
      },
    });

    const ownedIds = new Set(messages.map(m => m.id));

    for (const id of messageIds) {
      if (!ownedIds.has(id)) {
        errors.push(`Message ${id}: not found or unauthorized`);
        continue;
      }

      const message = messages.find(m => m.id === id);
      if (!message) continue;

      // Skip already processed
      if (
        message.aiStatus === 'completed' ||
        message.aiStatus === 'processing'
      ) {
        skipped++;
        continue;
      }

      // Skip messages without content
      if (!message.text && !message.caption) {
        await prisma.whatsAppMessage.update({
          where: { id },
          data: { aiStatus: 'skipped' },
        });
        skipped++;
        continue;
      }

      // Queue for processing (mark as pending)
      await prisma.whatsAppMessage.update({
        where: { id },
        data: { aiStatus: 'pending' },
      });
      queued++;
    }

    // Process queued messages asynchronously
    // In production, this would be handled by a job queue
    this.processQueuedMessages(
      userId,
      messages
        .filter(m => m.aiStatus === 'pending' && (m.text || m.caption))
        .map(m => m.id),
    ).catch(err => {
      console.error('[AI Processor] Bulk processing error:', err);
    });

    return { queued, skipped, errors };
  }

  /**
   * Retry a failed message
   */
  async retryMessage(
    userId: string,
    messageId: string,
  ): Promise<ProcessMessageResult> {
    // Get message and verify ownership
    const message = await prisma.whatsAppMessage.findFirst({
      where: {
        id: messageId,
        session: { userId },
      },
      select: { id: true, aiStatus: true },
    });

    if (!message) {
      throw new ORPCError('MESSAGE_NOT_FOUND', {
        message: 'Message not found',
      });
    }

    // Only retry failed messages
    if (message.aiStatus !== 'failed') {
      throw new ORPCError('INVALID_STATUS', {
        message: 'Only failed messages can be retried',
      });
    }

    // Reset status to pending
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        aiStatus: 'pending',
        aiError: null,
      },
    });

    // Process the message
    return this.processMessage(userId, messageId);
  }

  /**
   * Get pending messages for processing
   */
  async getPendingMessages(
    userId: string,
    limit: number = 100,
  ): Promise<string[]> {
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        session: { userId },
        aiStatus: 'pending',
        OR: [{ text: { not: null } }, { caption: { not: null } }],
      },
      select: { id: true },
      take: limit,
      orderBy: { messageTimestamp: 'desc' },
    });

    return messages.map(m => m.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async handleProcessingFailure(
    messageId: string,
    error: string,
  ): Promise<void> {
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        aiStatus: 'failed',
        aiError: error,
        aiRetryCount: { increment: 1 },
      },
    });
  }

  private async storeExtractions(
    messageId: string,
    result: ProcessingResult,
  ): Promise<number> {
    if (result.extractions.length === 0) return 0;

    const extractedData = result.extractions.map(extraction => ({
      messageId,
      dataType: extraction.type,
      data: JSON.parse(JSON.stringify(extraction.data)),
      confidence: extraction.confidence,
      model: result.model,
    }));

    await prisma.whatsAppExtractedData.createMany({
      data: extractedData,
    });

    return extractedData.length;
  }

  private async processQueuedMessages(
    userId: string,
    messageIds: string[],
  ): Promise<void> {
    for (const id of messageIds) {
      try {
        await this.processMessage(userId, id);
      } catch (error) {
        console.error(`[AI Processor] Failed to process message ${id}:`, error);
      }
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const aiProcessorService = new AIProcessorService();
export { AIProcessorService };
