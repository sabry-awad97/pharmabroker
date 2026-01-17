/**
 * Message Linking Service
 *
 * Background service to link messages that arrived out of order.
 * Periodically scans for messages with missing quoted_message_id
 * and attempts to link them if the original message now exists.
 */

import prisma from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';

class MessageLinkingService {
  private log = logger.child('message-linking');
  private isRunning = false;

  /**
   * Link orphaned quoted messages
   * Finds messages where quoted_message_id is null but raw_payload contains quotedMessageId
   */
  async linkOrphanedQuotes(): Promise<{
    scanned: number;
    linked: number;
    failed: number;
  }> {
    if (this.isRunning) {
      this.log.warn('Link job already running, skipping');
      return { scanned: 0, linked: 0, failed: 0 };
    }

    this.isRunning = true;
    this.log.info('Starting orphaned quote linking job');

    try {
      // Find messages with null quoted_message_id but quotedMessageId in raw_payload
      const orphanedMessages = await prisma.$queryRaw<
        Array<{
          id: string;
          session_id: string;
          message_id: string;
          quoted_message_id_raw: string;
        }>
      >`
        SELECT 
          id,
          session_id,
          message_id,
          raw_payload->>'quotedMessageId' as quoted_message_id_raw
        FROM whatsapp_message
        WHERE quoted_message_id IS NULL
          AND raw_payload->>'quotedMessageId' IS NOT NULL
          AND raw_payload->>'quotedMessageId' != ''
        LIMIT 1000
      `;

      this.log.info('Found orphaned messages', {
        count: orphanedMessages.length,
      });

      let linked = 0;
      let failed = 0;

      for (const msg of orphanedMessages) {
        try {
          // Find the quoted message by messageId
          const quotedMessage = await prisma.whatsAppMessage.findFirst({
            where: {
              sessionId: msg.session_id,
              messageId: msg.quoted_message_id_raw,
            },
            select: { id: true },
          });

          if (quotedMessage) {
            // Update the quoted_message_id
            await prisma.whatsAppMessage.update({
              where: { id: msg.id },
              data: { quotedMessageId: quotedMessage.id },
            });
            linked++;

            if (linked % 100 === 0) {
              this.log.debug('Linking progress', { linked });
            }
          } else {
            failed++;
          }
        } catch (error) {
          this.log.error('Failed to link message', {
            messageId: msg.message_id,
            error: error instanceof Error ? error.message : String(error),
          });
          failed++;
        }
      }

      this.log.info('Orphaned quote linking complete', {
        scanned: orphanedMessages.length,
        linked,
        failed,
      });

      return {
        scanned: orphanedMessages.length,
        linked,
        failed,
      };
    } catch (error) {
      this.log.error('Orphaned quote linking job failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start periodic linking job
   * Runs every 5 minutes
   */
  startPeriodicLinking(intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout {
    this.log.info('Starting periodic message linking', {
      intervalMs,
    });

    const interval = setInterval(() => {
      this.linkOrphanedQuotes().catch(err => {
        this.log.error('Periodic linking failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);

    // Run immediately on start
    this.linkOrphanedQuotes().catch(err => {
      this.log.error('Initial linking failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return interval;
  }
}

export const messageLinkingService = new MessageLinkingService();
