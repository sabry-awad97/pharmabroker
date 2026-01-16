/**
 * Event Bridge Service
 *
 * Maintains a persistent WebSocket connection to the Go WhatsApp service
 * for real-time event streaming. Events are validated and published to
 * the oRPC EventPublisher for frontend clients.
 *
 * Features:
 * - Auto-sync groups on session connection
 * - Message queue for messages arriving before groups are synced
 * - Sync status events for frontend progress tracking
 *
 * Feature: service-status-cleanup, auto-sync-groups-messages
 * Requirements: 1.1, 1.2, 2.2, 2.3
 */

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
import { HEALTH_CONFIG } from '../config/health.config';

// ============================================================================
// Types
// ============================================================================

export interface EventBridgeConfig {
  wsUrl: string;
  apiKey: string;
  pingInterval: number; // ms
  pongTimeout: number; // ms
  reconnectDelay: number; // ms (initial)
  maxReconnectDelay: number; // ms
}

interface AuthMessage {
  type: 'auth';
  api_key: string;
}

interface AuthResponse {
  type: 'auth_response';
  success: boolean;
  message?: string;
}

export interface EventBridgeStatus {
  connected: boolean;
  authenticated: boolean;
  reconnectAttempts: number;
  lastError?: string;
}

/** Sync state for a session */
export interface SyncState {
  status: 'idle' | 'syncing_groups' | 'processing_queue' | 'ready' | 'failed';
  lastSyncAt?: Date;
  retryCount: number;
  error?: string;
  groupsSynced?: number;
  messagesProcessed?: number;
  messagesDropped?: number;
}

/** Sync status event for frontend */
export interface SyncStatusEvent {
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
// Exponential Backoff Calculator
// ============================================================================

/**
 * Calculate reconnection delay with exponential backoff
 * Formula: min(initialDelay * 2^attempts, maxDelay)
 */
export function calculateBackoffDelay(
  attempts: number,
  initialDelay: number,
  maxDelay: number,
): number {
  const delay = initialDelay * Math.pow(2, attempts);
  return Math.min(delay, maxDelay);
}

// ============================================================================
// Event Bridge Service
// ============================================================================

export class EventBridgeService {
  private ws: WebSocket | null = null;
  private config: EventBridgeConfig;
  private connected: boolean = false;
  private authenticated: boolean = false;
  private reconnectAttempts: number = 0;
  private lastError?: string;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect: boolean = true;
  private onConnectedCallback?: () => void | Promise<void>;

  /** Per-session sync state tracking */
  private syncStates: Map<string, SyncState> = new Map();

  constructor(config: EventBridgeConfig) {
    this.config = config;
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
    console.log(
      `[EventBridge] Emitting sync event: ${event.type} for session ${event.session_id}`,
      event.data,
    );
    whatsappEventPublisher.publish('whatsapp-event', {
      type: event.type as any,
      session_id: event.session_id,
      data: event.data ?? {},
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Trigger group sync for a session with retry logic
   * Uses exponential backoff on failure
   * @param sessionId The session to sync groups for
   */
  async triggerGroupSync(sessionId: string): Promise<void> {
    const currentState = this.getSyncState(sessionId);

    // Don't start a new sync if already syncing
    if (
      currentState.status === 'syncing_groups' ||
      currentState.status === 'processing_queue'
    ) {
      console.log(
        `[EventBridge] Sync already in progress for session ${sessionId}`,
      );
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
        console.log(
          `[EventBridge] Starting group sync for session ${sessionId} (attempt ${attempt + 1})`,
        );

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

        console.log(
          `[EventBridge] Group sync completed for session ${sessionId}: ${result.synced} groups synced`,
        );

        // Process the message queue after successful sync
        await this.processMessageQueue(sessionId);

        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(
          `[EventBridge] Group sync failed for session ${sessionId} (attempt ${attempt + 1}):`,
          lastError.message,
        );

        this.setSyncState(sessionId, {
          retryCount: attempt + 1,
        });

        // If we have more retries, wait with exponential backoff
        if (attempt < AUTO_SYNC_CONFIG.maxRetries) {
          const delay =
            AUTO_SYNC_CONFIG.retryDelayMs *
            Math.pow(AUTO_SYNC_CONFIG.retryBackoffMultiplier, attempt);
          console.log(`[EventBridge] Retrying group sync in ${delay}ms...`);
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
      console.warn(
        `[EventBridge] Dropped ${droppedCount} queued messages for session ${sessionId} due to sync failure`,
      );
    }
  }

  /**
   * Process queued messages after group sync completes
   * @param sessionId The session to process messages for
   */
  async processMessageQueue(sessionId: string): Promise<void> {
    const messages = messageQueueService.drain(sessionId);

    if (messages.length === 0) {
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

    console.log(
      `[EventBridge] Processing ${messages.length} queued messages for session ${sessionId}`,
    );

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

    console.log(
      `[EventBridge] Message queue processed for session ${sessionId}: ${result.stored} stored, ${result.dropped} dropped`,
    );
  }

  /**
   * Set a callback to be called when connected (on initial or reconnect)
   */
  onConnected(callback: () => void | Promise<void>): void {
    this.onConnectedCallback = callback;
  }

  /**
   * Connect to the Go service WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws) {
      return; // Already connected or connecting
    }

    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.wsUrl);

        this.ws.onopen = () => {
          console.log('[EventBridge] WebSocket connected, authenticating...');
          this.connected = true;
          this.sendAuth();
        };

        this.ws.onmessage = event => {
          this.handleMessage(event.data as string, resolve, reject);
        };

        this.ws.onclose = event => {
          console.log(
            `[EventBridge] WebSocket closed: ${event.code} ${event.reason}`,
          );
          this.handleDisconnect();
        };

        this.ws.onerror = error => {
          console.error('[EventBridge] WebSocket error:', error);
          this.lastError = 'WebSocket connection error';
          if (!this.connected) {
            reject(new Error('Failed to connect to Go service'));
          }
        };
      } catch (error) {
        this.lastError =
          error instanceof Error ? error.message : 'Unknown error';
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the Go service
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
  }

  /**
   * Check if connected and authenticated
   */
  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  /**
   * Get connection status for health checks
   */
  getStatus(): EventBridgeStatus {
    return {
      connected: this.connected,
      authenticated: this.authenticated,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
    };
  }

  /**
   * Send authentication message
   */
  private sendAuth(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const authMessage: AuthMessage = {
      type: 'auth',
      api_key: this.config.apiKey,
    };

    this.ws.send(JSON.stringify(authMessage));
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(
    data: string,
    onAuthSuccess?: () => void,
    onAuthFailure?: (error: Error) => void,
  ): void {
    try {
      const message = JSON.parse(data);

      // Handle auth response
      if (message.type === 'auth_response') {
        const authResponse = message as AuthResponse;
        if (authResponse.success) {
          console.log('[EventBridge] Authentication successful');
          this.authenticated = true;
          this.reconnectAttempts = 0;
          this.lastError = undefined;
          this.startPingInterval();

          // Call onConnected callback (for session sync on startup/reconnect)
          if (this.onConnectedCallback) {
            try {
              const result = this.onConnectedCallback();
              if (result instanceof Promise) {
                result.catch(err =>
                  console.error(
                    '[EventBridge] onConnected callback error:',
                    err,
                  ),
                );
              }
            } catch (err) {
              console.error('[EventBridge] onConnected callback error:', err);
            }
          }

          onAuthSuccess?.();
        } else {
          const error = new Error(
            authResponse.message || 'Authentication failed',
          );
          this.lastError = error.message;
          console.error(
            '[EventBridge] Authentication failed:',
            authResponse.message,
          );
          onAuthFailure?.(error);
          this.cleanup();
        }
        return;
      }

      // Handle pong response
      if (message.type === 'pong') {
        this.clearPongTimeout();
        return;
      }

      // Validate and publish WhatsApp events
      this.handleWhatsAppEvent(message);
    } catch (error) {
      console.error('[EventBridge] Failed to parse message:', error);
    }
  }

  /**
   * Validate and publish WhatsApp events
   */
  private async handleWhatsAppEvent(message: unknown): Promise<void> {
    const result = whatsappEvent.safeParse(message);

    if (!result.success) {
      console.warn(
        '[EventBridge] Invalid event received:',
        result.error.message,
      );
      return;
    }

    const event = result.data;

    // Handle session status synchronization
    await this.handleSessionStatusSync(event);

    // Publish to EventPublisher for frontend clients
    whatsappEventPublisher.publish('whatsapp-event', event);
  }

  /**
   * Handle session status synchronization based on connection events
   * Triggers auto-sync on connection.connected event
   */
  private async handleSessionStatusSync(event: WhatsAppEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'connection.connected':
          await whatsappService.updateSessionStatus(
            event.session_id,
            'connected',
          );
          // Trigger auto-sync of groups on connection
          // Run async without blocking event processing
          this.triggerGroupSync(event.session_id).catch(err => {
            console.error(
              `[EventBridge] Auto-sync failed for session ${event.session_id}:`,
              err,
            );
          });
          break;

        case 'connection.disconnected':
          await whatsappService.updateSessionStatus(
            event.session_id,
            'disconnected',
          );
          // Clear sync state on disconnect
          this.clearSyncState(event.session_id);
          break;

        case 'session.authenticated':
          if (event.data?.jid) {
            await whatsappService.updateSessionStatus(
              event.session_id,
              'connected',
              event.data.jid,
            );
          }
          break;

        case 'connection.logged_out':
          await whatsappService.updateSessionStatus(
            event.session_id,
            'disconnected',
          );
          // Clear sync state on logout
          this.clearSyncState(event.session_id);
          break;

        case 'message.received':
          // Store incoming messages (may be queued if group not yet synced)
          await this.handleMessageReceived(event.session_id, event.data);
          break;
      }
    } catch (error) {
      console.error('[EventBridge] Failed to sync session status:', error);
      // Continue processing events even if status sync fails
    }
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
        console.warn(
          '[EventBridge] Invalid message event - missing required fields:',
          {
            hasMessageId: !!messageId,
            hasChatJid: !!chatJid,
            hasSenderJid: !!senderJid,
            hasMessageType: !!messageType,
            hasTimestamp: !!messageTimestamp,
          },
        );
        return;
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
    } catch (error) {
      console.error('[EventBridge] Failed to store message:', error);
      // Don't throw - continue processing other events
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(): void {
    this.cleanup();

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    const delay = calculateBackoffDelay(
      this.reconnectAttempts,
      this.config.reconnectDelay,
      this.config.maxReconnectDelay,
    );

    console.log(
      `[EventBridge] Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`,
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectAttempts++;
      try {
        await this.connect();
      } catch (error) {
        console.error('[EventBridge] Reconnection failed:', error);
        // Will trigger another reconnect via handleDisconnect
      }
    }, delay);
  }

  /**
   * Start ping interval for connection health
   */
  private startPingInterval(): void {
    this.pingTimer = setInterval(() => {
      this.sendPing();
    }, this.config.pingInterval);
  }

  /**
   * Send ping message
   */
  private sendPing(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({ type: 'ping' }));

    // Set pong timeout
    this.pongTimer = setTimeout(() => {
      console.warn('[EventBridge] Pong timeout, reconnecting...');
      this.ws?.close();
    }, this.config.pongTimeout);
  }

  /**
   * Clear pong timeout
   */
  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.connected = false;
    this.authenticated = false;

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    this.clearPongTimeout();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let eventBridgeInstance: EventBridgeService | null = null;

/**
 * Create default EventBridge configuration using shared health config constants.
 * Use this when initializing the EventBridge to ensure consistent timing values.
 */
export function createDefaultEventBridgeConfig(
  wsUrl: string,
  apiKey: string,
): EventBridgeConfig {
  return {
    wsUrl,
    apiKey,
    pingInterval: HEALTH_CONFIG.PING_INTERVAL_MS,
    pongTimeout: HEALTH_CONFIG.PONG_TIMEOUT_MS,
    reconnectDelay: HEALTH_CONFIG.RECONNECT_DELAY_MS,
    maxReconnectDelay: HEALTH_CONFIG.MAX_RECONNECT_DELAY_MS,
  };
}

/**
 * Get or create the EventBridge singleton instance
 */
export function getEventBridge(config?: EventBridgeConfig): EventBridgeService {
  if (!eventBridgeInstance && config) {
    eventBridgeInstance = new EventBridgeService(config);
  }

  if (!eventBridgeInstance) {
    throw new Error('EventBridge not initialized. Call with config first.');
  }

  return eventBridgeInstance;
}

/**
 * Initialize and start the EventBridge
 */
export async function initEventBridge(
  config: EventBridgeConfig,
): Promise<EventBridgeService> {
  const bridge = getEventBridge(config);
  await bridge.connect();
  return bridge;
}
