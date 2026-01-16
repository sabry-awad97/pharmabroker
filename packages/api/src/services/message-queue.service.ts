/**
 * Message Queue Service
 *
 * In-memory per-session queue for messages arriving before their groups are synced.
 * Messages are held temporarily and processed after group synchronization completes.
 *
 * Features:
 * - Per-session message queuing
 * - Configurable timeout for message expiration
 * - Maximum queue size to prevent memory exhaustion
 * - Automatic cleanup of expired messages
 */

import type { ParsedMessageEvent } from './whatsapp-messages.service';

// ============================================================================
// Types
// ============================================================================

/** A message waiting in the queue */
export interface QueuedMessage {
  event: ParsedMessageEvent;
  queuedAt: Date;
  sessionId: string;
}

/** Configuration for the message queue */
export interface MessageQueueConfig {
  /** Maximum time to hold messages before discarding (ms) */
  messageTimeoutMs: number;
  /** Maximum messages per session to prevent memory exhaustion */
  maxMessagesPerSession: number;
}

/** Result of processing queued messages */
export interface ProcessQueueResult {
  stored: number;
  dropped: number;
  expired: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: MessageQueueConfig = {
  messageTimeoutMs: 5 * 60 * 1000, // 5 minutes
  maxMessagesPerSession: 10000,
};

// ============================================================================
// Message Queue Service
// ============================================================================

export class MessageQueueService {
  private queues: Map<string, QueuedMessage[]> = new Map();
  private config: MessageQueueConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<MessageQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic cleanup of expired messages
   * @param intervalMs How often to run cleanup (default: 30 seconds)
   */
  startCleanup(intervalMs: number = 30000): void {
    if (this.cleanupInterval) {
      return; // Already running
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Add a message to the queue for a session
   * @param sessionId The session ID
   * @param event The parsed message event
   * @returns true if queued, false if queue is full
   */
  enqueue(sessionId: string, event: ParsedMessageEvent): boolean {
    let queue = this.queues.get(sessionId);

    if (!queue) {
      queue = [];
      this.queues.set(sessionId, queue);
    }

    // Check if queue is full
    if (queue.length >= this.config.maxMessagesPerSession) {
      console.warn(
        `[MessageQueue] Queue full for session ${sessionId}, dropping oldest message`,
      );
      // Drop oldest message to make room
      queue.shift();
    }

    const queuedMessage: QueuedMessage = {
      event,
      queuedAt: new Date(),
      sessionId,
    };

    queue.push(queuedMessage);
    return true;
  }

  /**
   * Get and remove all messages for a session
   * Filters out expired messages
   * @param sessionId The session ID
   * @returns Array of parsed message events (non-expired only)
   */
  drain(sessionId: string): ParsedMessageEvent[] {
    const queue = this.queues.get(sessionId);

    if (!queue || queue.length === 0) {
      return [];
    }

    // Remove the queue for this session
    this.queues.delete(sessionId);

    // Filter out expired messages
    const now = Date.now();
    const validMessages: ParsedMessageEvent[] = [];
    let expiredCount = 0;

    for (const queuedMsg of queue) {
      const age = now - queuedMsg.queuedAt.getTime();
      if (age <= this.config.messageTimeoutMs) {
        validMessages.push(queuedMsg.event);
      } else {
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.warn(
        `[MessageQueue] Discarded ${expiredCount} expired messages for session ${sessionId}`,
      );
    }

    return validMessages;
  }

  /**
   * Remove expired messages from all queues
   * @returns Number of messages removed
   */
  cleanup(): number {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [sessionId, queue] of this.queues.entries()) {
      const originalLength = queue.length;

      // Filter in place to keep non-expired messages
      const validMessages = queue.filter(msg => {
        const age = now - msg.queuedAt.getTime();
        return age <= this.config.messageTimeoutMs;
      });

      const removed = originalLength - validMessages.length;
      totalRemoved += removed;

      if (removed > 0) {
        console.warn(
          `[MessageQueue] Cleaned up ${removed} expired messages for session ${sessionId}`,
        );
      }

      if (validMessages.length === 0) {
        this.queues.delete(sessionId);
      } else {
        this.queues.set(sessionId, validMessages);
      }
    }

    return totalRemoved;
  }

  /**
   * Get the number of queued messages for a session
   * @param sessionId The session ID
   * @returns Number of messages in queue
   */
  size(sessionId: string): number {
    const queue = this.queues.get(sessionId);
    return queue?.length ?? 0;
  }

  /**
   * Get total number of queued messages across all sessions
   * @returns Total message count
   */
  totalSize(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Clear all messages for a session
   * @param sessionId The session ID
   * @returns Number of messages cleared
   */
  clear(sessionId: string): number {
    const queue = this.queues.get(sessionId);
    const count = queue?.length ?? 0;
    this.queues.delete(sessionId);
    return count;
  }

  /**
   * Clear all queues
   * @returns Number of messages cleared
   */
  clearAll(): number {
    const total = this.totalSize();
    this.queues.clear();
    return total;
  }

  /**
   * Check if a session has queued messages
   * @param sessionId The session ID
   * @returns true if there are queued messages
   */
  hasMessages(sessionId: string): boolean {
    return this.size(sessionId) > 0;
  }

  /**
   * Get all session IDs with queued messages
   * @returns Array of session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get the current configuration
   */
  getConfig(): MessageQueueConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const messageQueueService = new MessageQueueService();
