/**
 * Queue Metrics Tracking
 *
 * Tracks metrics for message queue operations including:
 * - Messages queued
 * - Messages dropped (queue full)
 * - Messages expired (timeout)
 * - Queue processing time
 * - Queue size over time
 */

export interface QueueMetrics {
  sessionId: string;
  messagesQueued: number;
  messagesDropped: number;
  messagesExpired: number;
  messagesProcessed: number;
  queueFullEvents: number;
  maxQueueSize: number;
  avgProcessingTimeMs: number;
  lastQueuedAt?: Date;
  lastProcessedAt?: Date;
}

export class QueueMetricsTracker {
  private metrics: Map<string, QueueMetrics> = new Map();
  private processingTimes: Map<string, number[]> = new Map();

  /**
   * Initialize metrics for a session
   */
  private initMetrics(sessionId: string): QueueMetrics {
    const metrics: QueueMetrics = {
      sessionId,
      messagesQueued: 0,
      messagesDropped: 0,
      messagesExpired: 0,
      messagesProcessed: 0,
      queueFullEvents: 0,
      maxQueueSize: 0,
      avgProcessingTimeMs: 0,
    };
    this.metrics.set(sessionId, metrics);
    return metrics;
  }

  /**
   * Get metrics for a session
   */
  getMetrics(sessionId: string): QueueMetrics {
    return this.metrics.get(sessionId) ?? this.initMetrics(sessionId);
  }

  /**
   * Record a message being queued
   */
  recordQueued(sessionId: string, currentQueueSize: number): void {
    const metrics = this.getMetrics(sessionId);
    metrics.messagesQueued++;
    metrics.lastQueuedAt = new Date();
    metrics.maxQueueSize = Math.max(metrics.maxQueueSize, currentQueueSize);
  }

  /**
   * Record a message being dropped due to queue full
   */
  recordDropped(sessionId: string): void {
    const metrics = this.getMetrics(sessionId);
    metrics.messagesDropped++;
    metrics.queueFullEvents++;
  }

  /**
   * Record messages being expired
   */
  recordExpired(sessionId: string, count: number): void {
    const metrics = this.getMetrics(sessionId);
    metrics.messagesExpired += count;
  }

  /**
   * Record messages being processed
   */
  recordProcessed(
    sessionId: string,
    count: number,
    processingTimeMs: number,
  ): void {
    const metrics = this.getMetrics(sessionId);
    metrics.messagesProcessed += count;
    metrics.lastProcessedAt = new Date();

    // Track processing times for average calculation
    let times = this.processingTimes.get(sessionId);
    if (!times) {
      times = [];
      this.processingTimes.set(sessionId, times);
    }
    times.push(processingTimeMs);

    // Keep only last 10 processing times
    if (times.length > 10) {
      times.shift();
    }

    // Calculate average
    metrics.avgProcessingTimeMs =
      times.reduce((sum, t) => sum + t, 0) / times.length;
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): QueueMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    totalQueued: number;
    totalDropped: number;
    totalExpired: number;
    totalProcessed: number;
    dropRate: number;
    expireRate: number;
    activeSessions: number;
  } {
    const allMetrics = this.getAllMetrics();

    const totalQueued = allMetrics.reduce(
      (sum, m) => sum + m.messagesQueued,
      0,
    );
    const totalDropped = allMetrics.reduce(
      (sum, m) => sum + m.messagesDropped,
      0,
    );
    const totalExpired = allMetrics.reduce(
      (sum, m) => sum + m.messagesExpired,
      0,
    );
    const totalProcessed = allMetrics.reduce(
      (sum, m) => sum + m.messagesProcessed,
      0,
    );

    return {
      totalQueued,
      totalDropped,
      totalExpired,
      totalProcessed,
      dropRate: totalQueued > 0 ? (totalDropped / totalQueued) * 100 : 0,
      expireRate: totalQueued > 0 ? (totalExpired / totalQueued) * 100 : 0,
      activeSessions: allMetrics.length,
    };
  }

  /**
   * Reset metrics for a session
   */
  reset(sessionId: string): void {
    this.metrics.delete(sessionId);
    this.processingTimes.delete(sessionId);
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    this.metrics.clear();
    this.processingTimes.clear();
  }

  /**
   * Log metrics summary to console
   */
  logSummary(): void {
    const summary = this.getSummary();
    console.log('[Queue Metrics] Summary:', {
      totalQueued: summary.totalQueued,
      totalProcessed: summary.totalProcessed,
      totalDropped: summary.totalDropped,
      totalExpired: summary.totalExpired,
      dropRate: `${summary.dropRate.toFixed(2)}%`,
      expireRate: `${summary.expireRate.toFixed(2)}%`,
      activeSessions: summary.activeSessions,
    });
  }

  /**
   * Log detailed metrics for a session
   */
  logSessionMetrics(sessionId: string): void {
    const metrics = this.getMetrics(sessionId);
    console.log(`[Queue Metrics] Session ${sessionId}:`, {
      queued: metrics.messagesQueued,
      processed: metrics.messagesProcessed,
      dropped: metrics.messagesDropped,
      expired: metrics.messagesExpired,
      maxQueueSize: metrics.maxQueueSize,
      avgProcessingTimeMs: Math.round(metrics.avgProcessingTimeMs),
      lastQueued: metrics.lastQueuedAt?.toISOString(),
      lastProcessed: metrics.lastProcessedAt?.toISOString(),
    });
  }
}

// Singleton instance
export const queueMetricsTracker = new QueueMetricsTracker();
