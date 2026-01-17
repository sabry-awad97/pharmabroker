/**
 * WhatsApp WebSocket Service
 *
 * Handles incoming WebSocket connections from the Go WhatsApp service.
 * Receives events pushed from Go and publishes them to the oRPC EventPublisher.
 *
 * This completes the bidirectional communication:
 * - Go service → API (this service) → Frontend (via SSE)
 * - API → Go service (via HTTP calls in whatsapp.service.ts)
 */

import type { WSContext } from 'hono/ws';
import {
  whatsappEvent,
  type WhatsAppEvent,
} from '@pharmabroker/schemas/whatsapp';
import { whatsappEventPublisher } from '../routers/whatsapp.router';
import { whatsappService } from './whatsapp.service';
import { whatsappGroupsService } from './whatsapp-groups.service';
import {
  whatsappMessagesService,
  type ParsedMessageEvent,
} from './whatsapp-messages.service';
import { messageQueueService } from './message-queue.service';
import { queueMetricsTracker } from '../utils/queue-metrics';
import { historySyncService } from './history-sync.service';
import { env } from '@pharmabroker/env/server';
import prisma from '@pharmabroker/db';
import { logger } from '@pharmabroker/logger';
import {
  whatsappMessagesReceived,
  whatsappSyncDuration,
  recordError,
} from '@pharmabroker/metrics';

// ============================================================================
// Types
// ============================================================================

interface AuthMessage {
  type: 'auth';
  api_key: string;
}

interface AuthResponse {
  type: 'auth_response';
  success: boolean;
  message?: string;
}

interface PongMessage {
  type: 'pong';
}

interface WebSocketClient {
  ws: WSContext;
  authenticated: boolean;
  connectedAt: Date;
}

/** Sync state for a session */
interface SyncState {
  status: 'idle' | 'syncing_groups' | 'processing_queue' | 'ready' | 'failed';
  lastSyncAt?: Date;
  retryCount: number;
  error?: string;
  groupsSynced?: number;
  messagesProcessed?: number;
  messagesDropped?: number;
}

/** Sync status event for frontend */
interface SyncStatusEvent {
  type: 'sync.started' | 'sync.progress' | 'sync.completed' | 'sync.failed';
  session_id: string;
  data?: {
    phase?: 'groups' | 'messages';
    current?: number;
    total?: number;
    groupsSynced?: number;
    messagesProcessed?: number;
    messagesDropped?: number;
    error?: string;
  };
}

/** Configuration for auto-sync */
const AUTO_SYNC_CONFIG = {
  maxRetries: 3,
  retryDelayMs: 5000,
  retryBackoffMultiplier: 2,
};

// ============================================================================
// WebSocket Handler
// ============================================================================

export class WhatsAppWebSocketService {
  private log = logger.child('whatsapp-ws');
  private currentClient: WebSocketClient | null = null;
  private apiKey: string;
  private onConnectedCallback?: () => void | Promise<void>;
  private hasRunInitialSync: boolean = false;

  /** Per-session sync state tracking */
  private syncStates: Map<string, SyncState> = new Map();

  /** Message deduplication cache - stores messageId for last 10 minutes */
  private processedMessages: Map<string, number> = new Map();
  private readonly MESSAGE_DEDUP_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Set a callback to be called when Go service connects and authenticates.
   * Used for session sync on startup.
   */
  onConnected(callback: () => void | Promise<void>): void {
    this.onConnectedCallback = callback;
  }

  /**
   * Get sync state for a session
   */
  getSyncState(sessionId: string): SyncState {
    return (
      this.syncStates.get(sessionId) ?? {
        status: 'idle',
        retryCount: 0,
      }
    );
  }

  /**
   * Set sync state for a session
   */
  private setSyncState(sessionId: string, state: Partial<SyncState>): void {
    const current = this.getSyncState(sessionId);
    this.syncStates.set(sessionId, { ...current, ...state });
  }

  /**
   * Clear sync state for a session
   */
  private clearSyncState(sessionId: string): void {
    this.syncStates.delete(sessionId);
  }

  /**
   * Emit sync status event to frontend clients
   */
  private emitSyncStatusEvent(event: SyncStatusEvent): void {
    this.log.debug('Emitting sync event', {
      type: event.type,
      sessionId: event.session_id,
      data: event.data,
    });
    whatsappEventPublisher.publish('whatsapp-event', {
      type: event.type as any,
      session_id: event.session_id,
      data: event.data ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle new WebSocket connection
   */
  handleOpen(ws: WSContext): void {
    // Close any existing connection
    if (this.currentClient) {
      this.log.info('Replacing existing connection');
    }

    this.currentClient = {
      ws,
      authenticated: false,
      connectedAt: new Date(),
    };
    this.log.info('New connection from Go service');
  }

  /**
   * Handle WebSocket message
   */
  async handleMessage(_ws: WSContext, message: string): Promise<void> {
    // Use current client regardless of ws reference (Hono gives different refs per callback)
    const client = this.currentClient;
    if (!client) {
      this.log.warn('Message but no active client');
      return;
    }

    try {
      const parsed = JSON.parse(message);

      // Handle authentication
      if (parsed.type === 'auth') {
        this.handleAuth(client, parsed as AuthMessage);
        return;
      }

      // Handle ping
      if (parsed.type === 'ping') {
        this.handlePing(client);
        return;
      }

      // Reject messages from unauthenticated clients
      if (!client.authenticated) {
        this.log.warn('Message from unauthenticated client');
        return;
      }

      // Handle WhatsApp events
      await this.handleWhatsAppEvent(parsed);
    } catch (error) {
      this.log.error('Failed to parse message', {
        error: error instanceof Error ? error.message : String(error),
      });
      recordError('ws_message_parse', 'medium');
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(_ws: WSContext): void {
    this.currentClient = null;
    this.log.info('Connection closed');
  }

  /**
   * Handle authentication message
   */
  private handleAuth(client: WebSocketClient, auth: AuthMessage): void {
    // If no API key configured, allow all connections
    const isValid = !this.apiKey || auth.api_key === this.apiKey;

    if (isValid) {
      client.authenticated = true;
      const response: AuthResponse = {
        type: 'auth_response',
        success: true,
        message: 'Authentication successful',
      };
      client.ws.send(JSON.stringify(response));
      this.log.info('Client authenticated successfully');

      // Call onConnected callback for session sync (only on initial connection)
      if (this.onConnectedCallback && !this.hasRunInitialSync) {
        this.hasRunInitialSync = true;
        this.log.info('Running initial session sync');
        try {
          const result = this.onConnectedCallback();
          if (result instanceof Promise) {
            result.catch(err => {
              this.log.error('onConnected callback error', {
                error: err instanceof Error ? err.message : String(err),
              });
              recordError('ws_callback', 'high');
            });
          }
        } catch (err) {
          this.log.error('onConnected callback error', {
            error: err instanceof Error ? err.message : String(err),
          });
          recordError('ws_callback', 'high');
        }
      }
    } else {
      const response: AuthResponse = {
        type: 'auth_response',
        success: false,
        message: 'Invalid API key',
      };
      client.ws.send(JSON.stringify(response));
      this.log.warn('Authentication failed: invalid API key');
      // Close connection after failed auth
      setTimeout(() => client.ws.close(4001, 'Invalid API key'), 100);
    }
  }

  /**
   * Handle ping message
   */
  private handlePing(client: WebSocketClient): void {
    const pong: PongMessage = { type: 'pong' };
    client.ws.send(JSON.stringify(pong));
  }

  /**
   * Handle WhatsApp event from Go service
   */
  private async handleWhatsAppEvent(message: unknown): Promise<void> {
    const result = whatsappEvent.safeParse(message);

    if (!result.success) {
      this.log.warn('Invalid event received', {
        error: result.error.message,
      });
      return;
    }

    const event = result.data;

    // Sync session status to database
    await this.handleSessionStatusSync(event);

    // Publish to EventPublisher for frontend clients
    whatsappEventPublisher.publish('whatsapp-event', event);

    this.log.debug('Event received', { type: event.type });
  }

  /**
   * Handle session status synchronization based on connection events
   * Implements idempotent updates - skips database write if status already matches
   * Triggers auto-sync on connection.connected event
   */
  private async handleSessionStatusSync(event: WhatsAppEvent): Promise<void> {
    try {
      let newStatus:
        | 'pending'
        | 'connecting'
        | 'connected'
        | 'disconnected'
        | null = null;
      let jid: string | undefined;

      switch (event.type) {
        case 'connection.connecting':
          newStatus = 'connecting';
          break;

        case 'connection.connected':
          newStatus = 'connected';

          // Update connection timestamp
          await historySyncService.updateConnectionTimestamps(
            event.session_id,
            'connected',
          );

          // Determine and trigger sync strategy
          const session = await prisma.whatsAppSession.findUnique({
            where: { id: event.session_id },
            select: {
              id: true,
              enableHistorySync: true,
              firstConnectedAt: true,
              lastDisconnectedAt: true,
            },
          });

          if (session) {
            const strategy = historySyncService.determineSyncStrategy(session);

            if (strategy === 'full_history') {
              await historySyncService.triggerFullHistorySync(event.session_id);
            } else if (
              strategy === 'incremental' &&
              session.lastDisconnectedAt
            ) {
              await historySyncService.triggerIncrementalSync(
                event.session_id,
                session.lastDisconnectedAt,
              );
            } else {
              await historySyncService.skipHistorySync(event.session_id);
            }
          }

          // Trigger group sync
          this.triggerGroupSync(event.session_id).catch(err => {
            this.log.error('Auto-sync failed', {
              sessionId: event.session_id,
              error: err instanceof Error ? err.message : String(err),
            });
            recordError('auto_sync', 'high');
          });
          break;

        case 'connection.disconnected':
          newStatus = 'disconnected';

          // Update disconnection timestamp
          await historySyncService.updateConnectionTimestamps(
            event.session_id,
            'disconnected',
          );

          // Clear sync state on disconnect
          this.clearSyncState(event.session_id);
          break;

        case 'connection.failed':
          newStatus = 'disconnected';
          break;

        case 'session.authenticated':
          newStatus = 'connected';
          jid = event.data?.jid;

          // Update connection timestamp
          await historySyncService.updateConnectionTimestamps(
            event.session_id,
            'connected',
          );

          // Determine and trigger sync strategy
          const authSession = await prisma.whatsAppSession.findUnique({
            where: { id: event.session_id },
            select: {
              id: true,
              enableHistorySync: true,
              firstConnectedAt: true,
              lastDisconnectedAt: true,
            },
          });

          if (authSession) {
            const strategy =
              historySyncService.determineSyncStrategy(authSession);

            if (strategy === 'full_history') {
              await historySyncService.triggerFullHistorySync(event.session_id);
            } else if (
              strategy === 'incremental' &&
              authSession.lastDisconnectedAt
            ) {
              await historySyncService.triggerIncrementalSync(
                event.session_id,
                authSession.lastDisconnectedAt,
              );
            } else {
              await historySyncService.skipHistorySync(event.session_id);
            }
          }

          // Trigger group sync
          this.triggerGroupSync(event.session_id).catch(err => {
            this.log.error('Auto-sync failed', {
              sessionId: event.session_id,
              error: err instanceof Error ? err.message : String(err),
            });
            recordError('auto_sync', 'high');
          });
          break;

        case 'connection.logged_out':
          newStatus = 'disconnected';
          // Clear sync state on logout
          this.clearSyncState(event.session_id);
          break;

        case 'message.received':
          // Store incoming messages (may be queued if group not yet synced)
          await this.handleMessageReceived(
            event.session_id,
            event.data as Record<string, unknown>,
          );
          break;
      }

      // Only update if we have a status change to make
      if (newStatus && 'session_id' in event) {
        await this.updateStatusIdempotent(event.session_id, newStatus, jid);
      }
    } catch (error) {
      this.log.error('Failed to sync session status', {
        error: error instanceof Error ? error.message : String(error),
      });
      recordError('session_status_sync', 'medium');
    }
  }

  /**
   * Trigger group sync for a session with retry logic
   */
  async triggerGroupSync(sessionId: string): Promise<void> {
    const currentState = this.getSyncState(sessionId);

    // Don't start a new sync if already syncing
    if (
      currentState.status === 'syncing_groups' ||
      currentState.status === 'processing_queue'
    ) {
      this.log.info('Sync already in progress', { sessionId });
      return;
    }

    // Don't re-sync if already completed recently (within 5 minutes)
    if (
      currentState.status === 'ready' &&
      currentState.lastSyncAt &&
      Date.now() - currentState.lastSyncAt.getTime() < 5 * 60 * 1000
    ) {
      this.log.info('Skipping sync - recently completed', { sessionId });
      return;
    }

    // Update state to syncing
    this.setSyncState(sessionId, {
      status: 'syncing_groups',
      retryCount: 0,
      error: undefined,
    });

    // Emit sync started event
    this.emitSyncStatusEvent({
      type: 'sync.started',
      session_id: sessionId,
      data: { phase: 'groups' },
    });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= AUTO_SYNC_CONFIG.maxRetries; attempt++) {
      try {
        this.log.info('Starting group sync', {
          sessionId,
          attempt: attempt + 1,
          maxRetries: AUTO_SYNC_CONFIG.maxRetries + 1,
        });

        const result =
          await whatsappGroupsService.syncGroupsInternal(sessionId);

        // Success - update state
        this.setSyncState(sessionId, {
          status: 'processing_queue',
          lastSyncAt: new Date(),
          retryCount: attempt,
          groupsSynced: result.synced,
          error: undefined,
        });

        // Emit progress event
        this.emitSyncStatusEvent({
          type: 'sync.progress',
          session_id: sessionId,
          data: {
            phase: 'groups',
            current: result.synced,
            groupsSynced: result.synced,
          },
        });

        this.log.info('Group sync completed', {
          sessionId,
          groupsSynced: result.synced,
        });

        // Process the message queue after successful sync
        await this.processMessageQueue(sessionId);

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.log.error('Group sync failed', {
          sessionId,
          attempt: attempt + 1,
          error: lastError.message,
        });
        recordError('group_sync', 'high');

        this.setSyncState(sessionId, {
          retryCount: attempt + 1,
        });

        // If we have more retries, wait with exponential backoff
        if (attempt < AUTO_SYNC_CONFIG.maxRetries) {
          const delay =
            AUTO_SYNC_CONFIG.retryDelayMs *
            Math.pow(AUTO_SYNC_CONFIG.retryBackoffMultiplier, attempt);
          this.log.info('Retrying group sync', {
            sessionId,
            delayMs: delay,
            nextAttempt: attempt + 2,
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted - mark as failed
    this.setSyncState(sessionId, {
      status: 'failed',
      error: lastError?.message ?? 'Unknown error',
    });

    // Emit sync failed event
    this.emitSyncStatusEvent({
      type: 'sync.failed',
      session_id: sessionId,
      data: {
        error: lastError?.message ?? 'Group sync failed after max retries',
      },
    });

    // Clear the message queue since we can't process it
    const droppedCount = messageQueueService.clear(sessionId);
    if (droppedCount > 0) {
      this.log.warn('Dropped queued messages due to sync failure', {
        sessionId,
        droppedCount,
      });
    }
  }

  /**
   * Process queued messages after group sync completes
   */
  async processMessageQueue(sessionId: string): Promise<void> {
    const startTime = Date.now();

    this.log.info('Starting message queue processing', { sessionId });

    const queueSizeBefore = messageQueueService.size(sessionId);
    this.log.debug('Queue size before drain', {
      sessionId,
      queueSize: queueSizeBefore,
    });

    const messages = messageQueueService.drain(sessionId);

    if (messages.length === 0) {
      this.log.info('No messages to process', { sessionId });

      // No messages to process - mark as ready
      this.setSyncState(sessionId, {
        status: 'ready',
        messagesProcessed: 0,
        messagesDropped: 0,
      });

      // Emit sync completed event
      const state = this.getSyncState(sessionId);
      this.emitSyncStatusEvent({
        type: 'sync.completed',
        session_id: sessionId,
        data: {
          groupsSynced: state.groupsSynced ?? 0,
          messagesProcessed: 0,
          messagesDropped: 0,
        },
      });

      return;
    }

    this.log.info('Drained messages from queue', {
      sessionId,
      messageCount: messages.length,
    });

    // Emit progress event for message processing phase
    this.emitSyncStatusEvent({
      type: 'sync.progress',
      session_id: sessionId,
      data: {
        phase: 'messages',
        current: 0,
        total: messages.length,
      },
    });

    // Process messages through the messages service
    const result =
      await whatsappMessagesService.processQueuedMessages(messages);
    const duration = Date.now() - startTime;

    // Record metrics
    queueMetricsTracker.recordProcessed(sessionId, result.stored, duration);
    whatsappSyncDuration.observe(
      { session_id: sessionId, sync_type: 'message_queue' },
      duration / 1000,
    );

    this.log.info('Queue processing completed', {
      sessionId,
      durationMs: duration,
      stored: result.stored,
      dropped: result.dropped,
    });

    // Log session metrics
    queueMetricsTracker.logSessionMetrics(sessionId);

    // Complete history sync
    await historySyncService.completeSync(sessionId, result);

    // Update state
    this.setSyncState(sessionId, {
      status: 'ready',
      messagesProcessed: result.stored,
      messagesDropped: result.dropped,
    });

    // Emit sync completed event
    const state = this.getSyncState(sessionId);
    this.emitSyncStatusEvent({
      type: 'sync.completed',
      session_id: sessionId,
      data: {
        groupsSynced: state.groupsSynced ?? 0,
        messagesProcessed: result.stored,
        messagesDropped: result.dropped,
      },
    });

    this.log.info('Message queue processed successfully', {
      sessionId,
      stored: result.stored,
      dropped: result.dropped,
      durationMs: duration,
    });
  }

  /**
   * Handle message.received events - store messages in database
   */
  private async handleMessageReceived(
    sessionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      // Validate required fields
      const messageId = data.messageId as string | undefined;
      const chatJid = data.chatJid as string | undefined;
      const senderJid = data.senderJid as string | undefined;
      const messageType = data.messageType as string | undefined;
      const messageTimestamp = data.messageTimestamp as string | undefined;
      const source = data.source as 'realtime' | 'history' | undefined;

      if (
        !messageId ||
        !chatJid ||
        !senderJid ||
        !messageType ||
        !messageTimestamp
      ) {
        this.log.warn('Invalid message event - missing required fields', {
          hasMessageId: !!messageId,
          hasChatJid: !!chatJid,
          hasSenderJid: !!senderJid,
          hasMessageType: !!messageType,
          hasTimestamp: !!messageTimestamp,
        });
        return;
      }

      // Deduplication: Check if we've already processed this message recently
      const dedupKey = `${sessionId}:${messageId}`;
      const now = Date.now();
      const lastProcessed = this.processedMessages.get(dedupKey);

      if (lastProcessed && now - lastProcessed < this.MESSAGE_DEDUP_TTL) {
        this.log.debug('Skipping duplicate message', {
          messageId,
          sessionId,
        });
        return;
      }

      // Mark as processed
      this.processedMessages.set(dedupKey, now);

      // Cleanup old entries periodically (every 100 messages)
      if (this.processedMessages.size % 100 === 0) {
        this.cleanupDedupCache();
      }

      // Only process group messages (JIDs ending with @g.us)
      if (!chatJid.endsWith('@g.us')) {
        // Skip non-group messages silently
        return;
      }

      // Build parsed message event
      const parsedEvent: ParsedMessageEvent = {
        messageId,
        sessionId,
        chatJid,
        senderJid,
        senderPushName: data.senderPushName as string | undefined,
        messageType,
        text: data.text as string | null | undefined,
        caption: data.caption as string | null | undefined,
        filename: data.filename as string | null | undefined,
        mimetype: data.mimetype as string | null | undefined,
        mediaUrl: data.mediaUrl as string | null | undefined,
        mediaKey: data.mediaKey as number[] | null | undefined,
        mediaSha256: data.mediaSha256 as number[] | null | undefined,
        mediaSize: data.mediaSize as number | null | undefined,
        latitude: data.latitude as number | null | undefined,
        longitude: data.longitude as number | null | undefined,
        address: data.address as string | null | undefined,
        vcard: data.vcard as string | null | undefined,
        pollName: data.pollName as string | null | undefined,
        pollOptions: data.pollOptions as string[] | null | undefined,
        reactionEmoji: data.reactionEmoji as string | null | undefined,
        reactionMessageId: data.reactionMessageId as string | null | undefined,
        isFromMe: (data.isFromMe as boolean) ?? false,
        isForwarded: (data.isForwarded as boolean) ?? false,
        isViewOnce: (data.isViewOnce as boolean) ?? false,
        isBroadcast: (data.isBroadcast as boolean) ?? false,
        quotedMessageId: data.quotedMessageId as string | null | undefined,
        messageTimestamp,
        source: source ?? 'realtime',
        rawPayload: data.rawPayload,
      };

      await whatsappMessagesService.storeMessage(parsedEvent);

      // Record metrics
      whatsappMessagesReceived.inc({
        session_id: sessionId,
        type: messageType,
      });
    } catch (error) {
      this.log.error('Failed to store message', {
        error: error instanceof Error ? error.message : String(error),
      });
      recordError('message_store', 'medium');
      // Don't throw - continue processing other events
    }
  }

  /**
   * Update session status idempotently - skips database write if status already matches
   */
  private async updateStatusIdempotent(
    sessionId: string,
    newStatus: 'pending' | 'connecting' | 'connected' | 'disconnected',
    jid?: string,
  ): Promise<void> {
    try {
      // Fetch current session status
      const currentSession = await whatsappService.getSessionStatus(sessionId);

      // Skip update if status already matches (idempotent)
      if (currentSession?.status === newStatus && !jid) {
        this.log.debug('Status unchanged', {
          sessionId,
          status: currentSession.status,
        });
        return;
      }

      // Perform the update
      await whatsappService.updateSessionStatus(sessionId, newStatus, jid);
      this.log.info('Status updated', {
        sessionId,
        newStatus,
      });
    } catch (error) {
      this.log.error('Failed to update status', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      recordError('status_update', 'medium');
    }
  }

  /**
   * Cleanup expired entries from deduplication cache
   */
  private cleanupDedupCache(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, timestamp] of this.processedMessages.entries()) {
      if (now - timestamp > this.MESSAGE_DEDUP_TTL) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.processedMessages.delete(key);
    }

    if (toDelete.length > 0) {
      this.log.debug('Cleaned up expired deduplication entries', {
        count: toDelete.length,
      });
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.currentClient ? 1 : 0;
  }

  /**
   * Get authenticated connection count
   */
  getAuthenticatedCount(): number {
    return this.currentClient?.authenticated ? 1 : 0;
  }

  /**
   * Check if any Go service is connected
   */
  isConnected(): boolean {
    return this.currentClient?.authenticated ?? false;
  }

  /**
   * Get status for health checks
   */
  getStatus(): {
    connected: boolean;
    totalConnections: number;
    authenticatedConnections: number;
  } {
    return {
      connected: this.isConnected(),
      totalConnections: this.getConnectionCount(),
      authenticatedConnections: this.getAuthenticatedCount(),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let wsServiceInstance: WhatsAppWebSocketService | null = null;

/**
 * Get or create the WhatsApp WebSocket service singleton
 */
export function getWhatsAppWebSocketService(): WhatsAppWebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new WhatsAppWebSocketService(env.WHATSAPP_API_KEY);
  }
  return wsServiceInstance;
}
