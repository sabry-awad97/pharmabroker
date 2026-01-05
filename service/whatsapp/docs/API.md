# WhatsApp Service API Documentation

Complete API reference for the WhatsApp Service.

## Base URL

```
http://localhost:8080
```

## Authentication

The API supports optional API key authentication. When enabled, all `/api/*` endpoints require a valid API key.

### API Key Authentication

Include the API key in the request header:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:8080/api/sessions
```

Configure API key authentication via environment variables:
- `WHATSAPP_API_KEY_ENABLED=true` - Enable API key authentication
- `WHATSAPP_API_KEYS=key1,key2,key3` - Comma-separated list of valid API keys
- `WHATSAPP_API_KEY_HEADER=X-API-Key` - Custom header name (default: X-API-Key)

**Note:** Health endpoints (`/health`, `/ready`) and metrics endpoint (`/metrics`) do not require authentication.

## Response Format

All responses follow a consistent JSON structure:

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

## Headers

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes (POST/PUT) | Must be `application/json` |
| `X-Request-ID` | No | Request tracking ID (auto-generated if not provided) |
| `X-API-Key` | Conditional | Required when API key authentication is enabled |

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Request tracking ID |
| `Access-Control-Allow-Origin` | CORS header |
| `X-RateLimit-Limit` | Maximum requests allowed per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the rate limit resets |
| `Retry-After` | Seconds to wait before retrying (when rate limited) |

---

## Health Endpoints

### GET /health

Health check endpoint for load balancers and monitoring.

**Response**

```json
{
  "success": true,
  "data": {
    "status": "healthy"
  }
}
```

### GET /ready

Readiness probe for Kubernetes deployments. Checks database connectivity, WhatsApp client health, and event publisher status.

**Response** `200 OK`

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

**Response** `503 Service Unavailable` (when not ready)

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

---

## Metrics Endpoint

### GET /metrics

Prometheus metrics endpoint for monitoring and observability.

**Response** `200 OK`

Returns Prometheus-formatted metrics including:
- `whatsapp_http_requests_total` - Total HTTP requests by method, path, and status
- `whatsapp_http_request_duration_seconds` - HTTP request duration histogram
- `whatsapp_messages_total` - Total messages by type and status
- `whatsapp_sessions_total` - Total sessions by status
- `whatsapp_active_connections` - Current active WebSocket connections
- `whatsapp_circuit_breaker_state` - Circuit breaker state (0=closed, 1=half-open, 2=open)
```

---

## Session Endpoints

### POST /api/sessions

Create a new WhatsApp session.

**Request Body**

```json
{
  "name": "string (required, 1-100 characters)"
}
```

**Response** `201 Created`

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Session",
    "status": "pending",
    "created_at": "2026-01-05T10:00:00Z",
    "updated_at": "2026-01-05T10:00:00Z"
  }
}
```

**Errors**

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_FAILED` | 400 | Invalid request body |
| `SESSION_EXISTS` | 409 | Session with this name already exists |

---

### GET /api/sessions

List all WhatsApp sessions.

**Response** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "jid": "1234567890@s.whatsapp.net",
      "name": "My Session",
      "status": "connected",
      "created_at": "2026-01-05T10:00:00Z",
      "updated_at": "2026-01-05T10:30:00Z"
    }
  ]
}
```

---

### GET /api/sessions/:id

Get a specific session by ID.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Session ID |

**Response** `200 OK`

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "jid": "1234567890@s.whatsapp.net",
    "name": "My Session",
    "status": "connected",
    "created_at": "2026-01-05T10:00:00Z",
    "updated_at": "2026-01-05T10:30:00Z"
  }
}
```

**Errors**

| Code | Status | Description |
|------|--------|-------------|
| `SESSION_NOT_FOUND` | 404 | Session does not exist |

---

### DELETE /api/sessions/:id

Delete a session and disconnect from WhatsApp.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | UUID | Session ID |

**Response** `200 OK`

```json
{
  "success": true,
  "data": {
    "message": "Session deleted successfully"
  }
}
```

**Errors**

| Code | Status | Description |
|------|--------|-------------|
| `SESSION_NOT_FOUND` | 404 | Session does not exist |

---

## Message Endpoints

### POST /api/messages

Send a WhatsApp message.

**Request Body**

```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "to": "+1234567890",
  "type": "text",
  "content": {
    "text": "Hello, World!"
  }
}
```

**Content Types**

| Type | Required Fields | Description |
|------|-----------------|-------------|
| `text` | `content.text` | Plain text message |
| `image` | `content.image_url` | Image message with optional caption |
| `document` | `content.doc_url` | Document message with optional caption |
| `audio` | `content.audio_url` | Audio message |
| `video` | `content.video_url` | Video message with optional caption |

**Request Schema**

```json
{
  "session_id": "string (required, UUID)",
  "to": "string (required, E.164 format: +1234567890)",
  "type": "string (required, one of: text, image, document, audio, video)",
  "content": {
    "text": "string (required for type=text, max 4096 chars)",
    "image_url": "string (required for type=image, valid URL)",
    "doc_url": "string (required for type=document, valid URL)",
    "audio_url": "string (required for type=audio, valid URL)",
    "video_url": "string (required for type=video, valid URL)",
    "caption": "string (optional, max 1024 chars)",
    "filename": "string (optional, for documents)"
  }
}
```

**Response** `202 Accepted`

```json
{
  "success": true,
  "data": {
    "message_id": "660e8400-e29b-41d4-a716-446655440001",
    "status": "pending"
  }
}
```

**Errors**

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_FAILED` | 400 | Invalid request body |
| `INVALID_PHONE` | 400 | Invalid E.164 phone number |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `DISCONNECTED` | 503 | Session is not connected |
| `MESSAGE_SEND_FAILED` | 500 | Failed to send message |

---

## WebSocket Endpoints

### GET /ws/qr/:session_id

WebSocket endpoint for QR code authentication.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | UUID | Session ID to authenticate |

**Connection**

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/qr/550e8400-e29b-41d4-a716-446655440000');
```

**Message Types**

#### QR Code

Sent when a new QR code is available for scanning.

```json
{
  "type": "qr",
  "data": "base64-encoded-png-image",
  "message": ""
}
```

#### Authenticated

Sent when authentication is successful.

```json
{
  "type": "authenticated",
  "data": {
    "jid": "1234567890@s.whatsapp.net"
  },
  "message": "Successfully authenticated"
}
```

#### Error

Sent when an error occurs.

```json
{
  "type": "error",
  "data": {
    "code": "AUTH_FAILED"
  },
  "message": "Authentication failed"
}
```

#### Timeout

Sent when QR authentication times out.

```json
{
  "type": "timeout",
  "data": null,
  "message": "QR authentication timed out"
}
```

**Error Codes**

| Code | Description |
|------|-------------|
| `SESSION_NOT_FOUND` | Session does not exist |
| `SESSION_BUSY` | Another authentication is in progress |
| `AUTH_FAILED` | Authentication failed |
| `INTERNAL_ERROR` | Internal server error |

**Example Client**

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/qr/550e8400-e29b-41d4-a716-446655440000');

ws.onopen = () => {
  console.log('Connected to QR authentication');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'qr':
      // Display QR code
      const img = document.getElementById('qr-code');
      img.src = 'data:image/png;base64,' + data.data;
      break;
      
    case 'authenticated':
      console.log('Authenticated as:', data.data.jid);
      ws.close();
      break;
      
    case 'error':
      console.error('Error:', data.message);
      ws.close();
      break;
      
    case 'timeout':
      console.log('Timeout:', data.message);
      ws.close();
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('WebSocket closed');
};
```

---

## Session Status Values

| Status | Description |
|--------|-------------|
| `pending` | Session created, awaiting authentication |
| `connecting` | Session is connecting to WhatsApp |
| `connected` | Session is connected and ready |
| `disconnected` | Session is disconnected |
| `logged_out` | Session was logged out |

---

## Message Status Values

| Status | Description |
|--------|-------------|
| `pending` | Message queued for sending |
| `sent` | Message sent to WhatsApp servers |
| `delivered` | Message delivered to recipient |
| `read` | Message read by recipient |
| `failed` | Message sending failed |

---

## Error Reference

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| 200 | Success |
| 201 | Created |
| 202 | Accepted (async operation) |
| 400 | Bad Request |
| 404 | Not Found |
| 408 | Request Timeout |
| 409 | Conflict |
| 415 | Unsupported Media Type |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `VALIDATION_FAILED` | 400 | Request validation failed |
| `INVALID_INPUT` | 400 | Invalid input data |
| `INVALID_PHONE` | 400 | Invalid E.164 phone number |
| `EMPTY_CONTENT` | 400 | Message content is empty |
| `INVALID_MESSAGE_TYPE` | 400 | Invalid message type |
| `SESSION_NOT_FOUND` | 404 | Session does not exist |
| `MESSAGE_NOT_FOUND` | 404 | Message does not exist |
| `NOT_FOUND` | 404 | Resource not found |
| `QR_TIMEOUT` | 408 | QR authentication timed out |
| `SESSION_EXISTS` | 409 | Session already exists |
| `DUPLICATE` | 409 | Resource already exists |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Content-Type must be application/json |
| `MESSAGE_SEND_FAILED` | 500 | Failed to send message |
| `QR_GENERATION_FAILED` | 500 | Failed to generate QR code |
| `AUTH_FAILED` | 500 | Authentication failed |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `INTERNAL_ERROR` | 500 | Internal server error |
| `CONNECTION_FAILED` | 503 | Failed to connect |
| `DISCONNECTED` | 503 | Connection disconnected |
| `RECONNECT_FAILED` | 503 | Failed to reconnect |

---

## Rate Limiting

The service implements configurable rate limiting for all API endpoints:

- Default: 10 requests per second with burst of 20
- Configurable via environment variables
- Per-IP rate limiting by default
- Returns `429 Too Many Requests` when limit exceeded

### Rate Limit Headers

All API responses include rate limit headers:

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests allowed per window |
| `X-RateLimit-Remaining` | Remaining requests in current window |
| `X-RateLimit-Reset` | Unix timestamp when the rate limit resets |

### Rate Limited Response

When rate limit is exceeded, the API returns:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded. Please retry after X seconds"
  }
}
```

The `Retry-After` header indicates how many seconds to wait before retrying.

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_RATELIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `WHATSAPP_RATELIMIT_RPS` | `10` | Requests per second |
| `WHATSAPP_RATELIMIT_BURST` | `20` | Burst size |
| `WHATSAPP_RATELIMIT_BY_IP` | `true` | Rate limit by IP address |

---

## Phone Number Format

Phone numbers must be in E.164 format:

- Start with `+`
- Followed by country code (1-3 digits)
- Followed by subscriber number
- Total length: 2-16 characters

**Examples**

| Valid | Invalid |
|-------|---------|
| `+1234567890` | `1234567890` (missing +) |
| `+14155551234` | `+1-415-555-1234` (contains dashes) |
| `+551199999999` | `(11) 99999-9999` (local format) |
