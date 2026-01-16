/**
 * Event Bridge Service
 *
 * Maintains a persistent WebSocket connection to the Go WhatsApp service
 * for real-time event streaming. Events are validated and published to
 * the oRPC EventPublisher for frontend clients.
 *
 * Feature: service-status-cleanup
 * Requirements: 1.1, 1.2, 2.2, 2.3
 */

import {
  whatsappEvent,
  type WhatsAppEvent,
} from '@pharmabroker/schemas/whatsapp';
import { whatsappEventPublisher } from '../routers/whatsapp.router';
import { whatsappService } from './whatsapp.service';
import {
  whatsappMessagesService,
  type ParsedMessageEvent,
} from './whatsapp-messages.service';
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

  constructor(config: EventBridgeConfig) {
    this.config = config;
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
   */
  private async handleSessionStatusSync(event: WhatsAppEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'connection.connected':
          await whatsappService.updateSessionStatus(
            event.session_id,
            'connected',
          );
          break;

        case 'connection.disconnected':
          await whatsappService.updateSessionStatus(
            event.session_id,
            'disconnected',
          );
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
          break;

        case 'message.received':
          // Store incoming messages
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
