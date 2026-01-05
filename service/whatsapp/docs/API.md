# WhatsApp Service API Documentation

Complete API reference for the WhatsApp Service.

## Base URL

```
http://localhost:8080
```

## Authentication

Currently, the API does not require authentication. In production, implement appropriate authentication middleware.

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

### Response Headers

| Header | Description |
|--------|-------------|
| `X-Request-ID` | Request tracking ID |
| `Access-Control-Allow-Origin` | CORS header |

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

Readiness probe for Kubernetes deployments.

**Response**

```json
{
  "success": true,
  "data": {
    "status": "ready"
  }
}
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
| `image` | `content.image_url` | Image message (not yet implemented) |
| `document` | `content.doc_url` | Document message (not yet implemented) |

**Request Schema**

```json
{
  "session_id": "string (required, UUID)",
  "to": "string (required, E.164 format: +1234567890)",
  "type": "string (required, one of: text, image, document)",
  "content": {
    "text": "string (required for type=text, max 4096 chars)",
    "image_url": "string (required for type=image, valid URL)",
    "doc_url": "string (required for type=document, valid URL)",
    "caption": "string (optional, max 1024 chars)"
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

The service implements rate limiting for message sending:

- Default: 30 messages per minute per session
- Configurable via `WHATSAPP_MESSAGE_RATE_LIMIT`
- Messages exceeding the rate limit are queued
- Queue size: 1000 messages (configurable)

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
