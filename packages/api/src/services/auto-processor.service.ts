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
 * - Idle processing: process pending messages when no realtime messages arrive
 * - Priority processing: prioritize latest message when new one arrives
 * - Parallel history processing: process history messages in parallel after sync
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
  idleProcessingEnabled: boolean;
  idleTimeoutSeconds: number;
  idleMaxBatchSize: number;
  historyParallelEnabled: boolean;
  historyParallelCount: number;
  historyProcessDelay: number;
  prioritizeLatest: boolean;
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
  sessionId: string;
  source: 'realtime' | 'history';
  queuedAt: number;
  priority: number; // Higher = process first
}

interface UserProcessingState {
  lastRealtimeAt: number | null;
  isProcessingRealtime: boolean;
  historySyncStatus: 'idle' | 'syncing' | 'processing' | 'completed';
  historySyncCompletedAt: number | null;
  pendingHistoryMessages: QueuedMessage[];
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

  // Processing queue (realtime messages)
  private realtimeQueue: QueuedMessage[] = [];

  // Per-user processing state
  private userStates: Map<string, UserProcessingState> = new Map();

  // Processing flags
  private isProcessingRealtime = false;
  private processInterval: ReturnType<typeof setInterval> | null = null;
  private idleCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Start the background processors
    this.startBackgroundProcessor();
    this.startIdleProcessor();
  }

  /**
   * Start the background processing loop for realtime messages
   */
  private startBackgroundProcessor(): void {
    if (this.processInterval) return;

    this.processInterval = setInterval(() => {
      this.processRealtimeQueue();
    }, 500); // Process queue every 500ms
  }

  /**
   * Start the idle processor that handles pending messages when no realtime activity
   */
  private startIdleProcessor(): void {
    if (this.idleCheckInterval) return;

    this.idleCheckInterval = setInterval(() => {
      this.processIdleUsers();
    }, 5000); // Check for idle users every 5 seconds
  }

  /**
   * Stop the background processors
   */
  stopBackgroundProcessor(): void {
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }

  /**
   * Get or create user processing state
   */
  private getUserState(userId: string): UserProcessingState {
    let state = this.userStates.get(userId);
    if (!state) {
      state = {
        lastRealtimeAt: null,
        isProcessingRealtime: false,
        historySyncStatus: 'idle',
        historySyncCompletedAt: null,
        pendingHistoryMessages: [],
      };
      this.userStates.set(userId, state);
    }
    return state;
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
      const userState = this.getUserState(userId);

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

      const now = Date.now();
      const queuedMessage: QueuedMessage = {
        messageDbId,
        userId,
        sessionId,
        source: event.source,
        queuedAt: now,
        priority: settings.prioritizeLatest ? now : 0, // Latest messages get higher priority
      };

      if (event.source === 'realtime') {
        // Update last realtime timestamp
        userState.lastRealtimeAt = now;

        // If prioritizeLatest is enabled and we're currently processing,
        // add to front of queue with high priority
        if (settings.prioritizeLatest) {
          // Insert at position based on priority (higher priority first)
          const insertIndex = this.realtimeQueue.findIndex(
            m => m.userId === userId && m.priority < queuedMessage.priority,
          );
          if (insertIndex === -1) {
            this.realtimeQueue.push(queuedMessage);
          } else {
            this.realtimeQueue.splice(insertIndex, 0, queuedMessage);
          }
        } else {
          this.realtimeQueue.push(queuedMessage);
        }
      } else if (event.source === 'history') {
        // History messages go to pending queue for batch processing after sync
        if (settings.autoProcessHistory) {
          userState.pendingHistoryMessages.push(queuedMessage);
        }
      }
    } catch (error) {
      console.error('[AutoProcessor] Error handling new message:', error);
    }
  }

  /**
   * Notify that history sync has started for a session
   */
  async notifyHistorySyncStarted(sessionId: string): Promise<void> {
    try {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });

      if (session) {
        const userState = this.getUserState(session.userId);
        userState.historySyncStatus = 'syncing';
        userState.historySyncCompletedAt = null;
      }
    } catch (error) {
      console.error('[AutoProcessor] Error notifying sync started:', error);
    }
  }

  /**
   * Notify that history sync has completed for a session
   * This triggers parallel processing of history messages
   */
  async notifyHistorySyncCompleted(sessionId: string): Promise<void> {
    try {
      const session = await prisma.whatsAppSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });

      if (!session) return;

      const userId = session.userId;
      const userState = this.getUserState(userId);
      const settings = await this.getUserSettings(userId);

      userState.historySyncStatus = 'completed';
      userState.historySyncCompletedAt = Date.now();

      if (!settings || !settings.autoProcessHistory) {
        // Clear pending history messages if not enabled
        userState.pendingHistoryMessages = [];
        return;
      }

      // Schedule parallel processing after delay
      const delayMs = settings.historyProcessDelay * 1000;

      setTimeout(() => {
        this.processHistoryMessages(userId);
      }, delayMs);

      console.log(
        `[AutoProcessor] History sync completed for user ${userId}, ` +
          `processing ${userState.pendingHistoryMessages.length} messages in ${delayMs}ms`,
      );
    } catch (error) {
      console.error('[AutoProcessor] Error notifying sync completed:', error);
    }
  }

  /**
   * Process history messages in parallel
   */
  private async processHistoryMessages(userId: string): Promise<void> {
    const userState = this.getUserState(userId);
    const settings = await this.getUserSettings(userId);

    if (!settings || !settings.historyParallelEnabled) {
      userState.pendingHistoryMessages = [];
      userState.historySyncStatus = 'idle';
      return;
    }

    userState.historySyncStatus = 'processing';

    const messages = [...userState.pendingHistoryMessages];
    userState.pendingHistoryMessages = [];

    if (messages.length === 0) {
      userState.historySyncStatus = 'idle';
      return;
    }

    console.log(
      `[AutoProcessor] Processing ${messages.length} history messages for user ${userId} ` +
        `with ${settings.historyParallelCount} parallel workers`,
    );

    // Process in parallel batches
    const parallelCount = settings.historyParallelCount;

    for (let i = 0; i < messages.length; i += parallelCount) {
      const batch = messages.slice(i, i + parallelCount);

      // Check rate limit before each batch
      if (this.isRateLimited(userId, settings)) {
        console.log(
          `[AutoProcessor] Rate limited during history processing for user ${userId}`,
        );
        // Re-queue remaining messages
        userState.pendingHistoryMessages = messages.slice(i);
        break;
      }

      // Process batch in parallel
      await Promise.all(
        batch.map(async item => {
          try {
            await aiProcessorService.processMessage(userId, item.messageDbId);
            this.incrementRateLimit(userId);
            console.log(
              `[AutoProcessor] Processed history message ${item.messageDbId} for user ${userId}`,
            );
          } catch (error) {
            console.error(
              `[AutoProcessor] Failed to process history message ${item.messageDbId}:`,
              error,
            );
          }
        }),
      );
    }

    userState.historySyncStatus = 'idle';
  }

  /**
   * Process idle users - check for users with no recent realtime activity
   * and process their pending messages
   */
  private async processIdleUsers(): Promise<void> {
    const now = Date.now();

    for (const [userId, state] of this.userStates.entries()) {
      try {
        const settings = await this.getUserSettings(userId);

        if (
          !settings ||
          !settings.idleProcessingEnabled ||
          !settings.autoProcessEnabled
        ) {
          continue;
        }

        // Check if user is idle (no realtime messages for idleTimeoutSeconds)
        const idleThreshold = settings.idleTimeoutSeconds * 1000;
        const isIdle =
          state.lastRealtimeAt === null ||
          now - state.lastRealtimeAt > idleThreshold;

        if (!isIdle || state.isProcessingRealtime) {
          continue;
        }

        // Check rate limits
        if (this.isRateLimited(userId, settings)) {
          continue;
        }

        // Get pending messages from database
        const pendingMessages = await prisma.whatsAppMessage.findMany({
          where: {
            session: { userId },
            aiStatus: 'pending',
            OR: [{ text: { not: null } }, { caption: { not: null } }],
          },
          select: { id: true },
          take: settings.idleMaxBatchSize,
          orderBy: { messageTimestamp: 'desc' }, // Process newest first
        });

        if (pendingMessages.length === 0) {
          continue;
        }

        console.log(
          `[AutoProcessor] Processing ${pendingMessages.length} pending messages for idle user ${userId}`,
        );

        // Process pending messages
        for (const message of pendingMessages) {
          // Check if new realtime message arrived (break idle processing)
          const currentState = this.getUserState(userId);
          if (
            currentState.lastRealtimeAt &&
            currentState.lastRealtimeAt > now
          ) {
            console.log(
              `[AutoProcessor] New realtime message arrived, stopping idle processing for user ${userId}`,
            );
            break;
          }

          // Check rate limit
          if (this.isRateLimited(userId, settings)) {
            break;
          }

          try {
            await aiProcessorService.processMessage(userId, message.id);
            this.incrementRateLimit(userId);
          } catch (error) {
            console.error(
              `[AutoProcessor] Failed to process idle message ${message.id}:`,
              error,
            );
          }
        }
      } catch (error) {
        console.error(
          `[AutoProcessor] Error processing idle user ${userId}:`,
          error,
        );
      }
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
      // Return default settings (disabled)
      const defaultSettings: UserSettings = {
        userId,
        autoProcessEnabled: false,
        autoProcessRealtime: true,
        autoProcessHistory: false,
        idleProcessingEnabled: false,
        idleTimeoutSeconds: 30,
        idleMaxBatchSize: 5,
        historyParallelEnabled: true,
        historyParallelCount: 3,
        historyProcessDelay: 5,
        prioritizeLatest: true,
        processTextOnly: true,
        minTextLength: 10,
        excludeFromMe: true,
        maxProcessPerMinute: 10,
        maxProcessPerHour: 100,
        enabledSessionIds: null,
        enabledGroupIds: null,
      };

      this.settingsCache.set(userId, {
        settings: defaultSettings,
        expiresAt: now + this.SETTINGS_CACHE_TTL,
      });
      return null;
    }

    const settings: UserSettings = {
      userId: dbSettings.userId,
      autoProcessEnabled: dbSettings.autoProcessEnabled,
      autoProcessRealtime: dbSettings.autoProcessRealtime,
      autoProcessHistory: dbSettings.autoProcessHistory,
      idleProcessingEnabled: dbSettings.idleProcessingEnabled,
      idleTimeoutSeconds: dbSettings.idleTimeoutSeconds,
      idleMaxBatchSize: dbSettings.idleMaxBatchSize,
      historyParallelEnabled: dbSettings.historyParallelEnabled,
      historyParallelCount: dbSettings.historyParallelCount,
      historyProcessDelay: dbSettings.historyProcessDelay,
      prioritizeLatest: dbSettings.prioritizeLatest,
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
   * Process realtime queue
   */
  private async processRealtimeQueue(): Promise<void> {
    if (this.isProcessingRealtime || this.realtimeQueue.length === 0) {
      return;
    }

    this.isProcessingRealtime = true;

    try {
      // Process up to 3 messages per tick
      const batch = this.realtimeQueue.splice(0, 3);

      for (const item of batch) {
        const userState = this.getUserState(item.userId);
        userState.isProcessingRealtime = true;

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
            `[AutoProcessor] Processed realtime message ${item.messageDbId} for user ${item.userId}`,
          );
        } catch (error) {
          console.error(
            `[AutoProcessor] Failed to process message ${item.messageDbId}:`,
            error,
          );
        } finally {
          userState.isProcessingRealtime = false;
        }
      }
    } finally {
      this.isProcessingRealtime = false;
    }
  }

  /**
   * Get auto-processing stats for a user
   */
  async getStats(userId: string): Promise<{
    processedLastMinute: number;
    processedLastHour: number;
    queuedCount: number;
    pendingCount: number;
    isRateLimited: boolean;
    isIdle: boolean;
    lastRealtimeAt: Date | null;
    historySyncStatus: 'idle' | 'syncing' | 'processing' | 'completed';
  }> {
    const state = this.rateLimits.get(userId);
    const userState = this.getUserState(userId);
    const settings = await this.getUserSettings(userId);

    const queuedCount =
      this.realtimeQueue.filter(m => m.userId === userId).length +
      userState.pendingHistoryMessages.length;

    // Get pending count from database
    const pendingCount = await prisma.whatsAppMessage.count({
      where: {
        session: { userId },
        aiStatus: 'pending',
        OR: [{ text: { not: null } }, { caption: { not: null } }],
      },
    });

    const now = Date.now();
    const idleThreshold = settings?.idleTimeoutSeconds
      ? settings.idleTimeoutSeconds * 1000
      : 30000;
    const isIdle =
      userState.lastRealtimeAt === null ||
      now - userState.lastRealtimeAt > idleThreshold;

    if (!state) {
      return {
        processedLastMinute: 0,
        processedLastHour: 0,
        queuedCount,
        pendingCount,
        isRateLimited: false,
        isIdle,
        lastRealtimeAt: userState.lastRealtimeAt
          ? new Date(userState.lastRealtimeAt)
          : null,
        historySyncStatus: userState.historySyncStatus,
      };
    }

    const isRateLimited = settings
      ? state.minuteCount >= settings.maxProcessPerMinute ||
        state.hourCount >= settings.maxProcessPerHour
      : false;

    return {
      processedLastMinute: state.minuteCount,
      processedLastHour: state.hourCount,
      queuedCount,
      pendingCount,
      isRateLimited,
      isIdle,
      lastRealtimeAt: userState.lastRealtimeAt
        ? new Date(userState.lastRealtimeAt)
        : null,
      historySyncStatus: userState.historySyncStatus,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const autoProcessorService = new AutoProcessorService();
export { AutoProcessorService };
