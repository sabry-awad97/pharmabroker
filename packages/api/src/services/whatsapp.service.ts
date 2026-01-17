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
import { logger } from '@pharmabroker/logger';
import {
  dbQueriesTotal,
  dbQueryDuration,
  recordError,
} from '@pharmabroker/metrics';
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
  private logger = logger.child('WhatsAppGoClient');

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      name: 'WhatsAppGoClient',
    });
    this.logger.info('WhatsApp Go client initialized', { baseUrl });
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
    const startTime = Date.now();

    // Wrap the HTTP request with circuit breaker
    return this.circuitBreaker
      .execute(async () => {
        const url = `${this.baseUrl}${path}`;

        this.logger.debug('Making request to Go service', { method, path });

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });

        const duration = Date.now() - startTime;

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
          this.logger.warn('Go service request failed', {
            method,
            path,
            status: response.status,
            error: json.error,
            duration,
          });

          recordError('go_service_request_failed', 'medium');

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

        this.logger.debug('Go service request successful', {
          method,
          path,
          duration,
        });

        return json.data as T;
      })
      .catch(error => {
        // Convert CircuitBreakerError to ORPCError for consistent API
        if (error instanceof CircuitBreakerError) {
          this.logger.error('Circuit breaker open', {
            circuitState: this.circuitBreaker.getState(),
          });

          recordError('circuit_breaker_open', 'high');

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
  return {
    id: session.id,
    jid: session.jid ?? undefined,
    name: session.name,
    status: session.status as SessionStatus,
    auto_connect: session.autoConnect,
    enable_history_sync: session.enableHistorySync,
    first_connected_at: session.firstConnectedAt?.toISOString() ?? undefined,
    last_connected_at: session.lastConnectedAt?.toISOString() ?? undefined,
    last_disconnected_at:
      session.lastDisconnectedAt?.toISOString() ?? undefined,
    history_sync_status: session.historySyncStatus,
    history_sync_progress: session.historySyncProgress,
    history_sync_total: session.historySyncTotal ?? undefined,
    history_sync_started_at:
      session.historySyncStartedAt?.toISOString() ?? undefined,
    history_sync_completed_at:
      session.historySyncCompletedAt?.toISOString() ?? undefined,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
  } as Session;
}

class WhatsAppSessionService {
  private logger = logger.child('WhatsAppSessionService');

  async createSession(
    userId: string,
    input: CreateSessionInput,
  ): Promise<Session> {
    const startTime = Date.now();

    try {
      const session = await prisma.whatsAppSession.create({
        data: {
          name: input.name,
          autoConnect: input.auto_connect ?? false,
          enableHistorySync: input.enable_history_sync ?? false,
          userId,
          status: 'pending',
        },
      });

      const duration = Date.now() - startTime;
      dbQueriesTotal.inc({
        operation: 'create',
        table: 'whatsapp_session',
        status: 'success',
      });
      dbQueryDuration.observe(
        { operation: 'create', table: 'whatsapp_session', status: 'success' },
        duration / 1000,
      );

      this.logger.info('Session created', {
        sessionId: session.id,
        userId,
        name: input.name,
        duration,
      });

      // Notify Go service (non-blocking)
      goClient.registerSession(session.id, session.name).catch(() => {});

      return mapPrismaSession(session);
    } catch (error) {
      const duration = Date.now() - startTime;
      dbQueriesTotal.inc({
        operation: 'create',
        table: 'whatsapp_session',
        status: 'error',
      });
      dbQueryDuration.observe(
        { operation: 'create', table: 'whatsapp_session', status: 'error' },
        duration / 1000,
      );

      this.logger.error('Failed to create session', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });

      recordError('session_create_failed', 'high');
      throw error;
    }
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
    const startTime = Date.now();

    try {
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

      const duration = Date.now() - startTime;
      dbQueriesTotal.inc({
        operation: 'delete',
        table: 'whatsapp_session',
        status: 'success',
      });
      dbQueryDuration.observe(
        { operation: 'delete', table: 'whatsapp_session', status: 'success' },
        duration / 1000,
      );

      this.logger.info('Session deleted', { sessionId: id, userId, duration });
    } catch (error) {
      const duration = Date.now() - startTime;

      if (!(error instanceof ORPCError && error.code === 'SESSION_NOT_FOUND')) {
        dbQueriesTotal.inc({
          operation: 'delete',
          table: 'whatsapp_session',
          status: 'error',
        });
        dbQueryDuration.observe(
          { operation: 'delete', table: 'whatsapp_session', status: 'error' },
          duration / 1000,
        );

        this.logger.error('Failed to delete session', {
          sessionId: id,
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });

        recordError('session_delete_failed', 'medium');
      }

      throw error;
    }
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

    this.logger.info('Reconnecting session', {
      sessionId: id,
      userId,
      originalStatus,
    });

    // Update status to connecting before calling Go service
    await prisma.whatsAppSession.update({
      where: { id },
      data: { status: 'connecting' },
    });

    try {
      // Pass JID to Go service for device lookup after restart
      // Status updates (connected/disconnected) will come via WebSocket events
      const result = await goClient.reconnectSession(
        id,
        session.jid ?? undefined,
      );

      this.logger.info('Session reconnect initiated', {
        sessionId: id,
        userId,
        success: result.success,
      });

      return result;
    } catch (error) {
      // On HTTP error, restore original status (requirement 3.4)
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: originalStatus },
      });

      this.logger.error('Failed to reconnect session', {
        sessionId: id,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      recordError('session_reconnect_failed', 'high');
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

    this.logger.info('Disconnecting session', { sessionId: id, userId });

    try {
      // Forward request to Go service
      // Status update to 'disconnected' will come via WebSocket events
      const result = await goClient.disconnectSession(id);

      this.logger.info('Session disconnect initiated', {
        sessionId: id,
        userId,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to disconnect session', {
        sessionId: id,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      recordError('session_disconnect_failed', 'medium');
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
