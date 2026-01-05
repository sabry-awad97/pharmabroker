# WhatsApp Service Configuration

Complete configuration reference for the WhatsApp Service.

## Overview

The service is configured entirely through environment variables. All variables have sensible defaults, making it easy to get started while allowing full customization for production deployments.

## Configuration Loading

Configuration is loaded in the following order:

1. Default values (hardcoded)
2. Environment variables (override defaults)
3. Validation (fail fast on invalid config)

## Environment Variables

### Server Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_SERVER_HOST` | string | `0.0.0.0` | Server bind address |
| `WHATSAPP_SERVER_PORT` | int | `8080` | Server port (1-65535) |

**Example:**

```bash
export WHATSAPP_SERVER_HOST=127.0.0.1
export WHATSAPP_SERVER_PORT=3000
```

### SQLite Database Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_SQLITE_PATH` | string | `/data/whatsapp.db` | Path to SQLite database file |
| `WHATSAPP_SQLITE_BUSY_TIMEOUT` | int | `5000` | Busy timeout in milliseconds |

**Notes:**

- The database file is created automatically if it doesn't exist
- WAL (Write-Ahead Logging) mode is enabled for better concurrency
- The directory must exist and be writable

**Example:**

```bash
export WHATSAPP_SQLITE_PATH=/var/lib/whatsapp/sessions.db
export WHATSAPP_SQLITE_BUSY_TIMEOUT=10000
```

### WhatsApp Client Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_QR_TIMEOUT` | duration | `2m` | QR code authentication timeout |
| `WHATSAPP_RECONNECT_DELAY` | duration | `5s` | Initial delay before reconnection |
| `WHATSAPP_MAX_RECONNECTS` | int | `10` | Maximum reconnection attempts |
| `WHATSAPP_MESSAGE_RATE_LIMIT` | int | `30` | Maximum messages per minute |

**Duration Format:**

- `s` - seconds (e.g., `30s`)
- `m` - minutes (e.g., `2m`)
- `h` - hours (e.g., `1h`)
- Combined: `1h30m`, `90s`

**Example:**

```bash
export WHATSAPP_QR_TIMEOUT=3m
export WHATSAPP_RECONNECT_DELAY=10s
export WHATSAPP_MAX_RECONNECTS=5
export WHATSAPP_MESSAGE_RATE_LIMIT=60
```

### WebSocket Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_WEBSOCKET_URL` | string | `ws://localhost:3000/ws/whatsapp` | API server WebSocket URL |
| `WHATSAPP_WEBSOCKET_PING_INTERVAL` | duration | `30s` | Interval between ping messages |
| `WHATSAPP_WEBSOCKET_PONG_TIMEOUT` | duration | `10s` | Timeout waiting for pong response |
| `WHATSAPP_WEBSOCKET_RECONNECT_DELAY` | duration | `5s` | Initial reconnection delay |
| `WHATSAPP_WEBSOCKET_MAX_RECONNECTS` | int | `0` | Max reconnection attempts (0 = unlimited) |
| `WHATSAPP_WEBSOCKET_QUEUE_SIZE` | int | `1000` | Event queue buffer size |

**Notes:**

- The WebSocket URL should point to your API server's event endpoint
- Setting `MAX_RECONNECTS` to 0 enables unlimited reconnection attempts
- Events are queued when the connection is down and sent when reconnected

**Example:**

```bash
export WHATSAPP_WEBSOCKET_URL=ws://api-server:3000/ws/whatsapp
export WHATSAPP_WEBSOCKET_PING_INTERVAL=60s
export WHATSAPP_WEBSOCKET_PONG_TIMEOUT=15s
export WHATSAPP_WEBSOCKET_MAX_RECONNECTS=0
export WHATSAPP_WEBSOCKET_QUEUE_SIZE=5000
```

### Logging Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_LOG_LEVEL` | string | `info` | Log level |
| `WHATSAPP_LOG_FORMAT` | string | `json` | Log output format |

**Log Levels:**

| Level | Description |
|-------|-------------|
| `debug` | Verbose debugging information |
| `info` | General operational information |
| `warn` | Warning messages |
| `error` | Error messages only |

**Log Formats:**

| Format | Description |
|--------|-------------|
| `json` | Structured JSON logs (recommended for production) |
| `text` | Human-readable text logs (recommended for development) |

**Example:**

```bash
export WHATSAPP_LOG_LEVEL=debug
export WHATSAPP_LOG_FORMAT=text
```

### Rate Limiting Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_RATELIMIT_ENABLED` | bool | `true` | Enable/disable rate limiting |
| `WHATSAPP_RATELIMIT_RPS` | float | `10.0` | Requests per second |
| `WHATSAPP_RATELIMIT_BURST` | int | `20` | Burst size (max concurrent requests) |
| `WHATSAPP_RATELIMIT_BY_IP` | bool | `true` | Rate limit by IP address |
| `WHATSAPP_RATELIMIT_BY_API_KEY` | bool | `false` | Rate limit by API key |
| `WHATSAPP_RATELIMIT_CLEANUP_INTERVAL` | duration | `5m` | Interval to clean up stale limiters |
| `WHATSAPP_RATELIMIT_MAX_AGE` | duration | `1h` | Max age for unused limiters |

**Notes:**

- Rate limiting uses a token bucket algorithm
- When `BY_IP` is enabled, each IP address gets its own rate limit bucket
- Headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` are included in responses
- Returns `429 Too Many Requests` with `Retry-After` header when limit exceeded

**Example:**

```bash
export WHATSAPP_RATELIMIT_ENABLED=true
export WHATSAPP_RATELIMIT_RPS=20
export WHATSAPP_RATELIMIT_BURST=50
export WHATSAPP_RATELIMIT_BY_IP=true
```

### CORS Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_CORS_ORIGINS` | string[] | `*` | Allowed origins (comma-separated) |
| `WHATSAPP_CORS_METHODS` | string[] | `GET,POST,PUT,DELETE,OPTIONS` | Allowed HTTP methods |
| `WHATSAPP_CORS_HEADERS` | string[] | `Origin,Content-Type,Accept,Authorization,X-Request-ID,X-API-Key` | Allowed headers |
| `WHATSAPP_CORS_EXPOSE_HEADERS` | string[] | `X-Request-ID,X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset` | Exposed headers |
| `WHATSAPP_CORS_ALLOW_CREDENTIALS` | bool | `false` | Allow credentials |
| `WHATSAPP_CORS_MAX_AGE` | int | `86400` | Preflight cache duration (seconds) |

**Notes:**

- Use `*` for allowed origins in development only
- In production, specify exact origins for security
- WebSocket connections also validate origin against this list

**Example:**

```bash
export WHATSAPP_CORS_ORIGINS=https://app.example.com,https://admin.example.com
export WHATSAPP_CORS_ALLOW_CREDENTIALS=true
```

### API Key Authentication Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_API_KEY_ENABLED` | bool | `false` | Enable API key authentication |
| `WHATSAPP_API_KEYS` | string[] | `[]` | Valid API keys (comma-separated) |
| `WHATSAPP_API_KEY_HEADER` | string | `X-API-Key` | Header name for API key |

**Notes:**

- When enabled, all `/api/*` endpoints require a valid API key
- Health endpoints (`/health`, `/ready`) and metrics (`/metrics`) bypass authentication
- Multiple API keys can be configured for key rotation
- API keys are case-sensitive

**Example:**

```bash
export WHATSAPP_API_KEY_ENABLED=true
export WHATSAPP_API_KEYS=sk_live_abc123,sk_live_def456
export WHATSAPP_API_KEY_HEADER=X-API-Key
```

### Metrics Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_METRICS_ENABLED` | bool | `true` | Enable Prometheus metrics |
| `WHATSAPP_METRICS_PATH` | string | `/metrics` | Metrics endpoint path |
| `WHATSAPP_METRICS_NAMESPACE` | string | `whatsapp` | Prometheus namespace prefix |

**Available Metrics:**

| Metric | Type | Description |
|--------|------|-------------|
| `whatsapp_http_requests_total` | Counter | Total HTTP requests by method, path, status |
| `whatsapp_http_request_duration_seconds` | Histogram | HTTP request duration |
| `whatsapp_messages_total` | Counter | Total messages by type and status |
| `whatsapp_sessions_total` | Counter | Total sessions by status |
| `whatsapp_active_connections` | Gauge | Current active WebSocket connections |
| `whatsapp_circuit_breaker_state` | Gauge | Circuit breaker state |

**Example:**

```bash
export WHATSAPP_METRICS_ENABLED=true
export WHATSAPP_METRICS_PATH=/metrics
export WHATSAPP_METRICS_NAMESPACE=whatsapp_service
```

### Circuit Breaker Configuration

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `WHATSAPP_CIRCUIT_BREAKER_ENABLED` | bool | `true` | Enable circuit breaker |
| `WHATSAPP_CIRCUIT_BREAKER_MAX_REQUESTS` | int | `3` | Max requests in half-open state |
| `WHATSAPP_CIRCUIT_BREAKER_INTERVAL` | duration | `60s` | Interval for clearing counts |
| `WHATSAPP_CIRCUIT_BREAKER_TIMEOUT` | duration | `30s` | Timeout before half-open |
| `WHATSAPP_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | int | `5` | Failures to open circuit |
| `WHATSAPP_CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | int | `2` | Successes to close circuit |

**Circuit Breaker States:**

| State | Description |
|-------|-------------|
| Closed | Normal operation, requests pass through |
| Open | Circuit tripped, requests fail immediately |
| Half-Open | Testing if service recovered |

**Example:**

```bash
export WHATSAPP_CIRCUIT_BREAKER_ENABLED=true
export WHATSAPP_CIRCUIT_BREAKER_FAILURE_THRESHOLD=10
export WHATSAPP_CIRCUIT_BREAKER_TIMEOUT=60s
```

## Configuration Validation

The service validates all configuration at startup. Invalid configuration causes the service to fail fast with a descriptive error message.

### Validation Rules

| Field | Rule |
|-------|------|
| `server.port` | Must be between 1 and 65535 |
| `sqlite.path` | Must not be empty |
| `sqlite.busy_timeout` | Must be non-negative |
| `whatsapp.qr_timeout` | Must be positive |
| `whatsapp.max_reconnects` | Must be non-negative |
| `whatsapp.message_rate_limit` | Must be non-negative |
| `websocket.url` | Must not be empty |
| `websocket.ping_interval` | Must be positive |
| `websocket.pong_timeout` | Must be positive |
| `websocket.queue_size` | Must be non-negative |
| `log.level` | Must be one of: debug, info, warn, error |
| `log.format` | Must be one of: json, text |

### Validation Error Example

```
failed to load configuration: config validation error: server.port - must be between 1 and 65535; sqlite.path - is required
```

## Environment-Specific Configurations

### Development

```bash
# .env.development
WHATSAPP_SERVER_HOST=127.0.0.1
WHATSAPP_SERVER_PORT=8080
WHATSAPP_SQLITE_PATH=./data/whatsapp.db
WHATSAPP_WEBSOCKET_URL=ws://localhost:3000/ws/whatsapp
WHATSAPP_LOG_LEVEL=debug
WHATSAPP_LOG_FORMAT=text
WHATSAPP_CORS_ORIGINS=*
WHATSAPP_API_KEY_ENABLED=false
WHATSAPP_RATELIMIT_ENABLED=false
WHATSAPP_CIRCUIT_BREAKER_ENABLED=false
```

### Production

```bash
# .env.production
WHATSAPP_SERVER_HOST=0.0.0.0
WHATSAPP_SERVER_PORT=8080
WHATSAPP_SQLITE_PATH=/data/whatsapp.db
WHATSAPP_WEBSOCKET_URL=ws://api-server:3000/ws/whatsapp
WHATSAPP_LOG_LEVEL=info
WHATSAPP_LOG_FORMAT=json
WHATSAPP_QR_TIMEOUT=3m
WHATSAPP_MESSAGE_RATE_LIMIT=60
WHATSAPP_WEBSOCKET_QUEUE_SIZE=5000
WHATSAPP_CORS_ORIGINS=https://app.example.com
WHATSAPP_API_KEY_ENABLED=true
WHATSAPP_API_KEYS=sk_live_your_secure_key_here
WHATSAPP_RATELIMIT_ENABLED=true
WHATSAPP_RATELIMIT_RPS=20
WHATSAPP_RATELIMIT_BURST=50
WHATSAPP_METRICS_ENABLED=true
WHATSAPP_CIRCUIT_BREAKER_ENABLED=true
```

### Docker

```bash
docker run -d \
  -p 8080:8080 \
  -v whatsapp-data:/data \
  -e WHATSAPP_SERVER_PORT=8080 \
  -e WHATSAPP_SQLITE_PATH=/data/whatsapp.db \
  -e WHATSAPP_WEBSOCKET_URL=ws://host.docker.internal:3000/ws/whatsapp \
  -e WHATSAPP_LOG_LEVEL=info \
  -e WHATSAPP_API_KEY_ENABLED=true \
  -e WHATSAPP_API_KEYS=sk_live_your_key \
  -e WHATSAPP_CORS_ORIGINS=https://app.example.com \
  pharmabroker-whatsapp
```

### Docker Compose

```yaml
version: '3.8'

services:
  whatsapp:
    build: ./service/whatsapp
    ports:
      - "8080:8080"
    volumes:
      - whatsapp-data:/data
    environment:
      WHATSAPP_SERVER_HOST: "0.0.0.0"
      WHATSAPP_SERVER_PORT: "8080"
      WHATSAPP_SQLITE_PATH: "/data/whatsapp.db"
      WHATSAPP_WEBSOCKET_URL: "ws://api-server:3000/ws/whatsapp"
      WHATSAPP_LOG_LEVEL: "info"
      WHATSAPP_LOG_FORMAT: "json"
      WHATSAPP_QR_TIMEOUT: "2m"
      WHATSAPP_MESSAGE_RATE_LIMIT: "30"
      WHATSAPP_API_KEY_ENABLED: "true"
      WHATSAPP_API_KEYS: "${WHATSAPP_API_KEYS}"
      WHATSAPP_CORS_ORIGINS: "https://app.example.com"
      WHATSAPP_RATELIMIT_ENABLED: "true"
      WHATSAPP_RATELIMIT_RPS: "20"
      WHATSAPP_METRICS_ENABLED: "true"
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  whatsapp-data:
```

### Kubernetes

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: whatsapp-config
data:
  WHATSAPP_SERVER_HOST: "0.0.0.0"
  WHATSAPP_SERVER_PORT: "8080"
  WHATSAPP_SQLITE_PATH: "/data/whatsapp.db"
  WHATSAPP_WEBSOCKET_URL: "ws://api-server:3000/ws/whatsapp"
  WHATSAPP_LOG_LEVEL: "info"
  WHATSAPP_LOG_FORMAT: "json"
  WHATSAPP_QR_TIMEOUT: "2m"
  WHATSAPP_MESSAGE_RATE_LIMIT: "30"
  WHATSAPP_API_KEY_ENABLED: "true"
  WHATSAPP_CORS_ORIGINS: "https://app.example.com"
  WHATSAPP_RATELIMIT_ENABLED: "true"
  WHATSAPP_RATELIMIT_RPS: "20"
  WHATSAPP_METRICS_ENABLED: "true"
---
apiVersion: v1
kind: Secret
metadata:
  name: whatsapp-secrets
type: Opaque
stringData:
  WHATSAPP_API_KEYS: "sk_live_your_secure_key_here"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whatsapp-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whatsapp
  template:
    metadata:
      labels:
        app: whatsapp
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: whatsapp
          image: pharmabroker-whatsapp:latest
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: whatsapp-config
            - secretRef:
                name: whatsapp-secrets
          volumeMounts:
            - name: data
              mountPath: /data
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: whatsapp-pvc
```

## Backward Compatibility

Some environment variables have aliases for backward compatibility:

| Primary Variable | Alias |
|------------------|-------|
| `WHATSAPP_SQLITE_PATH` | `SQLITE_PATH` |
| `WHATSAPP_WEBSOCKET_URL` | `API_WEBHOOK_URL` |
| `WHATSAPP_LOG_LEVEL` | `LOG_LEVEL` |
| `WHATSAPP_LOG_FORMAT` | `LOG_FORMAT` |

The primary variable takes precedence if both are set.

## Troubleshooting

### Common Issues

**Service fails to start with "config validation error"**

Check that all required environment variables are set correctly. The error message will indicate which field failed validation.

**Database file not created**

Ensure the directory specified in `WHATSAPP_SQLITE_PATH` exists and is writable by the service user.

**WebSocket connection fails**

Verify that:
1. The `WHATSAPP_WEBSOCKET_URL` is correct
2. The API server is running and accepting WebSocket connections
3. Network connectivity between services

**QR authentication times out**

Increase `WHATSAPP_QR_TIMEOUT` if users need more time to scan the QR code.

**Messages not sending**

Check:
1. Session is connected (status = "connected")
2. Rate limit not exceeded
3. Phone number is in E.164 format
