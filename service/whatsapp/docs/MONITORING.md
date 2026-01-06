# WhatsApp Service Monitoring Guide

Comprehensive guide for monitoring the WhatsApp Service using Prometheus metrics, health probes, and structured logging.

## Overview

The WhatsApp Service provides multiple observability features:

- Prometheus metrics endpoint
- Health and readiness probes
- Structured JSON logging
- Request tracing with correlation IDs

## Prometheus Metrics

### Configuration

```bash
WHATSAPP_METRICS_ENABLED=true
WHATSAPP_METRICS_PATH=/metrics
WHATSAPP_METRICS_NAMESPACE=whatsapp
```

### Endpoint

```
GET /metrics
```

Returns Prometheus-formatted metrics.

### Available Metrics

#### HTTP Metrics

| Metric                                   | Type      | Labels               | Description         |
| ---------------------------------------- | --------- | -------------------- | ------------------- |
| `whatsapp_http_requests_total`           | Counter   | method, path, status | Total HTTP requests |
| `whatsapp_http_request_duration_seconds` | Histogram | method, path         | Request duration    |
| `whatsapp_http_request_size_bytes`       | Histogram | method, path         | Request body size   |
| `whatsapp_http_response_size_bytes`      | Histogram | method, path         | Response body size  |

#### Message Metrics

| Metric                                   | Type      | Labels       | Description              |
| ---------------------------------------- | --------- | ------------ | ------------------------ |
| `whatsapp_messages_total`                | Counter   | type, status | Total messages processed |
| `whatsapp_message_send_duration_seconds` | Histogram | type         | Message send duration    |

#### Session Metrics

| Metric                         | Type    | Labels | Description                 |
| ------------------------------ | ------- | ------ | --------------------------- |
| `whatsapp_sessions_total`      | Counter | status | Total sessions by status    |
| `whatsapp_active_sessions`     | Gauge   | -      | Currently active sessions   |
| `whatsapp_session_connections` | Gauge   | -      | Active WhatsApp connections |

#### WebSocket Metrics

| Metric                              | Type    | Labels          | Description                  |
| ----------------------------------- | ------- | --------------- | ---------------------------- |
| `whatsapp_websocket_connections`    | Gauge   | type            | Active WebSocket connections |
| `whatsapp_websocket_messages_total` | Counter | type, direction | WebSocket messages           |

#### Circuit Breaker Metrics

| Metric                                    | Type    | Labels       | Description                                           |
| ----------------------------------------- | ------- | ------------ | ----------------------------------------------------- |
| `whatsapp_circuit_breaker_state`          | Gauge   | name         | Circuit breaker state (0=closed, 1=half-open, 2=open) |
| `whatsapp_circuit_breaker_requests_total` | Counter | name, result | Requests through circuit breaker                      |

#### Rate Limiter Metrics

| Metric                              | Type    | Labels  | Description               |
| ----------------------------------- | ------- | ------- | ------------------------- |
| `whatsapp_ratelimit_requests_total` | Counter | allowed | Rate limited requests     |
| `whatsapp_ratelimit_buckets`        | Gauge   | -       | Active rate limit buckets |

### Prometheus Configuration

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'whatsapp-service'
    static_configs:
      - targets: ['whatsapp-service:8080']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Kubernetes ServiceMonitor

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: whatsapp-service
  labels:
    app: whatsapp
spec:
  selector:
    matchLabels:
      app: whatsapp
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

## Health Probes

### Liveness Probe

```
GET /health
```

Returns `200 OK` if the service is running.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy"
  }
}
```

**Use Case:** Kubernetes liveness probe to restart unhealthy pods.

### Readiness Probe

```
GET /ready
```

Returns `200 OK` if the service is ready to accept traffic.

**Response (Ready):**

```json
{
  "success": true,
  "data": {
    "status": "ready",
    "checks": {
      "database": "healthy",
      "whatsapp": "healthy",
      "event_publisher": "healthy"
    }
  }
}
```

**Response (Not Ready):**

```json
{
  "success": false,
  "error": {
    "code": "NOT_READY",
    "message": "Service is not ready",
    "details": {
      "database": "healthy",
      "whatsapp": "unhealthy",
      "event_publisher": "healthy"
    }
  }
}
```

**Health Checks:**

| Component       | Check                              |
| --------------- | ---------------------------------- |
| Database        | SQLite connection and query        |
| WhatsApp        | Client connection status           |
| Event Publisher | WebSocket connection to API server |

### Kubernetes Configuration

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 30
  timeoutSeconds: 5
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

## Structured Logging

### Configuration

```bash
WHATSAPP_LOG_LEVEL=info
WHATSAPP_LOG_FORMAT=json
```

### Log Levels

| Level   | Description                          |
| ------- | ------------------------------------ |
| `debug` | Verbose debugging (development only) |
| `info`  | General operational information      |
| `warn`  | Warning conditions                   |
| `error` | Error conditions                     |

### Log Format

**JSON Format (Production):**

```json
{
  "level": "info",
  "timestamp": "2026-01-06T10:30:00Z",
  "message": "HTTP request completed",
  "request_id": "abc123",
  "method": "POST",
  "path": "/api/messages",
  "status": 202,
  "duration_ms": 45,
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Text Format (Development):**

```
2026-01-06T10:30:00Z INFO HTTP request completed request_id=abc123 method=POST path=/api/messages status=202 duration_ms=45
```

### Log Fields

| Field         | Description                           |
| ------------- | ------------------------------------- |
| `level`       | Log level                             |
| `timestamp`   | ISO 8601 timestamp                    |
| `message`     | Log message                           |
| `request_id`  | Request correlation ID                |
| `session_id`  | WhatsApp session ID (when applicable) |
| `method`      | HTTP method                           |
| `path`        | Request path                          |
| `status`      | HTTP status code                      |
| `duration_ms` | Request duration in milliseconds      |
| `error`       | Error message (when applicable)       |

### Request Tracing

Every request is assigned a unique `X-Request-ID` header for tracing:

- If provided by client, it's used as-is
- If not provided, a UUID is generated
- Included in all log entries for the request
- Returned in response headers

## Alerting

### Recommended Alerts

#### High Error Rate

```yaml
- alert: WhatsAppHighErrorRate
  expr: |
    sum(rate(whatsapp_http_requests_total{status=~"5.."}[5m]))
    /
    sum(rate(whatsapp_http_requests_total[5m])) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: High error rate in WhatsApp Service
    description: Error rate is {{ $value | humanizePercentage }}
```

#### High Latency

```yaml
- alert: WhatsAppHighLatency
  expr: |
    histogram_quantile(0.95, 
      sum(rate(whatsapp_http_request_duration_seconds_bucket[5m])) by (le)
    ) > 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: High latency in WhatsApp Service
    description: 95th percentile latency is {{ $value }}s
```

#### Circuit Breaker Open

```yaml
- alert: WhatsAppCircuitBreakerOpen
  expr: whatsapp_circuit_breaker_state == 2
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: WhatsApp circuit breaker is open
    description: Circuit breaker {{ $labels.name }} is open
```

#### Rate Limiting Active

```yaml
- alert: WhatsAppRateLimitingActive
  expr: |
    sum(rate(whatsapp_ratelimit_requests_total{allowed="false"}[5m])) > 10
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: High rate of rate-limited requests
    description: {{ $value }} requests/s being rate limited
```

#### Service Not Ready

```yaml
- alert: WhatsAppServiceNotReady
  expr: up{job="whatsapp-service"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: WhatsApp Service is not ready
    description: Service has been unavailable for more than 1 minute
```

#### Message Send Failures

```yaml
- alert: WhatsAppMessageSendFailures
  expr: |
    sum(rate(whatsapp_messages_total{status="failed"}[5m]))
    /
    sum(rate(whatsapp_messages_total[5m])) > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: High message send failure rate
    description: {{ $value | humanizePercentage }} of messages failing
```

## Grafana Dashboards

### Overview Dashboard

Key panels to include:

1. **Request Rate** - `sum(rate(whatsapp_http_requests_total[5m]))`
2. **Error Rate** - `sum(rate(whatsapp_http_requests_total{status=~"5.."}[5m]))`
3. **Latency (p95)** - `histogram_quantile(0.95, sum(rate(whatsapp_http_request_duration_seconds_bucket[5m])) by (le))`
4. **Active Sessions** - `whatsapp_active_sessions`
5. **Messages Sent** - `sum(rate(whatsapp_messages_total{status="sent"}[5m]))`
6. **Circuit Breaker State** - `whatsapp_circuit_breaker_state`

### Sample Dashboard JSON

```json
{
  "title": "WhatsApp Service",
  "panels": [
    {
      "title": "Request Rate",
      "type": "graph",
      "targets": [
        {
          "expr": "sum(rate(whatsapp_http_requests_total[5m])) by (path)",
          "legendFormat": "{{ path }}"
        }
      ]
    },
    {
      "title": "Error Rate",
      "type": "stat",
      "targets": [
        {
          "expr": "sum(rate(whatsapp_http_requests_total{status=~\"5..\"}[5m])) / sum(rate(whatsapp_http_requests_total[5m])) * 100"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "percent",
          "thresholds": {
            "steps": [
              { "color": "green", "value": null },
              { "color": "yellow", "value": 1 },
              { "color": "red", "value": 5 }
            ]
          }
        }
      }
    },
    {
      "title": "Latency Distribution",
      "type": "heatmap",
      "targets": [
        {
          "expr": "sum(rate(whatsapp_http_request_duration_seconds_bucket[5m])) by (le)"
        }
      ]
    }
  ]
}
```

## Log Aggregation

### Fluentd Configuration

```yaml
<source>
@type tail
path /var/log/containers/whatsapp-*.log
pos_file /var/log/fluentd-whatsapp.pos
tag whatsapp
<parse>
@type json
time_key timestamp
time_format %Y-%m-%dT%H:%M:%SZ
</parse>
</source>

<filter whatsapp>
@type record_transformer
<record>
service whatsapp
environment ${ENV}
</record>
</filter>

<match whatsapp>
@type elasticsearch
host elasticsearch
port 9200
index_name whatsapp-logs
</match>
```

### Useful Log Queries

**Errors in last hour:**

```
level:error AND timestamp:[now-1h TO now]
```

**Slow requests (>1s):**

```
duration_ms:>1000
```

**Failed messages:**

```
message:"message send failed"
```

**Requests by session:**

```
session_id:"550e8400-e29b-41d4-a716-446655440000"
```

## Troubleshooting

### High Latency

1. Check circuit breaker state
2. Review WhatsApp connection status
3. Check database query performance
4. Review rate limiting metrics

### Connection Issues

1. Check `/ready` endpoint for component health
2. Review WebSocket connection logs
3. Verify network connectivity to WhatsApp servers
4. Check event publisher connection to API server

### Message Failures

1. Check `whatsapp_messages_total{status="failed"}` metric
2. Review error logs for specific failure reasons
3. Verify session is connected
4. Check rate limiting status

## Best Practices

1. **Set appropriate log levels** - Use `info` in production, `debug` only for troubleshooting
2. **Monitor key metrics** - Focus on error rate, latency, and circuit breaker state
3. **Set up alerts** - Configure alerts for critical conditions
4. **Use request IDs** - Include `X-Request-ID` in client requests for tracing
5. **Regular review** - Periodically review metrics and logs for anomalies
6. **Capacity planning** - Monitor resource usage trends for scaling decisions
