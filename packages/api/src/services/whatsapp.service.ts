/**
 * WhatsApp Service
 *
 * Manages WhatsApp sessions in PostgreSQL via Prisma.
 * Communicates with Go microservice for WhatsApp operations (connect, QR, messages).
 */

import { ORPCError } from '@orpc/server';
import { env } from '@pharmabroker/env/server';
import prisma from '@pharmabroker/db';
import type {
  Session,
  CreateSessionInput,
  UpdateSessionInput,
  SendMessageInput,
  SendMessageResponse,
  HealthResponse,
  ReadyResponse,
  SessionStatus,
  ReconnectSessionResponse,
} from '@pharmabroker/schemas/whatsapp';
import { healthStatus, readyStatus } from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Go Service Client (for WhatsApp operations only)
// ============================================================================

class WhatsAppGoClient {
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

  /** Notify Go service about a new session (for internal tracking) */
  async registerSession(sessionId: string, name: string): Promise<void> {
    try {
      await this.request('POST', '/api/internal/sessions/register', {
        id: sessionId,
        name,
      });
    } catch {
      // Non-critical - Go service will create on first connect
    }
  }

  /** Notify Go service to clean up session resources */
  async unregisterSession(sessionId: string): Promise<void> {
    try {
      await this.request(
        'POST',
        `/api/internal/sessions/${sessionId}/unregister`,
      );
    } catch {
      // Non-critical - resources will be cleaned up eventually
    }
  }

  /** Reconnect a session using stored credentials */
  async reconnectSession(
    sessionId: string,
    jid?: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(
      'POST',
      `/api/internal/sessions/${sessionId}/reconnect`,
      jid ? { jid } : undefined,
    );
  }

  /** Disconnect a session (keeps credentials for reconnect) */
  async disconnectSession(
    sessionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(
      'POST',
      `/api/internal/sessions/${sessionId}/disconnect`,
    );
  }

  /** Send a message through WhatsApp */
  async sendMessage(input: SendMessageInput): Promise<SendMessageResponse> {
    return this.request<SendMessageResponse>('POST', '/api/messages', input);
  }

  /** Health check */
  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>('GET', '/health');
  }

  /** Readiness check */
  async ready(): Promise<{
    status: string;
    components?: Record<string, unknown>;
  }> {
    return this.request<{
      status: string;
      components?: Record<string, unknown>;
    }>('GET', '/ready');
  }

  /** Get WebSocket URL for QR streaming */
  getQRWebSocketUrl(sessionId: string): string {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws');
    return `${wsUrl}/ws/qr/${sessionId}`;
  }
}

const goClient = new WhatsAppGoClient(env.WHATSAPP_SERVICE_URL);

// ============================================================================
// Session Management (Prisma)
// ============================================================================

function mapPrismaSession(session: {
  id: string;
  name: string;
  jid: string | null;
  status: string;
  autoConnect: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Session {
  const result: Record<string, unknown> = {
    id: session.id,
    name: session.name,
    status: session.status as SessionStatus,
    auto_connect: session.autoConnect,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  };

  if (session.jid) {
    result.jid = session.jid;
  }

  return result as Session;
}

class WhatsAppSessionService {
  async createSession(
    userId: string,
    input: CreateSessionInput,
  ): Promise<Session> {
    const session = await prisma.whatsAppSession.create({
      data: {
        name: input.name,
        autoConnect: input.auto_connect ?? false,
        userId,
        status: 'pending',
      },
    });

    // Notify Go service (non-blocking)
    goClient.registerSession(session.id, session.name).catch(() => {});

    return mapPrismaSession(session);
  }

  async listSessions(userId: string): Promise<Session[]> {
    const sessions = await prisma.whatsAppSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(mapPrismaSession);
  }

  async getSession(userId: string, id: string): Promise<Session> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    return mapPrismaSession(session);
  }

  async updateSession(
    userId: string,
    input: UpdateSessionInput,
  ): Promise<Session> {
    const existing = await prisma.whatsAppSession.findFirst({
      where: { id: input.id, userId },
    });

    if (!existing) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    const session = await prisma.whatsAppSession.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.auto_connect !== undefined && {
          autoConnect: input.auto_connect,
        }),
      },
    });

    return mapPrismaSession(session);
  }

  async deleteSession(userId: string, id: string): Promise<void> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    // Notify Go service to disconnect and cleanup
    await goClient.unregisterSession(id).catch(() => {});

    await prisma.whatsAppSession.delete({
      where: { id },
    });
  }

  async reconnectSession(
    userId: string,
    id: string,
  ): Promise<ReconnectSessionResponse> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    // Update status to connecting
    await prisma.whatsAppSession.update({
      where: { id },
      data: { status: 'connecting' },
    });

    try {
      // Pass JID to Go service for device lookup after restart
      const result = await goClient.reconnectSession(
        id,
        session.jid ?? undefined,
      );

      // Update status to connected on success
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: 'connected' },
      });

      return result;
    } catch (error) {
      // Revert status on failure
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: 'disconnected' },
      });
      throw error;
    }
  }

  async disconnectSession(
    userId: string,
    id: string,
  ): Promise<ReconnectSessionResponse> {
    const session = await prisma.whatsAppSession.findFirst({
      where: { id, userId },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    try {
      const result = await goClient.disconnectSession(id);

      // Update status to disconnected
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: 'disconnected' },
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

  async updateSessionStatus(
    sessionId: string,
    status: SessionStatus,
    jid?: string,
  ): Promise<Session> {
    const session = await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        status,
        ...(jid && { jid }),
      },
    });

    return mapPrismaSession(session);
  }

  async updateSessionJid(sessionId: string, jid: string): Promise<Session> {
    const session = await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: {
        jid,
        status: 'connected',
      },
    });

    return mapPrismaSession(session);
  }

  /** Get all sessions with autoConnect enabled (for Go service startup) */
  async getAutoConnectSessions(): Promise<Array<{ id: string; name: string }>> {
    const sessions = await prisma.whatsAppSession.findMany({
      where: { autoConnect: true },
      select: { id: true, name: true },
    });
    return sessions;
  }
}

// ============================================================================
// Unified Service Interface
// ============================================================================

class WhatsAppService {
  private sessions = new WhatsAppSessionService();

  // Session Management (Prisma)
  createSession(userId: string, input: CreateSessionInput) {
    return this.sessions.createSession(userId, input);
  }

  listSessions(userId: string) {
    return this.sessions.listSessions(userId);
  }

  getSession(userId: string, id: string) {
    return this.sessions.getSession(userId, id);
  }

  updateSession(userId: string, input: UpdateSessionInput) {
    return this.sessions.updateSession(userId, input);
  }

  deleteSession(userId: string, id: string) {
    return this.sessions.deleteSession(userId, id);
  }

  reconnectSession(userId: string, id: string) {
    return this.sessions.reconnectSession(userId, id);
  }

  disconnectSession(userId: string, id: string) {
    return this.sessions.disconnectSession(userId, id);
  }

  updateSessionStatus(sessionId: string, status: SessionStatus, jid?: string) {
    return this.sessions.updateSessionStatus(sessionId, status, jid);
  }

  updateSessionJid(sessionId: string, jid: string) {
    return this.sessions.updateSessionJid(sessionId, jid);
  }

  getAutoConnectSessions() {
    return this.sessions.getAutoConnectSessions();
  }

  // Messaging (Go Service)
  sendMessage(input: SendMessageInput) {
    return goClient.sendMessage(input);
  }

  // Health (Go Service)
  async health(): Promise<HealthResponse> {
    try {
      const data = await goClient.health();
      return {
        status:
          data.status === 'healthy'
            ? healthStatus.enum.ok
            : healthStatus.enum.unhealthy,
      };
    } catch {
      return { status: healthStatus.enum.unhealthy };
    }
  }

  async ready(): Promise<ReadyResponse> {
    try {
      const data = await goClient.ready();
      return {
        status:
          data.status === 'ready'
            ? readyStatus.enum.ready
            : readyStatus.enum.not_ready,
        components: data.components,
      };
    } catch {
      return { status: readyStatus.enum.not_ready };
    }
  }

  // QR WebSocket URL
  getQRWebSocketUrl(sessionId: string) {
    return goClient.getQRWebSocketUrl(sessionId);
  }
}

/** Singleton WhatsApp service */
export const whatsappService = new WhatsAppService();

export { WhatsAppService, WhatsAppSessionService, WhatsAppGoClient };
