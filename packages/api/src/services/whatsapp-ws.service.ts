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
  private connections: Map<WSContext, WebSocketClient> = new Map();
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Handle new WebSocket connection
   */
  handleOpen(ws: WSContext): void {
    const client: WebSocketClient = {
      ws,
      authenticated: false,
      connectedAt: new Date(),
    };
    this.connections.set(ws, client);
    console.log('[WhatsAppWS] New connection from Go service');
  }

  /**
   * Handle WebSocket message
   */
  async handleMessage(ws: WSContext, message: string): Promise<void> {
    const client = this.connections.get(ws);
    if (!client) {
      console.warn('[WhatsAppWS] Message from unknown client');
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
  handleClose(ws: WSContext): void {
    this.connections.delete(ws);
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
      }
    } catch (error) {
      console.error('[WhatsAppWS] Failed to sync session status:', error);
    }
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Get authenticated connection count
   */
  getAuthenticatedCount(): number {
    let count = 0;
    for (const client of this.connections.values()) {
      if (client.authenticated) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if any Go service is connected
   */
  isConnected(): boolean {
    return this.getAuthenticatedCount() > 0;
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
