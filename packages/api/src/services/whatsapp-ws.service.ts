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
import { env } from '@pharmabroker/env/server';

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

// ============================================================================
// WebSocket Handler
// ============================================================================

export class WhatsAppWebSocketService {
  private currentClient: WebSocketClient | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Handle new WebSocket connection
   */
  handleOpen(ws: WSContext): void {
    // Close any existing connection
    if (this.currentClient) {
      console.log('[WhatsAppWS] Replacing existing connection');
    }

    this.currentClient = {
      ws,
      authenticated: false,
      connectedAt: new Date(),
    };
    console.log('[WhatsAppWS] New connection from Go service');
  }

  /**
   * Handle WebSocket message
   */
  async handleMessage(_ws: WSContext, message: string): Promise<void> {
    // Use current client regardless of ws reference (Hono gives different refs per callback)
    const client = this.currentClient;
    if (!client) {
      console.warn('[WhatsAppWS] Message but no active client');
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
        console.warn('[WhatsAppWS] Message from unauthenticated client');
        return;
      }

      // Handle WhatsApp events
      await this.handleWhatsAppEvent(parsed);
    } catch (error) {
      console.error('[WhatsAppWS] Failed to parse message:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(_ws: WSContext): void {
    this.currentClient = null;
    console.log('[WhatsAppWS] Connection closed');
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
      console.log('[WhatsAppWS] Client authenticated successfully');
    } else {
      const response: AuthResponse = {
        type: 'auth_response',
        success: false,
        message: 'Invalid API key',
      };
      client.ws.send(JSON.stringify(response));
      console.warn('[WhatsAppWS] Authentication failed: invalid API key');
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
      console.warn(
        '[WhatsAppWS] Invalid event received:',
        result.error.message,
      );
      return;
    }

    const event = result.data;

    // Sync session status to database
    await this.handleSessionStatusSync(event);

    // Publish to EventPublisher for frontend clients
    whatsappEventPublisher.publish('whatsapp-event', event);

    console.log(`[WhatsAppWS] Event received: ${event.type}`);
  }

  /**
   * Handle session status synchronization based on connection events
   * Implements idempotent updates - skips database write if status already matches
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
          break;

        case 'connection.disconnected':
          newStatus = 'disconnected';
          break;

        case 'connection.failed':
          newStatus = 'disconnected';
          break;

        case 'session.authenticated':
          newStatus = 'connected';
          jid = event.data?.jid;
          break;

        case 'connection.logged_out':
          newStatus = 'disconnected';
          break;
      }

      // Only update if we have a status change to make
      if (newStatus && 'session_id' in event) {
        await this.updateStatusIdempotent(event.session_id, newStatus, jid);
      }
    } catch (error) {
      console.error('[WhatsAppWS] Failed to sync session status:', error);
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
        console.log(
          `[WhatsAppWS] Status unchanged: ${sessionId} already ${currentSession.status}`,
        );
        return;
      }

      // Perform the update
      await whatsappService.updateSessionStatus(sessionId, newStatus, jid);
      console.log(`[WhatsAppWS] Status updated: ${sessionId} → ${newStatus}`);
    } catch (error) {
      console.error(
        `[WhatsAppWS] Failed to update status for ${sessionId}:`,
        error,
      );
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
