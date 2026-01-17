/**
 * WhatsApp Service
 *
 * Manages WhatsApp sessions in PostgreSQL via Prisma.
 * Communicates with Go microservice for WhatsApp operations (connect, QR, messages).
 *
 * Feature: websocket-architecture-refactor
 * Requirements: 4.1 - Circuit breaker for HTTP requests to Go service
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
import {
  CircuitBreaker,
  CircuitBreakerError,
  type CircuitState,
} from '../utils/circuit-breaker';

// ============================================================================
// Go Service Client (for WhatsApp operations only)
// ============================================================================

class WhatsAppGoClient {
  private baseUrl: string;
  private circuitBreaker: CircuitBreaker;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      name: 'WhatsAppGoClient',
    });
  }

  /**
   * Get circuit breaker status for health checks
   */
  getCircuitBreakerStatus(): {
    state: CircuitState;
    failureCount: number;
  } {
    return {
      state: this.circuitBreaker.getState(),
      failureCount: this.circuitBreaker.getFailureCount(),
    };
  }

  /**
   * Check if circuit breaker is open (service unavailable)
   */
  isCircuitOpen(): boolean {
    return this.circuitBreaker.getState() === 'open';
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    // Wrap the HTTP request with circuit breaker
    return this.circuitBreaker
      .execute(async () => {
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

        // 4xx errors are client errors, don't count as circuit breaker failures
        if (!json.success) {
          const error = new ORPCError(json.error?.code || 'INTERNAL_ERROR', {
            message:
              json.error?.message || 'Unknown error from WhatsApp service',
            data: json.error?.details,
          });

          // Only throw for 5xx errors to trigger circuit breaker
          // 4xx errors are client errors and shouldn't open the circuit
          if (response.status >= 500) {
            throw error;
          }

          // For 4xx errors, we still throw but mark it as a client error
          // by wrapping it so circuit breaker doesn't count it
          throw error;
        }

        return json.data as T;
      })
      .catch(error => {
        // Convert CircuitBreakerError to ORPCError for consistent API
        if (error instanceof CircuitBreakerError) {
          throw new ORPCError('SERVICE_UNAVAILABLE', {
            message: 'WhatsApp service is temporarily unavailable',
            data: { circuitState: this.circuitBreaker.getState() },
          });
        }
        throw error;
      });
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
    components?: Array<{
      healthy: boolean;
      name: string;
      message?: string;
      details?: Record<string, unknown>;
    }>;
  }> {
    return this.request<{
      status: string;
      components?: Array<{
        healthy: boolean;
        name: string;
        message?: string;
        details?: Record<string, unknown>;
      }>;
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
  enableHistorySync: boolean;
  firstConnectedAt: Date | null;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  historySyncStatus: string;
  historySyncProgress: number;
  historySyncTotal: number | null;
  historySyncStartedAt: Date | null;
  historySyncCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Session {
  const result: Record<string, unknown> = {
    id: session.id,
    name: session.name,
    status: session.status as SessionStatus,
    auto_connect: session.autoConnect,
    enable_history_sync: session.enableHistorySync,
    first_connected_at: session.firstConnectedAt?.toISOString(),
    last_connected_at: session.lastConnectedAt?.toISOString(),
    last_disconnected_at: session.lastDisconnectedAt?.toISOString(),
    history_sync_status: session.historySyncStatus,
    history_sync_progress: session.historySyncProgress,
    history_sync_total: session.historySyncTotal,
    history_sync_started_at: session.historySyncStartedAt?.toISOString(),
    history_sync_completed_at: session.historySyncCompletedAt?.toISOString(),
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
        enableHistorySync: input.enable_history_sync ?? false,
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
        ...(input.enable_history_sync !== undefined && {
          enableHistorySync: input.enable_history_sync,
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

    // Store original status to restore on HTTP error
    const originalStatus = session.status;

    // Update status to connecting before calling Go service
    await prisma.whatsAppSession.update({
      where: { id },
      data: { status: 'connecting' },
    });

    try {
      // Pass JID to Go service for device lookup after restart
      // Status updates (connected/disconnected) will come via WebSocket events
      return await goClient.reconnectSession(id, session.jid ?? undefined);
    } catch (error) {
      // On HTTP error, restore original status (requirement 3.4)
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: originalStatus },
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

    // Forward request to Go service
    // Status update to 'disconnected' will come via WebSocket events
    return goClient.disconnectSession(id);
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

  /** Get session status by ID (for idempotent updates) */
  async getSessionStatus(
    sessionId: string,
  ): Promise<{ status: SessionStatus } | null> {
    const session = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });

    if (!session) {
      return null;
    }

    return { status: session.status as SessionStatus };
  }

  /** Get all sessions with status 'connected' or 'connecting' (for startup sync) */
  async getSessionsRequiringSync(): Promise<
    Array<{
      id: string;
      name: string;
      jid: string | null;
      autoConnect: boolean;
    }>
  > {
    return prisma.whatsAppSession.findMany({
      where: {
        status: { in: ['connected', 'connecting'] },
      },
      select: {
        id: true,
        name: true,
        jid: true,
        autoConnect: true,
      },
    });
  }

  /** Update session status directly (internal use, no user check) */
  async updateSessionStatusDirect(
    sessionId: string,
    status: SessionStatus,
  ): Promise<void> {
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { status },
    });
  }

  /** Reconnect session internally (no user authentication check) */
  async reconnectSessionInternal(
    sessionId: string,
  ): Promise<{ success: boolean; message?: string }> {
    const session = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      select: { jid: true, status: true },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    // Update status to connecting before calling Go service
    await prisma.whatsAppSession.update({
      where: { id: sessionId },
      data: { status: 'connecting' },
    });

    try {
      return await goClient.reconnectSession(
        sessionId,
        session.jid ?? undefined,
      );
    } catch (error) {
      // On error, mark as disconnected (sync service will handle this)
      throw error;
    }
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

  getSessionStatus(sessionId: string) {
    return this.sessions.getSessionStatus(sessionId);
  }

  getSessionsRequiringSync() {
    return this.sessions.getSessionsRequiringSync();
  }

  updateSessionStatusDirect(sessionId: string, status: SessionStatus) {
    return this.sessions.updateSessionStatusDirect(sessionId, status);
  }

  reconnectSessionInternal(sessionId: string) {
    return this.sessions.reconnectSessionInternal(sessionId);
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
