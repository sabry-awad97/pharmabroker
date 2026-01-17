# @pharmabroker/metrics

Prometheus metrics collection package using `prom-client`.

## Features

- **Prometheus Compatible**: Uses official `prom-client` library
- **Pre-configured Metrics**: Common metrics for HTTP, database, WhatsApp, AI, and queues
- **Default Metrics**: Automatic collection of Node.js runtime metrics (CPU, memory, etc.)
- **Type-Safe**: Full TypeScript support
- **Easy Integration**: Simple API for recording metrics

## Installation

```bash
bun add @pharmabroker/metrics
```

## Usage

### Basic Usage

```typescript
import {
  httpRequestsTotal,
  recordHttpRequest,
  getMetrics,
} from '@pharmabroker/metrics';

// Record HTTP request
recordHttpRequest('GET', '/api/users', 200, 150);

// Or use metrics directly
httpRequestsTotal.inc({ method: 'POST', path: '/api/users', status: '201' });

// Get metrics in Prometheus format
const metrics = await getMetrics();
console.log(metrics);
```

### Exposing Metrics Endpoint

```typescript
import { Hono } from 'hono';
import { getMetrics } from '@pharmabroker/metrics';

const app = new Hono();

app.get('/metrics', async c => {
  const metrics = await getMetrics();
  return c.text(metrics, 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
  });
});
```

### Recording History Sync Metrics

```typescript
import { recordHistorySync } from '@pharmabroker/metrics';

// Record successful sync
recordHistorySync(
  'session-123',
  'full_history',
  'success',
  5000, // duration in ms
  1000, // messages processed
);

// Record failed sync
recordHistorySync('session-123', 'incremental', 'failure', 2000, 0);
```

## Available Metrics

### HTTP Metrics

- `pharmabroker_http_requests_total` - Total HTTP requests (counter)
- `pharmabroker_http_request_duration_seconds` - HTTP request duration (histogram)
- `pharmabroker_http_requests_in_flight` - Current HTTP requests (gauge)

### Database Metrics

- `pharmabroker_db_queries_total` - Total database queries (counter)
- `pharmabroker_db_query_duration_seconds` - Query duration (histogram)
- `pharmabroker_db_connections_active` - Active connections (gauge)

### WhatsApp Metrics

- `pharmabroker_whatsapp_messages_received_total` - Messages received (counter)
- `pharmabroker_whatsapp_messages_queued` - Messages in queue (gauge)
- `pharmabroker_whatsapp_groups_synced_total` - Groups synced (counter)
- `pharmabroker_whatsapp_sync_duration_seconds` - Sync duration (histogram)

### History Sync Metrics

- `pharmabroker_history_sync_total` - Total sync operations (counter)
- `pharmabroker_history_sync_duration_seconds` - Sync duration (histogram)
- `pharmabroker_history_sync_messages_processed_total` - Messages processed (counter)

### AI Metrics

- `pharmabroker_ai_processing_total` - AI processing requests (counter)
- `pharmabroker_ai_processing_duration_seconds` - Processing duration (histogram)
- `pharmabroker_ai_deduplication_rate` - Deduplication rate (gauge)

### Queue Metrics

- `pharmabroker_queue_size` - Queue size (gauge)
- `pharmabroker_queue_processing_duration_seconds` - Processing duration (histogram)

### Error Metrics

- `pharmabroker_errors_total` - Total errors (counter)

### Default Metrics

Automatically collected Node.js metrics:

- Process CPU usage
- Process memory usage
- Event loop lag
- Active handles
- And more...

## Utility Functions

### recordHttpRequest

```typescript
recordHttpRequest(method: string, path: string, statusCode: number, durationMs: number)
```

### recordDbQuery

```typescript
recordDbQuery(operation: string, table: string, durationMs: number, success: boolean)
```

### recordError

```typescript
recordError(type: string, severity: 'low' | 'medium' | 'high' | 'critical')
```

### recordHistorySync

```typescript
recordHistorySync(
  sessionId: string,
  syncType: 'full_history' | 'incremental' | 'skip',
  status: 'success' | 'failure' | 'cancelled' | 'skipped',
  durationMs: number,
  messagesProcessed?: number
)
```

### getMetrics

```typescript
async getMetrics(): Promise<string>
```

Returns metrics in Prometheus text format.

### getMetricsJSON

```typescript
async getMetricsJSON(): Promise<unknown>
```

Returns metrics as JSON.

### resetMetrics

```typescript
resetMetrics(): void
```

Resets all metric values (useful for testing).

## Prometheus Configuration

Add this to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'pharmabroker'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

## Grafana Dashboard

Example queries for Grafana:

```promql
# Request rate
rate(pharmabroker_http_requests_total[5m])

# Request duration (95th percentile)
histogram_quantile(0.95, rate(pharmabroker_http_request_duration_seconds_bucket[5m]))

# History sync success rate
rate(pharmabroker_history_sync_total{status="success"}[5m]) / rate(pharmabroker_history_sync_total[5m])

# Active database connections
pharmabroker_db_connections_active
```

## Best Practices

1. **Label Cardinality**: Keep label values bounded to avoid high cardinality
2. **Naming Convention**: Follow Prometheus naming conventions (snake_case, descriptive)
3. **Histogram Buckets**: Choose buckets appropriate for your use case
4. **Scrape Interval**: Balance between freshness and load (15s is typical)
5. **Retention**: Configure Prometheus retention based on your needs
