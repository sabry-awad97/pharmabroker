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
  medicationSystemPrompt,
  medicationPromptTemplate,
} from '@pharmabroker/ai';
import {
  messageExtractionSchema,
  type MessageExtraction,
} from '@pharmabroker/schemas/ai';
import type { AIStatus } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Types
// ============================================================================

export interface ProcessMessageResult {
  status: AIStatus;
  model: string | null;
  error: string | null;
  extractedCount: number;
  data?: MessageExtraction;
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

      // Process with AI using medication extraction schema
      const result = await this.client.processMessage(input, {
        schema: messageExtractionSchema,
        systemPrompt: medicationSystemPrompt,
        promptTemplate: medicationPromptTemplate,
      });

      if (result.status === 'failed' || !result.data) {
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

      // Store extracted data and update status in a transaction
      const extractedCount = await prisma.$transaction(async tx => {
        // Store extracted data (result.data is guaranteed non-null here due to check above)
        const count = await this.storeExtractionDataImpl(
          tx,
          messageId,
          result.data!,
          result.model,
        );

        // Update message status
        await tx.whatsAppMessage.update({
          where: { id: messageId },
          data: {
            aiStatus: 'completed',
            aiModel: result.model,
            aiProcessedAt: new Date(),
            aiError: null,
          },
        });

        return count;
      });

      return {
        status: 'completed',
        model: result.model,
        error: null,
        extractedCount,
        data: result.data,
      };
    } catch (error) {
      const errorMessage = this.formatErrorWithStack(error);
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
   * Reprocess a completed message (re-run AI extraction)
   */
  async reprocessMessage(
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

    // Only reprocess completed messages
    if (message.aiStatus !== 'completed') {
      throw new ORPCError('INVALID_STATUS', {
        message: 'Only completed messages can be reprocessed',
      });
    }

    // Delete existing extracted data and reset status in a transaction
    await prisma.$transaction(async tx => {
      // Delete existing extracted data
      await tx.whatsAppExtractedData.deleteMany({
        where: { messageId },
      });

      // Reset status to pending
      await tx.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          aiStatus: 'pending',
          aiModel: null,
          aiProcessedAt: null,
          aiError: null,
        },
      });
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

  /**
   * Format error with full stack trace for debugging
   */
  private formatErrorWithStack(error: unknown): string {
    if (error instanceof Error) {
      const parts: string[] = [error.message];

      // Include the stack trace
      if (error.stack) {
        parts.push('\n\nStack trace:\n' + error.stack);
      }

      // Include cause if present (for chained errors)
      if (error.cause) {
        parts.push('\n\nCaused by: ' + this.formatErrorWithStack(error.cause));
      }

      // Include any additional properties from AI SDK errors
      const anyError = error as unknown as Record<string, unknown>;
      if (anyError.code) {
        parts.push(`\nError code: ${anyError.code}`);
      }
      if (anyError.status) {
        parts.push(`\nHTTP status: ${anyError.status}`);
      }
      if (anyError.responseBody) {
        parts.push(
          `\nResponse body: ${JSON.stringify(anyError.responseBody, null, 2)}`,
        );
      }

      return parts.join('');
    }

    if (typeof error === 'string') {
      return error;
    }

    return JSON.stringify(error, null, 2);
  }

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

  /**
   * Store extraction data (works with both prisma client and transaction)
   */
  private async storeExtractionDataImpl(
    db: { whatsAppExtractedData: typeof prisma.whatsAppExtractedData },
    messageId: string,
    data: MessageExtraction,
    model: string,
  ): Promise<number> {
    const extractedRecords = [];

    // Store the main extraction (intent, urgency, reason)
    extractedRecords.push({
      messageId,
      dataType: 'message_extraction',
      data: {
        intent: data.intent,
        urgency: data.urgency,
        reason: data.reason,
        medicationCount: data.medications.length,
      },
      confidence: 1.0,
      model,
    });

    // Store each medication as a separate record
    for (const medication of data.medications) {
      extractedRecords.push({
        messageId,
        dataType: 'medication',
        data: {
          name: medication.name,
          concentration: medication.concentration,
          form: medication.form,
          expiry: medication.expiry,
          reason: medication.reason,
        },
        confidence: medication.confidence,
        model,
      });
    }

    if (extractedRecords.length > 0) {
      await db.whatsAppExtractedData.createMany({
        data: extractedRecords,
      });
    }

    return extractedRecords.length;
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
