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
import type {
  AIStatus,
  WhatsAppMessageWithGroup,
} from '@pharmabroker/schemas/whatsapp';
import { logger } from '@pharmabroker/logger';
import {
  aiProcessingTotal,
  aiProcessingDuration,
  aiDeduplicationRate,
  recordError,
} from '@pharmabroker/metrics';
import { calculateBackoffWithJitter } from '../utils/backoff';
import { CircuitBreaker, CircuitBreakerError } from '../utils/circuit-breaker';

// ============================================================================
// Types
// ============================================================================

export interface ProcessMessageResult {
  status: AIStatus;
  model: string | null;
  error: string | null;
  extractedCount: number;
  wasReused?: boolean; // True if result was reused from existing message
  data?: MessageExtraction;
}

export interface BulkProcessResult {
  queued: number;
  skipped: number;
  errors: string[];
}

export interface ScheduleResult {
  scheduled: number;
  skipped: number;
  scheduledFor: Date;
}

export interface CancelScheduleResult {
  cancelled: number;
}

// ============================================================================
// Configuration
// ============================================================================

const AI_RETRY_CONFIG = {
  /** Maximum number of retry attempts for AI processing */
  MAX_RETRIES: 3,
  /** Initial delay for first retry (ms) */
  INITIAL_DELAY_MS: 1000,
  /** Maximum delay cap (ms) */
  MAX_DELAY_MS: 30_000,
  /** Timeout for AI requests (ms) - 60 seconds for cold starts */
  REQUEST_TIMEOUT_MS: 60_000,
} as const;

// ============================================================================
// AI Processor Service
// ============================================================================

class AIProcessorService {
  private client: AIClient;
  private log = logger.child('ai-processor');
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = getAIClient();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60_000, // 1 minute
      name: 'AI-Service',
    });
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

    // Check for existing AI results with same content hash (deduplication)
    if (message.contentHash) {
      const existingResult = await this.findExistingAIResult(
        userId,
        message.contentHash,
        messageId,
      );

      if (existingResult) {
        this.log.info('Reusing AI result for content hash', {
          contentHash: message.contentHash,
          messageId,
          sourceMessageId: existingResult.sourceMessageId,
        });

        // Copy extracted data from existing message
        const copiedCount = await this.copyExtractedData(
          existingResult.sourceMessageId,
          messageId,
        );

        // Update message status
        await prisma.whatsAppMessage.update({
          where: { id: messageId },
          data: {
            aiStatus: 'completed',
            aiModel: existingResult.model,
            aiProcessedAt: new Date(),
            aiError: null,
          },
        });

        return {
          status: 'completed',
          model: existingResult.model,
          error: null,
          extractedCount: copiedCount,
          wasReused: true,
        };
      }
    }

    // No existing result - process with AI
    // Update status to processing
    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: { aiStatus: 'processing' },
    });

    const startTime = Date.now();

    try {
      // Build message input for AI
      const input: MessageInput = {
        id: message.id,
        text: message.text ?? message.caption ?? '',
        senderName: message.senderPushName ?? undefined,
        groupName: message.group.name,
        timestamp: message.messageTimestamp,
      };

      this.log.debug('Processing message with AI', {
        messageId,
        messageType: message.messageType,
        groupName: message.group.name,
      });

      // Process with AI using retry logic and circuit breaker
      const result = await this.processWithRetry(input, message.aiRetryCount);

      const duration = Date.now() - startTime;

      if (result.status === 'failed' || !result.data) {
        // Record failure metrics
        aiProcessingTotal.inc({
          provider: this.client.modelName,
          status: 'failed',
        });
        aiProcessingDuration.observe(
          { provider: this.client.modelName, status: 'failed' },
          duration / 1000,
        );

        this.log.error('AI processing failed', {
          messageId,
          error: result.error,
          duration,
        });

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

      // Record success metrics
      aiProcessingTotal.inc({
        provider: this.client.modelName,
        status: 'success',
      });
      aiProcessingDuration.observe(
        { provider: this.client.modelName, status: 'success' },
        duration / 1000,
      );

      this.log.info('AI processing completed', {
        messageId,
        model: result.model,
        extractedCount: result.data.medications.length,
        duration,
      });

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
        wasReused: false,
        data: result.data,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = this.formatErrorWithStack(error);

      // Record error metrics
      aiProcessingTotal.inc({
        provider: this.client.modelName,
        status: 'error',
      });
      aiProcessingDuration.observe(
        { provider: this.client.modelName, status: 'error' },
        duration / 1000,
      );
      recordError('ai_processing', 'high');

      this.log.error('AI processing exception', {
        messageId,
        error: errorMessage,
        duration,
      });

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
      this.log.error('Bulk processing error', { error: err.message });
      recordError('bulk_processing', 'medium');
    });

    return { queued, skipped, errors };
  }

  /**
   * Process multiple messages in bulk with content-based deduplication
   * Groups messages by content hash and processes once per unique content
   *
   * @param userId - User ID for authorization
   * @param messageIds - Array of message IDs to process
   * @returns Result with queued, skipped, deduplicated counts and errors
   */
  async bulkProcessOptimized(
    userId: string,
    messageIds: string[],
  ): Promise<BulkProcessResult & { deduplicated: number }> {
    const errors: string[] = [];
    let queued = 0;
    let skipped = 0;
    let deduplicated = 0;

    // Fetch messages with content hashes
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
        contentHash: true,
      },
    });

    // Group messages by content hash
    const contentGroups = new Map<string, string[]>();
    const noHashMessages: string[] = [];

    for (const message of messages) {
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
          where: { id: message.id },
          data: { aiStatus: 'skipped' },
        });
        skipped++;
        continue;
      }

      if (!message.contentHash) {
        noHashMessages.push(message.id);
      } else {
        const group = contentGroups.get(message.contentHash) || [];
        group.push(message.id);
        contentGroups.set(message.contentHash, group);
      }
    }

    // Process one message per content group
    for (const [contentHash, messageIdsInGroup] of contentGroups.entries()) {
      if (messageIdsInGroup.length === 0) continue;

      const primaryMessageId = messageIdsInGroup[0]!;

      try {
        // Process first message in group
        await this.processMessage(userId, primaryMessageId);
        queued++;

        // Copy results to other messages with same content
        if (messageIdsInGroup.length > 1) {
          for (let i = 1; i < messageIdsInGroup.length; i++) {
            const targetId = messageIdsInGroup[i]!;

            await this.copyExtractedData(primaryMessageId, targetId);

            await prisma.whatsAppMessage.update({
              where: { id: targetId },
              data: {
                aiStatus: 'completed',
                aiProcessedAt: new Date(),
              },
            });

            deduplicated++;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Content group ${contentHash}: ${errorMsg}`);
      }
    }

    // Process messages without hash normally
    for (const id of noHashMessages) {
      try {
        await this.processMessage(userId, id);
        queued++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Message ${id}: ${errorMsg}`);
      }
    }

    this.log.info('Bulk processing complete', {
      queued,
      deduplicated,
      skipped,
      totalMessages: messages.length,
    });

    // Calculate deduplication metrics
    const totalProcessed = queued + deduplicated;
    const deduplicationRate =
      totalProcessed > 0 ? (deduplicated / totalProcessed) * 100 : 0;
    const apiCallsSaved = deduplicated;

    // Update deduplication rate metric
    if (totalProcessed > 0) {
      aiDeduplicationRate.set(deduplicated / totalProcessed);
    }

    this.log.info('Deduplication metrics', {
      deduplicationRate: `${deduplicationRate.toFixed(1)}%`,
      apiCallsSaved,
      totalProcessed,
    });

    return { queued, skipped, deduplicated, errors };
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
  // Scheduling Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Schedule messages for AI processing at a specific time
   */
  async scheduleProcessing(
    userId: string,
    messageIds: string[],
    scheduledFor: Date,
    priority: number = 0,
  ): Promise<ScheduleResult> {
    let scheduled = 0;
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
        skipped++;
        continue;
      }

      const message = messages.find(m => m.id === id);
      if (!message) {
        skipped++;
        continue;
      }

      // Skip already processed or processing
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

      // Schedule the message
      await prisma.whatsAppMessage.update({
        where: { id },
        data: {
          aiStatus: 'scheduled' as const,
          aiScheduledFor: scheduledFor,
          aiScheduledAt: new Date(),
          aiPriority: priority,
          aiError: null,
        } as Parameters<typeof prisma.whatsAppMessage.update>[0]['data'],
      });
      scheduled++;
    }

    return { scheduled, skipped, scheduledFor };
  }

  /**
   * Cancel scheduled processing for messages
   */
  async cancelSchedule(
    userId: string,
    messageIds: string[],
  ): Promise<CancelScheduleResult> {
    // Update only scheduled messages owned by user
    const result = await prisma.whatsAppMessage.updateMany({
      where: {
        id: { in: messageIds },
        session: { userId },
        aiStatus: 'scheduled' as const,
      },
      data: {
        aiStatus: 'pending',
        aiScheduledFor: null,
        aiScheduledAt: null,
        aiPriority: 0,
      } as Parameters<typeof prisma.whatsAppMessage.updateMany>[0]['data'],
    });

    return { cancelled: result.count };
  }

  /**
   * Get scheduled messages for a user
   */
  async getScheduledMessages(
    userId: string,
    sessionId?: string,
    limit: number = 50,
  ): Promise<{
    messages: WhatsAppMessageWithGroup[];
    total: number;
  }> {
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        session: { userId },
        ...(sessionId && { sessionId }),
        aiStatus: 'scheduled' as const,
      },
      include: {
        group: {
          select: { id: true, name: true, jid: true },
        },
        participant: {
          select: { id: true, displayName: true, jid: true },
        },
      },
      take: limit,
      orderBy: [{ aiPriority: 'desc' }, { aiScheduledFor: 'asc' }],
    });

    // Cast to match the expected schema type
    return {
      messages: messages as unknown as WhatsAppMessageWithGroup[],
      total: messages.length,
    };
  }

  /**
   * Process due scheduled messages (called by scheduler/cron)
   */
  async processDueScheduledMessages(userId: string): Promise<number> {
    const now = new Date();

    // Get messages that are due for processing
    const dueMessages = await prisma.whatsAppMessage.findMany({
      where: {
        session: { userId },
        aiStatus: 'scheduled' as const,
        aiScheduledFor: { lte: now },
      },
      select: { id: true },
      orderBy: [{ aiPriority: 'desc' }, { aiScheduledFor: 'asc' }],
      take: 50, // Process in batches
    });

    if (dueMessages.length === 0) {
      return 0;
    }

    // Process each message
    let processed = 0;
    for (const message of dueMessages) {
      try {
        // Clear scheduling fields before processing
        await prisma.whatsAppMessage.update({
          where: { id: message.id },
          data: {
            aiScheduledFor: null,
            aiScheduledAt: null,
            aiPriority: 0,
          } as Parameters<typeof prisma.whatsAppMessage.update>[0]['data'],
        });

        await this.processMessage(userId, message.id);
        processed++;
      } catch (error) {
        console.error(
          `[AI Processor] Failed to process scheduled message ${message.id}:`,
          error,
        );
      }
    }

    return processed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process message with AI using retry logic and circuit breaker
   *
   * @param input - Message input for AI processing
   * @param currentRetryCount - Current retry count from database
   * @returns AI processing result
   */
  private async processWithRetry(
    input: MessageInput,
    currentRetryCount: number,
  ): Promise<{
    status: 'completed' | 'failed';
    model: string;
    error?: string;
    data?: MessageExtraction;
  }> {
    let lastError: Error | null = null;
    const maxRetries = AI_RETRY_CONFIG.MAX_RETRIES;

    // Start from current retry count (for messages that have been retried before)
    for (
      let attempt = currentRetryCount;
      attempt <= currentRetryCount + maxRetries;
      attempt++
    ) {
      try {
        // Check circuit breaker state before attempting
        const circuitState = this.circuitBreaker.getState();
        if (circuitState === 'open') {
          this.log.warn('Circuit breaker is open, scheduling for later retry', {
            messageId: input.id,
            attempt,
          });

          // Return a special status to indicate circuit is open
          return {
            status: 'failed',
            model: this.client.modelName,
            error:
              'AI service circuit breaker is open. Message will be retried later.',
          };
        }

        this.log.debug('Attempting AI processing', {
          messageId: input.id,
          attempt,
          maxRetries,
          circuitState,
        });

        // Execute AI processing through circuit breaker with timeout
        const result = await this.circuitBreaker.execute(async () => {
          return await this.executeWithTimeout(
            this.client.processMessage(input, {
              schema: messageExtractionSchema,
              systemPrompt: medicationSystemPrompt,
              promptTemplate: medicationPromptTemplate,
            }),
            AI_RETRY_CONFIG.REQUEST_TIMEOUT_MS,
          );
        });

        // Success - return result
        this.log.info('AI processing succeeded', {
          messageId: input.id,
          attempt,
          model: result.model,
        });

        return {
          status: result.status === 'failed' ? 'failed' : 'completed',
          model: result.model,
          error: result.error,
          data: result.data ?? undefined,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if it's a circuit breaker error
        if (error instanceof CircuitBreakerError) {
          this.log.warn('Circuit breaker prevented request', {
            messageId: input.id,
            attempt,
            error: error.message,
          });

          return {
            status: 'failed',
            model: this.client.modelName,
            error:
              'AI service is temporarily unavailable. Message will be retried later.',
          };
        }

        // Determine if error is retryable
        const isRetryable = this.isRetryableError(error);
        const isLastAttempt = attempt >= currentRetryCount + maxRetries;

        this.log.warn('AI processing attempt failed', {
          messageId: input.id,
          attempt,
          maxRetries,
          isRetryable,
          isLastAttempt,
          error: error instanceof Error ? error.message : String(error),
        });

        // If not retryable or last attempt, fail immediately
        if (!isRetryable || isLastAttempt) {
          return {
            status: 'failed',
            model: this.client.modelName,
            error: this.formatErrorWithStack(error),
          };
        }

        // Calculate backoff delay with jitter
        const delay = calculateBackoffWithJitter(
          attempt - currentRetryCount,
          AI_RETRY_CONFIG.INITIAL_DELAY_MS,
          AI_RETRY_CONFIG.MAX_DELAY_MS,
        );

        this.log.info('Retrying after backoff', {
          messageId: input.id,
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
        });

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    return {
      status: 'failed',
      model: this.client.modelName,
      error: lastError
        ? this.formatErrorWithStack(lastError)
        : 'All retry attempts exhausted',
    };
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `AI request timed out after ${timeoutMs}ms (possible cold start)`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();
    const errorObj = error as any;

    // Timeout errors are retryable (cold starts)
    if (message.includes('timeout') || message.includes('timed out')) {
      return true;
    }

    // Network errors are retryable
    if (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('econnreset')
    ) {
      return true;
    }

    // Rate limit errors are retryable
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      errorObj.status === 429
    ) {
      return true;
    }

    // Service unavailable errors are retryable
    if (
      message.includes('service unavailable') ||
      message.includes('temporarily unavailable') ||
      errorObj.status === 503
    ) {
      return true;
    }

    // Internal server errors might be transient
    if (errorObj.status === 500 || errorObj.status === 502) {
      return true;
    }

    // Bad gateway errors are retryable
    if (errorObj.status === 502 || errorObj.status === 504) {
      return true;
    }

    // Default: not retryable (e.g., validation errors, auth errors)
    return false;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Find existing AI processing result for the same content
   * Returns the most recent completed result within 30 days
   *
   * @param userId - User ID for privacy boundary
   * @param contentHash - Content hash to match
   * @param excludeMessageId - Current message ID to exclude from search
   * @returns Source message ID and model, or null if not found
   */
  private async findExistingAIResult(
    userId: string,
    contentHash: string,
    excludeMessageId: string,
  ): Promise<{ sourceMessageId: string; model: string } | null> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const existingMessage = await prisma.whatsAppMessage.findFirst({
      where: {
        session: { userId },
        contentHash,
        aiStatus: 'completed',
        id: { not: excludeMessageId },
        aiProcessedAt: { gte: thirtyDaysAgo },
      },
      select: { id: true, aiModel: true },
      orderBy: { aiProcessedAt: 'desc' },
    });

    if (!existingMessage) {
      return null;
    }

    return {
      sourceMessageId: existingMessage.id,
      model: existingMessage.aiModel || 'unknown',
    };
  }

  /**
   * Copy extracted data from source message to target message
   *
   * @param sourceMessageId - Source message with existing extracted data
   * @param targetMessageId - Target message to copy data to
   * @returns Count of records copied
   */
  private async copyExtractedData(
    sourceMessageId: string,
    targetMessageId: string,
  ): Promise<number> {
    const sourceData = await prisma.whatsAppExtractedData.findMany({
      where: { messageId: sourceMessageId },
      select: {
        dataType: true,
        data: true,
        confidence: true,
        model: true,
        promptHash: true,
      },
    });

    if (sourceData.length === 0) {
      return 0;
    }

    await prisma.whatsAppExtractedData.createMany({
      data: sourceData.map(item => ({
        messageId: targetMessageId,
        dataType: item.dataType,
        data: item.data as any,
        confidence: item.confidence,
        model: item.model,
        promptHash: item.promptHash,
      })),
    });

    return sourceData.length;
  }

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
        this.log.error('Failed to process message', {
          messageId: id,
          error: error instanceof Error ? error.message : String(error),
        });
        recordError('message_processing', 'medium');
      }
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const aiProcessorService = new AIProcessorService();
export { AIProcessorService };
