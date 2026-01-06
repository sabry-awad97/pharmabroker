/**
 * WhatsApp Service Client
 *
 * HTTP client for communicating with the WhatsApp Go microservice.
 */

import { ORPCError } from '@orpc/server';
import { env } from '@pharmabroker/env/server';
import type {
  Session,
  CreateSessionInput,
  SendMessageInput,
  SendMessageResponse,
  HealthResponse,
  ReadyResponse,
} from '@pharmabroker/schemas/whatsapp';
import { healthStatus, readyStatus } from '@pharmabroker/schemas/whatsapp';

class WhatsAppServiceClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as {
      success: boolean;
      data?: T;
      error?: {
        code: string;
        message: string;
        details?: Record<string, string>;
      };
    };

    if (!json.success) {
      throw new ORPCError(json.error?.code || 'INTERNAL_ERROR', {
        message: json.error?.message || 'Unknown error from WhatsApp service',
        data: json.error?.details,
      });
    }

    return json.data as T;
  }

  async createSession(input: CreateSessionInput): Promise<Session> {
    return this.request<Session>('POST', '/api/sessions', input);
  }

  async listSessions(): Promise<Session[]> {
    return this.request<Session[]>('GET', '/api/sessions');
  }

  async getSession(id: string): Promise<Session> {
    return this.request<Session>('GET', `/api/sessions/${id}`);
  }

  async deleteSession(id: string): Promise<void> {
    await this.request<{ message: string }>('DELETE', `/api/sessions/${id}`);
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>('POST', '/api/messages', input);
  }

  async health(): Promise<HealthResponse> {
    const data = await this.request<{ status: string }>('GET', '/health');
    // Normalize response - Go service returns "healthy", we return "ok"
    return {
      status:
        data.status === 'healthy'
          ? healthStatus.enum.ok
          : healthStatus.enum.unhealthy,
    };
  }

  async ready(): Promise<ReadyResponse> {
    const data = await this.request<{
      status: string;
      components?: Record<string, unknown>;
    }>('GET', '/ready');
    return {
      status:
        data.status === 'ready'
          ? readyStatus.enum.ready
          : readyStatus.enum.not_ready,
      components: data.components,
    };
  }

  getQRWebSocketUrl(sessionId: string): string {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/ws/qr/${sessionId}`;
  }
}

/** Singleton WhatsApp service client */
export const whatsappService = new WhatsAppServiceClient(
  env.WHATSAPP_SERVICE_URL,
);

export { WhatsAppServiceClient };
