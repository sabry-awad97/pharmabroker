/**
 * WhatsApp Messages Service
 *
 * Service layer for WhatsApp message storage, retrieval, and AI processing.
 * Handles business logic, authorization, and database operations via Prisma.
 *
 * Features:
 * - Message storage from Go service events (realtime and history sync)
 * - Message queueing for messages arriving before groups are synced
 * - Filtering by session, group, type, AI status, source, date range
 * - Full-text search across message content
 * - Cursor-based pagination
 * - Message statistics
 * - Export to JSON/CSV
 */

import { ORPCError } from '@orpc/server';
import prisma, { Prisma } from '@pharmabroker/db';
import type {
  MessageFilterInput,
  MessagesListResponse,
  WhatsAppMessageDetail,
  MessageStatsResponse,
  BulkDeleteResponse,
  ExportMessagesInput,
  ExportMessagesResponse,
  StoredMessageType,
  AIStatus,
  MessageSource,
} from '@pharmabroker/schemas/whatsapp';
import { escapeSqlWildcards } from '../utils/prisma';
import { messageQueueService } from './message-queue.service';
import { generateContentHash } from '../utils/content-hash';
import { logger } from '@pharmabroker/logger';
import { whatsappMessagesReceived, recordError } from '@pharmabroker/metrics';

// ============================================================================
// Types for Prisma queries
// ============================================================================

type MessageWhereClause = {
  session?: { userId: string };
  sessionId?: string;
  groupId?: string;
  messageType?: StoredMessageType;
  aiStatus?: AIStatus;
  source?: MessageSource;
  messageTimestamp?: { gte?: Date; lte?: Date };
  OR?: Array<{
    text?: { contains: string; mode: 'insensitive' };
    caption?: { contains: string; mode: 'insensitive' };
    senderPushName?: { contains: string; mode: 'insensitive' };
  }>;
};

// ============================================================================
// Types
// ============================================================================

/** Parsed message from Go service event */
export interface ParsedMessageEvent {
  messageId: string;
  sessionId: string;
  chatJid: string;
  senderJid: string;
  senderPushName?: string;
  messageType: string;
  text?: string | null;
  caption?: string | null;
  filename?: string | null;
  mimetype?: string | null;
  mediaUrl?: string | null;
  mediaKey?: number[] | null; // JSON array of bytes
  mediaSha256?: number[] | null;
  mediaSize?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  vcard?: string | null;
  pollName?: string | null;
  pollOptions?: string[] | null;
  reactionEmoji?: string | null;
  reactionMessageId?: string | null;
  isFromMe: boolean;
  isForwarded: boolean;
  isViewOnce: boolean;
  isBroadcast: boolean;
  quotedMessageId?: string | null;
  messageTimestamp: string;
  source: 'realtime' | 'history';
  rawPayload?: unknown;
}

// ============================================================================
// WhatsApp Messages Service
// ============================================================================

class WhatsAppMessagesService {
  private log = logger.child('whatsapp-messages');

  /**
   * List messages for a user with filtering and pagination
   * Only returns messages belonging to sessions owned by the user
   */
  async listMessages(
    userId: string,
    filters: MessageFilterInput,
  ): Promise<MessagesListResponse> {
    const {
      sessionId,
      groupId,
      search,
      messageType,
      aiStatus,
      source,
      dateFrom,
      dateTo,
      limit = 50,
      cursor,
    } = filters;

    // Build where clause - always filter by user's sessions
    const where: MessageWhereClause = {
      session: { userId },
    };

    // Filter by specific session
    if (sessionId) {
      where.sessionId = sessionId;
    }

    // Filter by group
    if (groupId) {
      where.groupId = groupId;
    }

    // Filter by message type
    if (messageType) {
      where.messageType = messageType;
    }

    // Filter by AI status
    if (aiStatus) {
      where.aiStatus = aiStatus;
    }

    // Filter by source
    if (source) {
      where.source = source;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      where.messageTimestamp = {};
      if (dateFrom) {
        where.messageTimestamp.gte = dateFrom;
      }
      if (dateTo) {
        where.messageTimestamp.lte = dateTo;
      }
    }

    // Search in text, caption, and sender name
    if (search) {
      const escapedSearch = escapeSqlWildcards(search);
      where.OR = [
        { text: { contains: escapedSearch, mode: 'insensitive' } },
        { caption: { contains: escapedSearch, mode: 'insensitive' } },
        { senderPushName: { contains: escapedSearch, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.whatsAppMessage.count({ where });

    // Cursor-based pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const messages = await prisma.whatsAppMessage.findMany({
      where,
      take: limit + 1,
      cursor: cursorObj,
      skip: cursor ? 1 : 0,
      orderBy: [{ messageTimestamp: 'desc' }, { id: 'asc' }],
      include: {
        group: {
          select: {
            id: true,
            name: true,
            jid: true,
          },
        },
        participant: {
          select: {
            id: true,
            displayName: true,
            jid: true,
          },
        },
      },
    });

    // Determine if there's a next page
    const hasNextPage = messages.length > limit;
    const resultMessages = hasNextPage ? messages.slice(0, limit) : messages;
    const nextCursor = hasNextPage
      ? resultMessages[resultMessages.length - 1]?.id
      : undefined;

    return {
      messages: resultMessages as any,
      nextCursor,
      total,
    };
  }

  /**
   * Get a single message with full details
   * Returns MESSAGE_NOT_FOUND if message doesn't exist or belongs to another user
   */
  async getMessage(
    userId: string,
    messageId: string,
  ): Promise<WhatsAppMessageDetail> {
    const message = await prisma.whatsAppMessage.findFirst({
      where: {
        id: messageId,
        session: { userId },
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            jid: true,
          },
        },
        participant: {
          select: {
            id: true,
            displayName: true,
            jid: true,
          },
        },
        extractedData: true,
      },
    });

    if (!message) {
      throw new ORPCError('MESSAGE_NOT_FOUND', {
        message: 'Message not found',
      });
    }

    return {
      ...message,
      extractedData: message.extractedData.map(ed => ({
        ...ed,
        data: ed.data as Record<string, unknown>,
      })),
      rawPayload: message.rawPayload,
    } as any;
  }

  /**
   * Get message statistics
   * Returns counts by type, AI status, and source
   */
  async getMessageStats(
    userId: string,
    sessionId?: string,
  ): Promise<MessageStatsResponse> {
    const baseWhere: Prisma.WhatsAppMessageWhereInput = {
      session: { userId },
    };

    if (sessionId) {
      baseWhere.sessionId = sessionId;
    }

    // Get total count
    const total = await prisma.whatsAppMessage.count({ where: baseWhere });

    // Get counts by type
    const byTypeRaw = await prisma.whatsAppMessage.groupBy({
      by: ['messageType'],
      where: baseWhere,
      _count: { messageType: true },
    });

    const byType: Record<string, number> = {};
    for (const item of byTypeRaw) {
      byType[item.messageType] = item._count.messageType;
    }

    // Get counts by AI status
    const byAIStatusRaw = await prisma.whatsAppMessage.groupBy({
      by: ['aiStatus'],
      where: baseWhere,
      _count: { aiStatus: true },
    });

    const byAIStatus: Record<string, number> = {};
    for (const item of byAIStatusRaw) {
      byAIStatus[item.aiStatus] = item._count.aiStatus;
    }

    // Get counts by source
    const bySourceRaw = await prisma.whatsAppMessage.groupBy({
      by: ['source'],
      where: baseWhere,
      _count: { source: true },
    });

    const bySource: Record<string, number> = {};
    for (const item of bySourceRaw) {
      bySource[item.source] = item._count.source;
    }

    return {
      total,
      byType,
      byAIStatus,
      bySource,
    } as MessageStatsResponse;
  }

  /**
   * Delete a single message
   * Verifies ownership before deletion
   */
  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const message = await prisma.whatsAppMessage.findFirst({
      where: {
        id: messageId,
        session: { userId },
      },
      select: { id: true },
    });

    if (!message) {
      throw new ORPCError('MESSAGE_NOT_FOUND', {
        message: 'Message not found',
      });
    }

    // Delete message (extracted data will cascade)
    await prisma.whatsAppMessage.delete({
      where: { id: messageId },
    });
  }

  /**
   * Bulk delete messages
   * Verifies ownership of all messages before deletion
   */
  async bulkDeleteMessages(
    userId: string,
    messageIds: string[],
  ): Promise<BulkDeleteResponse> {
    // Verify all messages belong to user
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        id: { in: messageIds },
        session: { userId },
      },
      select: { id: true },
    });

    const ownedIds = messages.map(m => m.id);

    if (ownedIds.length === 0) {
      return { deleted: 0 };
    }

    // Delete messages (extracted data will cascade)
    const result = await prisma.whatsAppMessage.deleteMany({
      where: { id: { in: ownedIds } },
    });

    return { deleted: result.count };
  }

  /**
   * Store a message from Go service event
   * Uses upsert to handle duplicates (same session + messageId)
   * Queues messages for unknown groups instead of dropping them
   */
  async storeMessage(event: ParsedMessageEvent): Promise<void> {
    const {
      messageId,
      sessionId,
      chatJid,
      senderJid,
      senderPushName,
      messageType,
      text,
      caption,
      filename,
      mimetype,
      mediaUrl,
      mediaKey,
      mediaSha256,
      mediaSize,
      isFromMe,
      isForwarded,
      isViewOnce,
      isBroadcast,
      quotedMessageId,
      messageTimestamp,
      source,
      rawPayload,
    } = event;

    // Find the group by JID
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        sessionId,
        jid: chatJid,
      },
      select: { id: true, name: true },
    });

    if (!group) {
      // Queue message for later processing instead of dropping
      messageQueueService.enqueue(sessionId, event);
      const queueSize = messageQueueService.getQueueSize(sessionId);
      this.log.info('Queued message for unknown group', {
        messageId,
        chatJid,
        sessionId,
        queueSize,
      });
      return;
    }

    this.log.debug('Storing message in group', {
      messageId,
      groupName: group.name,
      chatJid,
    });

    // Try to find participant by JID
    const participant = await prisma.whatsAppGroupParticipant.findFirst({
      where: {
        groupId: group.id,
        jid: senderJid,
      },
      select: { id: true },
    });

    // Convert byte arrays to Buffer
    const mediaKeyBuffer = mediaKey ? Buffer.from(mediaKey) : null;
    const mediaSha256Buffer = mediaSha256 ? Buffer.from(mediaSha256) : null;

    // Generate content hash for deduplication
    const contentHash = generateContentHash({
      text: text ?? null,
      caption: caption ?? null,
      messageType,
    });

    // Upsert the message
    await prisma.whatsAppMessage.upsert({
      where: {
        sessionId_messageId: {
          sessionId,
          messageId,
        },
      },
      create: {
        messageId,
        sessionId,
        groupId: group.id,
        senderJid,
        senderPushName: senderPushName ?? null,
        participantId: participant?.id ?? null,
        messageType: messageType as any,
        text: text ?? null,
        caption: caption ?? null,
        filename: filename ?? null,
        mimetype: mimetype ?? null,
        mediaUrl: mediaUrl ?? null,
        mediaKey: mediaKeyBuffer,
        mediaSha256: mediaSha256Buffer,
        mediaSize: mediaSize ?? null,
        isFromMe,
        isForwarded,
        isViewOnce,
        isBroadcast,
        quotedMessageId: quotedMessageId ?? null,
        messageTimestamp: new Date(messageTimestamp),
        source: source as any,
        rawPayload:
          rawPayload === null || rawPayload === undefined
            ? Prisma.JsonNull
            : (rawPayload as Prisma.InputJsonValue),
        aiStatus: 'pending',
        contentHash,
      },
      update: {
        // Update fields that might change
        senderPushName: senderPushName ?? null,
        participantId: participant?.id ?? null,
        text: text ?? null,
        caption: caption ?? null,
        contentHash, // Update hash if content changed
        // Don't update source - keep original
      },
    });

    // Record metrics
    whatsappMessagesReceived.inc({
      session_id: sessionId,
      type: messageType,
    });

    this.log.info('Stored message', {
      messageId,
      source,
      messageType,
    });
  }

  /**
   * Process a batch of queued messages after group sync
   * Attempts to store each message, tracking stored vs dropped counts
   * @param messages Array of parsed message events from the queue
   * @returns Object with stored and dropped counts
   */
  async processQueuedMessages(
    messages: ParsedMessageEvent[],
  ): Promise<{ stored: number; dropped: number }> {
    this.log.info('Processing batch of queued messages', {
      messageCount: messages.length,
    });

    let stored = 0;
    let dropped = 0;
    let batchCount = 0;

    for (const event of messages) {
      batchCount++;

      // Log progress every 100 messages
      if (batchCount % 100 === 0) {
        this.log.debug('Batch progress', {
          current: batchCount,
          total: messages.length,
          stored,
          dropped,
        });
      }
      const { sessionId, chatJid, messageId } = event;

      // Find the group by JID
      const group = await prisma.whatsAppGroup.findFirst({
        where: {
          sessionId,
          jid: chatJid,
        },
        select: { id: true },
      });

      if (!group) {
        // Group still doesn't exist after sync - drop the message
        this.log.warn('Dropping orphan message for unknown group', {
          messageId,
          chatJid,
        });
        dropped++;
        continue;
      }

      try {
        // Try to find participant by JID
        const participant = await prisma.whatsAppGroupParticipant.findFirst({
          where: {
            groupId: group.id,
            jid: event.senderJid,
          },
          select: { id: true },
        });

        // Convert byte arrays to Buffer
        const mediaKeyBuffer = event.mediaKey
          ? Buffer.from(event.mediaKey)
          : null;
        const mediaSha256Buffer = event.mediaSha256
          ? Buffer.from(event.mediaSha256)
          : null;

        // Generate content hash for deduplication
        const contentHash = generateContentHash({
          text: event.text ?? null,
          caption: event.caption ?? null,
          messageType: event.messageType,
        });

        // Upsert the message
        await prisma.whatsAppMessage.upsert({
          where: {
            sessionId_messageId: {
              sessionId,
              messageId,
            },
          },
          create: {
            messageId,
            sessionId,
            groupId: group.id,
            senderJid: event.senderJid,
            senderPushName: event.senderPushName ?? null,
            participantId: participant?.id ?? null,
            messageType: event.messageType as any,
            text: event.text ?? null,
            caption: event.caption ?? null,
            filename: event.filename ?? null,
            mimetype: event.mimetype ?? null,
            mediaUrl: event.mediaUrl ?? null,
            mediaKey: mediaKeyBuffer,
            mediaSha256: mediaSha256Buffer,
            mediaSize: event.mediaSize ?? null,
            isFromMe: event.isFromMe,
            isForwarded: event.isForwarded,
            isViewOnce: event.isViewOnce,
            isBroadcast: event.isBroadcast,
            quotedMessageId: event.quotedMessageId ?? null,
            messageTimestamp: new Date(event.messageTimestamp),
            source: event.source as any,
            rawPayload:
              event.rawPayload === null || event.rawPayload === undefined
                ? Prisma.JsonNull
                : (event.rawPayload as Prisma.InputJsonValue),
            aiStatus: 'pending',
            contentHash,
          },
          update: {
            // Update fields that might change
            senderPushName: event.senderPushName ?? null,
            participantId: participant?.id ?? null,
            text: event.text ?? null,
            caption: event.caption ?? null,
            contentHash, // Update hash if content changed
          },
        });

        stored++;

        // Log every 50th successful store
        if (stored % 50 === 0) {
          this.log.debug('Stored messages progress', { stored });
        }
      } catch (error) {
        this.log.error('Failed to store queued message', {
          messageId,
          error: error instanceof Error ? error.message : String(error),
        });
        recordError('message_store', 'medium');
        dropped++;
      }
    }

    this.log.info('Batch complete', {
      stored,
      dropped,
      total: messages.length,
    });

    return { stored, dropped };
  }

  /**
   * Export messages to JSON or CSV
   */
  async exportMessages(
    userId: string,
    input: ExportMessagesInput,
  ): Promise<ExportMessagesResponse> {
    const {
      format,
      sessionId,
      groupId,
      messageType,
      aiStatus,
      source,
      dateFrom,
      dateTo,
    } = input;

    // Build where clause
    const where: MessageWhereClause = {
      session: { userId },
    };

    if (sessionId) where.sessionId = sessionId;
    if (groupId) where.groupId = groupId;
    if (messageType) where.messageType = messageType;
    if (aiStatus) where.aiStatus = aiStatus;
    if (source) where.source = source;

    if (dateFrom || dateTo) {
      where.messageTimestamp = {};
      if (dateFrom) where.messageTimestamp.gte = dateFrom;
      if (dateTo) where.messageTimestamp.lte = dateTo;
    }

    // Fetch messages (limit to 10000)
    const messages = await prisma.whatsAppMessage.findMany({
      where,
      take: 10000,
      orderBy: { messageTimestamp: 'desc' },
      include: {
        group: { select: { name: true } },
      },
    });

    if (format === 'json') {
      const data = messages.map(m => ({
        messageId: m.messageId,
        sender: m.senderPushName ?? m.senderJid,
        group: m.group.name,
        type: m.messageType,
        text: m.text ?? m.caption ?? '',
        timestamp: m.messageTimestamp.toISOString(),
        aiStatus: m.aiStatus,
      }));

      return {
        filename: `messages-${Date.now()}.json`,
        contentType: 'application/json',
        data: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      };
    } else {
      // CSV format
      const headers = [
        'messageId',
        'sender',
        'group',
        'type',
        'text',
        'timestamp',
        'aiStatus',
      ];
      const rows = messages.map(m => [
        m.messageId,
        (m.senderPushName ?? m.senderJid).replace(/"/g, '""'),
        m.group.name.replace(/"/g, '""'),
        m.messageType,
        (m.text ?? m.caption ?? '').replace(/"/g, '""').replace(/\n/g, ' '),
        m.messageTimestamp.toISOString(),
        m.aiStatus,
      ]);

      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
      ].join('\n');

      return {
        filename: `messages-${Date.now()}.csv`,
        contentType: 'text/csv',
        data: Buffer.from(csv).toString('base64'),
      };
    }
  }

  /**
   * Update AI processing status
   */
  async updateAIStatus(
    messageId: string,
    status: AIStatus,
    options?: {
      model?: string;
      error?: string;
    },
  ): Promise<void> {
    const updateData: Prisma.WhatsAppMessageUpdateInput = {
      aiStatus: status,
    };

    if (status === 'completed') {
      updateData.aiProcessedAt = new Date();
      updateData.aiModel = options?.model ?? null;
      updateData.aiError = null;
    } else if (status === 'failed') {
      updateData.aiError = options?.error ?? 'Unknown error';
      updateData.aiRetryCount = { increment: 1 };
    } else if (status === 'pending') {
      // Reset for retry
      updateData.aiError = null;
    }

    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: updateData,
    });
  }

  /**
   * Get sync status for a session
   * Returns the count of messages synced from history
   * Verifies session is connected before returning
   */
  async getSyncStatus(
    userId: string,
    sessionId: string,
  ): Promise<{ synced: number; errors: string[] }> {
    // Verify session belongs to user and is connected
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    if (session.status !== 'connected') {
      throw new ORPCError('SESSION_NOT_CONNECTED', {
        message:
          'Session must be connected to sync messages. History sync happens automatically when the session connects.',
      });
    }

    // Count messages synced from history for this session
    const synced = await prisma.whatsAppMessage.count({
      where: {
        sessionId,
        source: 'history',
      },
    });

    return {
      synced,
      errors: [],
    };
  }
}

/** Singleton WhatsApp Messages service */
export const whatsappMessagesService = new WhatsAppMessagesService();

export { WhatsAppMessagesService };
