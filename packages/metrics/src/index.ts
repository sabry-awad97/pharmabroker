/**
 * Metrics Package
 *
 * Prometheus metrics collection using prom-client.
 * Provides standardized metrics across all services.
 */

import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

// ============================================================================
// Registry
// ============================================================================

export const register = new Registry();

// Collect default metrics (CPU, memory, etc.)
collectDefaultMetrics({
  register,
  prefix: 'pharmabroker_',
});

// ============================================================================
// HTTP Metrics
// ============================================================================

export const httpRequestsTotal = new Counter({
  name: 'pharmabroker_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: 'pharmabroker_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

export const httpRequestsInFlight = new Gauge({
  name: 'pharmabroker_http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [register],
});

// ============================================================================
// Database Metrics
// ============================================================================

export const dbQueriesTotal = new Counter({
  name: 'pharmabroker_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register],
});

export const dbQueryDuration = new Histogram({
  name: 'pharmabroker_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation', 'table', 'status'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

export const dbConnectionsActive = new Gauge({
  name: 'pharmabroker_db_connections_active',
  help: 'Number of active database connections',
  registers: [register],
});

// ============================================================================
// WhatsApp Metrics
// ============================================================================

export const whatsappMessagesReceived = new Counter({
  name: 'pharmabroker_whatsapp_messages_received_total',
  help: 'Total number of WhatsApp messages received',
  labelNames: ['session_id', 'type'],
  registers: [register],
});

export const whatsappMessagesQueued = new Gauge({
  name: 'pharmabroker_whatsapp_messages_queued',
  help: 'Number of messages in queue',
  labelNames: ['session_id'],
  registers: [register],
});

export const whatsappGroupsSynced = new Counter({
  name: 'pharmabroker_whatsapp_groups_synced_total',
  help: 'Total number of WhatsApp groups synced',
  labelNames: ['session_id'],
  registers: [register],
});

export const whatsappSyncDuration = new Histogram({
  name: 'pharmabroker_whatsapp_sync_duration_seconds',
  help: 'WhatsApp sync duration in seconds',
  labelNames: ['session_id', 'sync_type'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

// ============================================================================
// History Sync Metrics
// ============================================================================

export const historySyncTotal = new Counter({
  name: 'pharmabroker_history_sync_total',
  help: 'Total number of history sync operations',
  labelNames: ['session_id', 'sync_type', 'status'],
  registers: [register],
});

export const historySyncDuration = new Histogram({
  name: 'pharmabroker_history_sync_duration_seconds',
  help: 'History sync duration in seconds',
  labelNames: ['session_id', 'sync_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register],
});

export const historySyncMessagesProcessed = new Counter({
  name: 'pharmabroker_history_sync_messages_processed_total',
  help: 'Total number of messages processed during history sync',
  labelNames: ['session_id', 'sync_type', 'status'],
  registers: [register],
});

// ============================================================================
// AI Metrics
// ============================================================================

export const aiProcessingTotal = new Counter({
  name: 'pharmabroker_ai_processing_total',
  help: 'Total number of AI processing requests',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const aiProcessingDuration = new Histogram({
  name: 'pharmabroker_ai_processing_duration_seconds',
  help: 'AI processing duration in seconds',
  labelNames: ['provider', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

export const aiDeduplicationRate = new Gauge({
  name: 'pharmabroker_ai_deduplication_rate',
  help: 'AI content deduplication rate (0-1)',
  registers: [register],
});

// ============================================================================
// Queue Metrics
// ============================================================================

export const queueSize = new Gauge({
  name: 'pharmabroker_queue_size',
  help: 'Number of items in queue',
  labelNames: ['queue_name'],
  registers: [register],
});

export const queueProcessingDuration = new Histogram({
  name: 'pharmabroker_queue_processing_duration_seconds',
  help: 'Queue processing duration in seconds',
  labelNames: ['queue_name'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
  registers: [register],
});

// ============================================================================
// Error Metrics
// ============================================================================

export const errorsTotal = new Counter({
  name: 'pharmabroker_errors_total',
  help: 'Total number of errors',
  labelNames: ['type', 'severity'],
  registers: [register],
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Record HTTP request metrics
 */
export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): void {
  const labels = {
    method,
    path,
    status: statusCode.toString(),
  };

  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1000);
}

/**
 * Record database query metrics
 */
export function recordDbQuery(
  operation: string,
  table: string,
  durationMs: number,
  success: boolean,
): void {
  const labels = {
    operation,
    table,
    status: success ? 'success' : 'error',
  };

  dbQueriesTotal.inc(labels);
  dbQueryDuration.observe(labels, durationMs / 1000);
}

/**
 * Record error
 */
export function recordError(
  type: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
): void {
  errorsTotal.inc({ type, severity });
}

/**
 * Record history sync metrics
 */
export function recordHistorySync(
  sessionId: string,
  syncType: 'full_history' | 'incremental' | 'skip',
  status: 'success' | 'failure' | 'cancelled' | 'skipped',
  durationMs: number,
  messagesProcessed: number = 0,
): void {
  const labels = {
    session_id: sessionId,
    sync_type: syncType,
    status,
  };

  // Record sync attempt
  historySyncTotal.inc(labels);

  // Record duration (only for completed syncs)
  if (status === 'success' || status === 'failure') {
    historySyncDuration.observe(labels, durationMs / 1000);
  }

  // Record messages processed (only for successful syncs)
  if (status === 'success' && messagesProcessed > 0) {
    historySyncMessagesProcessed.inc(labels, messagesProcessed);
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics as JSON
 */
export async function getMetricsJSON(): Promise<unknown> {
  return register.getMetricsAsJSON();
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  register.resetMetrics();
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  register.clear();
}
