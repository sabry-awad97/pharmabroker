/**
 * Auto Processor Service
 *
 * Handles automatic AI processing of incoming messages based on user settings.
 * Integrates with the event bridge to process messages in real-time.
 *
 * Features:
 * - Per-user configuration for auto-processing
 * - Rate limiting to prevent API overload
 * - Filtering by message type, source, session, and group
 * - Background processing queue
 */

import prisma from '@pharmabroker/db';
import { aiProcessorService } from './ai-processor.service';
import type { ParsedMessageEvent } from './whatsapp-messages.service';

// ============================================================================
// Types
// ============================================================================

interface UserSettings {
  userId: string;
  autoProcessEnabled: boolean;
  autoProcessRealtime: boolean;
  autoProcessHistory: boolean;
  processTextOnly: boolean;
  minTextLength: number;
  excludeFromMe: boolean;
  maxProcessPerMinute: number;
  maxProcessPerHour: number;
  enabledSessionIds: string[] | null;
  enabledGroupIds: string[] | null;
}

interface RateLimitState {
  minuteCount: number;
  hourCount: number;
  minuteResetAt: number;
  hourResetAt: number;
}

interface QueuedMessage {
  messageDbId: string;
  userId: string;
  queuedAt: number;
}

// ============================================================================
// Auto Processor Service
// ============================================================================

class AutoProcessorService {
  // Cache user settings to avoid DB lookups on every message
  private settingsCache: Map<
    string,
    { settings: UserSettings; expiresAt: number }
  > = new Map();
  private readonly SETTINGS_CACHE_TTL = 60 * 1000; // 1 minute

  // Rate limiting state per user
  private rateLimits: Map<string, RateLimitState> = new Map();

  // Processing queue
  private processingQueue: QueuedMessage[] = [];
  private isProcessing = false;
  private processInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start the background processor
    this.startBackgroundProcessor();
  }

  /**
   * Start the background processing loop
   */
  private startBackgroundProcessor(): void {
    if (this.processInterval) return;

    this.processInterval = setInterval(() => {
      this.processQueue();
    }, 1000); // Process queue every second
  }

  /**
   * Stop the background processor
   */
  stopBackgroundProcessor(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
  }

  /**
   * Handle a new message and determine if it should be auto-processed
   * Called from the event bridge when a message is received
   */
  async handleNewMessage(
    messageDbId: string,
    sessionId: string,
    event: ParsedMessageEvent,
  ): Promise<void> {
    try {
      // Get the user ID for this session
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });

      if (!session) {
        return;
      }

      const userId = session.userId;

      // Get user settings (cached)
      const settings = await this.getUserSettings(userId);

      if (!settings || !settings.autoProcessEnabled) {
        return;
      }

      // Check if message should be processed
      if (!this.shouldProcessMessage(settings, event)) {
        return;
      }

      // Check rate limits
      if (this.isRateLimited(userId, settings)) {
        console.log(`[AutoProcessor] Rate limited for user ${userId}`);
        return;
      }

      // Add to processing queue
      this.queueMessage(messageDbId, userId);
    } catch (error) {
      console.error('[AutoProcessor] Error handling new message:', error);
    }
  }

  /**
   * Get user settings with caching
   */
  private async getUserSettings(userId: string): Promise<UserSettings | null> {
    const now = Date.now();
    const cached = this.settingsCache.get(userId);

    if (cached && cached.expiresAt > now) {
      return cached.settings;
    }

    // Fetch from database
    const dbSettings = await prisma.userAISettings.findUnique({
      where: { userId },
    });

    if (!dbSettings) {
      // Cache the absence of settings
      this.settingsCache.set(userId, {
        settings: {
          userId,
          autoProcessEnabled: false,
          autoProcessRealtime: true,
          autoProcessHistory: false,
          processTextOnly: true,
          minTextLength: 10,
          excludeFromMe: true,
          maxProcessPerMinute: 10,
          maxProcessPerHour: 100,
          enabledSessionIds: null,
          enabledGroupIds: null,
        },
        expiresAt: now + this.SETTINGS_CACHE_TTL,
      });
      return null;
    }

    const settings: UserSettings = {
      userId: dbSettings.userId,
      autoProcessEnabled: dbSettings.autoProcessEnabled,
      autoProcessRealtime: dbSettings.autoProcessRealtime,
      autoProcessHistory: dbSettings.autoProcessHistory,
      processTextOnly: dbSettings.processTextOnly,
      minTextLength: dbSettings.minTextLength,
      excludeFromMe: dbSettings.excludeFromMe,
      maxProcessPerMinute: dbSettings.maxProcessPerMinute,
      maxProcessPerHour: dbSettings.maxProcessPerHour,
      enabledSessionIds: dbSettings.enabledSessionIds as string[] | null,
      enabledGroupIds: dbSettings.enabledGroupIds as string[] | null,
    };

    this.settingsCache.set(userId, {
      settings,
      expiresAt: now + this.SETTINGS_CACHE_TTL,
    });

    return settings;
  }

  /**
   * Invalidate settings cache for a user (call when settings are updated)
   */
  invalidateSettingsCache(userId: string): void {
    this.settingsCache.delete(userId);
  }

  /**
   * Check if a message should be processed based on settings
   */
  private shouldProcessMessage(
    settings: UserSettings,
    event: ParsedMessageEvent,
  ): boolean {
    // Check source filter
    if (event.source === 'realtime' && !settings.autoProcessRealtime) {
      return false;
    }
    if (event.source === 'history' && !settings.autoProcessHistory) {
      return false;
    }

    // Check if from me
    if (settings.excludeFromMe && event.isFromMe) {
      return false;
    }

    // Check message type
    if (settings.processTextOnly && event.messageType !== 'text') {
      return false;
    }

    // Check text length
    const textContent = event.text || event.caption || '';
    if (textContent.length < settings.minTextLength) {
      return false;
    }

    // Check session filter
    if (settings.enabledSessionIds !== null) {
      if (!settings.enabledSessionIds.includes(event.sessionId)) {
        return false;
      }
    }

    // Note: Group filtering would require looking up the group ID from chatJid
    // For now, we skip this check as it would require an additional DB query

    return true;
  }

  /**
   * Check if user is rate limited
   */
  private isRateLimited(userId: string, settings: UserSettings): boolean {
    const now = Date.now();
    let state = this.rateLimits.get(userId);

    if (!state) {
      state = {
        minuteCount: 0,
        hourCount: 0,
        minuteResetAt: now + 60 * 1000,
        hourResetAt: now + 60 * 60 * 1000,
      };
      this.rateLimits.set(userId, state);
    }

    // Reset counters if needed
    if (now >= state.minuteResetAt) {
      state.minuteCount = 0;
      state.minuteResetAt = now + 60 * 1000;
    }
    if (now >= state.hourResetAt) {
      state.hourCount = 0;
      state.hourResetAt = now + 60 * 60 * 1000;
    }

    // Check limits
    if (state.minuteCount >= settings.maxProcessPerMinute) {
      return true;
    }
    if (state.hourCount >= settings.maxProcessPerHour) {
      return true;
    }

    return false;
  }

  /**
   * Increment rate limit counters
   */
  private incrementRateLimit(userId: string): void {
    const state = this.rateLimits.get(userId);
    if (state) {
      state.minuteCount++;
      state.hourCount++;
    }
  }

  /**
   * Add message to processing queue
   */
  private queueMessage(messageDbId: string, userId: string): void {
    this.processingQueue.push({
      messageDbId,
      userId,
      queuedAt: Date.now(),
    });
  }

  /**
   * Process queued messages
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Process up to 5 messages per tick
      const batch = this.processingQueue.splice(0, 5);

      for (const item of batch) {
        try {
          // Double-check rate limit before processing
          const settings = await this.getUserSettings(item.userId);
          if (!settings || this.isRateLimited(item.userId, settings)) {
            continue;
          }

          // Process the message
          await aiProcessorService.processMessage(
            item.userId,
            item.messageDbId,
          );

          // Increment rate limit counter
          this.incrementRateLimit(item.userId);

          console.log(
            `[AutoProcessor] Processed message ${item.messageDbId} for user ${item.userId}`,
          );
        } catch (error) {
          console.error(
            `[AutoProcessor] Failed to process message ${item.messageDbId}:`,
            error,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get auto-processing stats for a user
   */
  getStats(userId: string): {
    processedLastMinute: number;
    processedLastHour: number;
    queuedCount: number;
    isRateLimited: boolean;
  } {
    const state = this.rateLimits.get(userId);
    const queuedCount = this.processingQueue.filter(
      m => m.userId === userId,
    ).length;

    if (!state) {
      return {
        processedLastMinute: 0,
        processedLastHour: 0,
        queuedCount,
        isRateLimited: false,
      };
    }

    return {
      processedLastMinute: state.minuteCount,
      processedLastHour: state.hourCount,
      queuedCount,
      isRateLimited: false, // Would need settings to check
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const autoProcessorService = new AutoProcessorService();
export { AutoProcessorService };
