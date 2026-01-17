/**
 * Metrics Collection
 *
 * Lightweight metrics collection for monitoring system health and performance.
 * Compatible with Prometheus format.
 */

// ============================================================================
// Types
// ============================================================================

export type MetricType = 'counter' | 'gauge' | 'histogram';

export interface MetricValue {
  value: number;
  timestamp: number;
  labels?: Record<string, string>;
}

export interface Metric {
  name: string;
  type: MetricType;
  help: string;
  values: MetricValue[];
}

export interface HistogramBucket {
  le: number; // Less than or equal
  count: number;
}

// ============================================================================
// Metrics Registry
// ============================================================================

class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private histogramBuckets: Map<string, number[]> = new Map();

  /**
   * Register a counter metric
   */
  counter(name: string, help: string): Counter {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        type: 'counter',
        help,
        values: [],
      });
    }
    return new Counter(name, this);
  }

  /**
   * Register a gauge metric
   */
  gauge(name: string, help: string): Gauge {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        type: 'gauge',
        help,
        values: [],
      });
    }
    return new Gauge(name, this);
  }

  /**
   * Register a histogram metric
   */
  histogram(
    name: string,
    help: string,
    buckets: number[] = [
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ],
  ): Histogram {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        name,
        type: 'histogram',
        help,
        values: [],
      });
      this.histogramBuckets.set(name, buckets);
    }
    return new Histogram(name, this, buckets);
  }

  /**
   * Record a metric value
   */
  record(name: string, value: number, labels?: Record<string, string>): void {
    const metric = this.metrics.get(name);
    if (!metric) return;

    metric.values.push({
      value,
      timestamp: Date.now(),
      labels,
    });

    // Keep only last 1000 values per metric to prevent memory leak
    if (metric.values.length > 1000) {
      metric.values.shift();
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metric by name
   */
  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      // Add help text
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      if (metric.type === 'histogram') {
        // Export histogram buckets
        const buckets = this.histogramBuckets.get(metric.name) ?? [];
        const labelGroups = this.groupByLabels(metric.values);

        for (const [labelStr, values] of labelGroups) {
          const sortedValues = values.map(v => v.value).sort((a, b) => a - b);
          let sum = 0;
          let count = 0;

          for (const bucket of buckets) {
            const bucketCount = sortedValues.filter(v => v <= bucket).length;
            lines.push(
              `${metric.name}_bucket{${labelStr}le="${bucket}"} ${bucketCount}`,
            );
          }

          // Add +Inf bucket
          lines.push(
            `${metric.name}_bucket{${labelStr}le="+Inf"} ${sortedValues.length}`,
          );

          // Add sum and count
          sum = sortedValues.reduce((a, b) => a + b, 0);
          count = sortedValues.length;
          lines.push(`${metric.name}_sum{${labelStr.slice(0, -1)}} ${sum}`);
          lines.push(`${metric.name}_count{${labelStr.slice(0, -1)}} ${count}`);
        }
      } else {
        // Export counter/gauge values
        for (const value of metric.values) {
          const labels = value.labels
            ? Object.entries(value.labels)
                .map(([k, v]) => `${k}="${v}"`)
                .join(',')
            : '';
          const labelStr = labels ? `{${labels}}` : '';
          lines.push(`${metric.name}${labelStr} ${value.value}`);
        }
      }

      lines.push(''); // Empty line between metrics
    }

    return lines.join('\n');
  }

  /**
   * Group metric values by labels
   */
  private groupByLabels(values: MetricValue[]): Map<string, MetricValue[]> {
    const groups = new Map<string, MetricValue[]>();

    for (const value of values) {
      const labelStr = value.labels
        ? Object.entries(value.labels)
            .map(([k, v]) => `${k}="${v}",`)
            .join('')
        : '';

      if (!groups.has(labelStr)) {
        groups.set(labelStr, []);
      }
      groups.get(labelStr)!.push(value);
    }

    return groups;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.values = [];
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.histogramBuckets.clear();
  }
}

// ============================================================================
// Metric Classes
// ============================================================================

class Counter {
  constructor(
    private name: string,
    private registry: MetricsRegistry,
  ) {}

  /**
   * Increment counter
   */
  inc(value: number = 1, labels?: Record<string, string>): void {
    this.registry.record(this.name, value, labels);
  }
}

class Gauge {
  constructor(
    private name: string,
    private registry: MetricsRegistry,
  ) {}

  /**
   * Set gauge value
   */
  set(value: number, labels?: Record<string, string>): void {
    this.registry.record(this.name, value, labels);
  }

  /**
   * Increment gauge
   */
  inc(value: number = 1, labels?: Record<string, string>): void {
    const metric = this.registry.getMetric(this.name);
    const current = metric?.values[metric.values.length - 1]?.value ?? 0;
    this.registry.record(this.name, current + value, labels);
  }

  /**
   * Decrement gauge
   */
  dec(value: number = 1, labels?: Record<string, string>): void {
    this.inc(-value, labels);
  }
}

class Histogram {
  constructor(
    private name: string,
    private registry: MetricsRegistry,
    private buckets: number[],
  ) {}

  /**
   * Observe a value
   */
  observe(value: number, labels?: Record<string, string>): void {
    this.registry.record(this.name, value, labels);
  }

  /**
   * Time a function execution
   */
  async time<T>(
    fn: () => Promise<T>,
    labels?: Record<string, string>,
  ): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      const duration = (Date.now() - start) / 1000; // Convert to seconds
      this.observe(duration, labels);
    }
  }

  /**
   * Create a timer
   */
  startTimer(labels?: Record<string, string>): () => void {
    const start = Date.now();
    return () => {
      const duration = (Date.now() - start) / 1000;
      this.observe(duration, labels);
    };
  }
}

// ============================================================================
// Global Registry
// ============================================================================

export const metrics = new MetricsRegistry();

// ============================================================================
// Application Metrics
// ============================================================================

// HTTP metrics
export const httpRequestsTotal = metrics.counter(
  'http_requests_total',
  'Total number of HTTP requests',
);

export const httpRequestDuration = metrics.histogram(
  'http_request_duration_seconds',
  'HTTP request duration in seconds',
);

export const httpRequestsInFlight = metrics.gauge(
  'http_requests_in_flight',
  'Number of HTTP requests currently being processed',
);

// Database metrics
export const dbQueriesTotal = metrics.counter(
  'db_queries_total',
  'Total number of database queries',
);

export const dbQueryDuration = metrics.histogram(
  'db_query_duration_seconds',
  'Database query duration in seconds',
);

export const dbConnectionsActive = metrics.gauge(
  'db_connections_active',
  'Number of active database connections',
);

// WhatsApp metrics
export const whatsappMessagesReceived = metrics.counter(
  'whatsapp_messages_received_total',
  'Total number of WhatsApp messages received',
);

export const whatsappMessagesQueued = metrics.gauge(
  'whatsapp_messages_queued',
  'Number of messages in queue',
);

export const whatsappGroupsSynced = metrics.counter(
  'whatsapp_groups_synced_total',
  'Total number of WhatsApp groups synced',
);

export const whatsappSyncDuration = metrics.histogram(
  'whatsapp_sync_duration_seconds',
  'WhatsApp sync duration in seconds',
);

// AI metrics
export const aiProcessingTotal = metrics.counter(
  'ai_processing_total',
  'Total number of AI processing requests',
);

export const aiProcessingDuration = metrics.histogram(
  'ai_processing_duration_seconds',
  'AI processing duration in seconds',
);

export const aiDeduplicationRate = metrics.gauge(
  'ai_deduplication_rate',
  'AI content deduplication rate (0-1)',
);

// Queue metrics
export const queueSize = metrics.gauge(
  'queue_size',
  'Number of items in queue',
);

export const queueProcessingDuration = metrics.histogram(
  'queue_processing_duration_seconds',
  'Queue processing duration in seconds',
);

// Error metrics
export const errorsTotal = metrics.counter(
  'errors_total',
  'Total number of errors',
);

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

  httpRequestsTotal.inc(1, labels);
  httpRequestDuration.observe(durationMs / 1000, labels);
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

  dbQueriesTotal.inc(1, labels);
  dbQueryDuration.observe(durationMs / 1000, labels);
}

/**
 * Record error
 */
export function recordError(
  type: string,
  message: string,
  severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
): void {
  errorsTotal.inc(1, { type, severity });
  console.error(`[Error] ${type}: ${message} (severity: ${severity})`);
}
