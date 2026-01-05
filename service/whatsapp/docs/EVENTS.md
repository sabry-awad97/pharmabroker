# WhatsApp Service Events

This document describes the event system used by the WhatsApp Service for real-time communication with the API server.

## Overview

The WhatsApp Service publishes events to the API server via WebSocket. These events notify the API server about message status changes, connection state, and session updates.

## Event Structure

All events follow this JSON structure:

```json
{
  "id": "20260105100000.123456789",
  "type": "message.received",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": { ... },
  "timestamp": "2026-01-05T10:00:00Z"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event identifier |
| `type` | string | Event type (see below) |
| `session_id` | string | Associated session UUID |
| `payload` | object | Event-specific data |
| `timestamp` | string | ISO 8601 timestamp |

## Event Types

### Message Events

#### message.received

Triggered when an incoming message is received.

```json
{
  "id": "20260105100000.123456789",
  "type": "message.received",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "message_id": "ABC123",
    "from": "1234567890@s.whatsapp.net",
    "timestamp": "2026-01-05T10:00:00Z",
    "push_name": "John Doe",
    "type": "text",
    "text": "Hello, World!"
  },
  "timestamp": "2026-01-05T10:00:00Z"
}
```

**Payload Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `message_id` | string | WhatsApp message ID |
| `from` | string | Sender's WhatsApp JID |
| `timestamp` | string | Message timestamp |
| `push_name` | string | Sender's display name |
| `type` | string | Message type (text, image, document) |
| `text` | string | Text content (for text messages) |
| `caption` | string | Caption (for media messages) |
| `filename` | string | Filename (for document messages) |

#### message.sent

Triggered when a message is successfully sent.

```json
{
  "id": "20260105100001.123456789",
  "type": "message.sent",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "message_id": "660e8400-e29b-41d4-a716-446655440001",
    "to": "+1234567890",
    "type": "text",
    "status": "sent",
    "timestamp": "2026-01-05T10:00:01Z"
  },
  "timestamp": "2026-01-05T10:00:01Z"
}
```

#### message.delivered

Triggered when a message is delivered to the recipient's device.

```json
{
  "id": "20260105100002.123456789",
  "type": "message.delivered",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "message_ids": ["ABC123", "ABC124"],
    "from": "1234567890@s.whatsapp.net",
    "timestamp": "2026-01-05T10:00:02Z"
  },
  "timestamp": "2026-01-05T10:00:02Z"
}
```

#### message.read

Triggered when a message is read by the recipient.

```json
{
  "id": "20260105100003.123456789",
  "type": "message.read",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "message_ids": ["ABC123"],
    "from": "1234567890@s.whatsapp.net",
    "timestamp": "2026-01-05T10:00:03Z"
  },
  "timestamp": "2026-01-05T10:00:03Z"
}
```

#### message.failed

Triggered when a message fails to send.

```json
{
  "id": "20260105100004.123456789",
  "type": "message.failed",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "message_id": "660e8400-e29b-41d4-a716-446655440001",
    "to": "+1234567890",
    "type": "text",
    "status": "failed",
    "timestamp": "2026-01-05T10:00:04Z"
  },
  "timestamp": "2026-01-05T10:00:04Z"
}
```

### Connection Events

#### connection.connected

Triggered when a session connects to WhatsApp.

```json
{
  "id": "20260105100005.123456789",
  "type": "connection.connected",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "status": "connected"
  },
  "timestamp": "2026-01-05T10:00:05Z"
}
```

#### connection.disconnected

Triggered when a session disconnects from WhatsApp.

```json
{
  "id": "20260105100006.123456789",
  "type": "connection.disconnected",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "status": "disconnected"
  },
  "timestamp": "2026-01-05T10:00:06Z"
}
```

#### connection.logged_out

Triggered when a session is logged out (e.g., from another device).

```json
{
  "id": "20260105100007.123456789",
  "type": "connection.logged_out",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "reason": "logged_out"
  },
  "timestamp": "2026-01-05T10:00:07Z"
}
```

### Session Events

#### session.authenticated

Triggered when a session is successfully authenticated via QR code.

```json
{
  "id": "20260105100008.123456789",
  "type": "session.authenticated",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "jid": "1234567890@s.whatsapp.net"
  },
  "timestamp": "2026-01-05T10:00:08Z"
}
```

#### session.expired

Triggered when a session is deleted or expires.

```json
{
  "id": "20260105100009.123456789",
  "type": "session.expired",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "payload": {
    "action": "deleted"
  },
  "timestamp": "2026-01-05T10:00:09Z"
}
```

## Event Flow

### Message Lifecycle

```
User sends message via API
         │
         ▼
    ┌─────────┐
    │ pending │ (queued for sending)
    └────┬────┘
         │
         ▼
    ┌─────────┐     message.sent
    │  sent   │ ──────────────────► API Server
    └────┬────┘
         │
         ▼
    ┌───────────┐   message.delivered
    │ delivered │ ──────────────────► API Server
    └─────┬─────┘
          │
          ▼
    ┌─────────┐     message.read
    │  read   │ ──────────────────► API Server
    └─────────┘

    OR (on failure)

    ┌─────────┐     message.failed
    │ failed  │ ──────────────────► API Server
    └─────────┘
```

### Session Lifecycle

```
Session created via API
         │
         ▼
    ┌─────────┐
    │ pending │
    └────┬────┘
         │
         ▼ (QR authentication)
    ┌────────────┐
    │ connecting │
    └─────┬──────┘
          │
          ▼
    ┌───────────┐   session.authenticated
    │ connected │ ──────────────────────► API Server
    └─────┬─────┘
          │
          │ (disconnect)
          ▼
    ┌──────────────┐   connection.disconnected
    │ disconnected │ ──────────────────────────► API Server
    └──────────────┘

    OR (logged out from phone)

    ┌────────────┐   connection.logged_out
    │ logged_out │ ──────────────────────► API Server
    └────────────┘
```

## WebSocket Connection

### Connection URL

The service connects to the API server at the URL specified by `WHATSAPP_WEBSOCKET_URL`.

Default: `ws://localhost:3000/ws/whatsapp`

### Connection Management

- **Automatic Reconnection**: The service automatically reconnects on connection loss
- **Exponential Backoff**: Reconnection delay doubles with each attempt (max 10 minutes)
- **Event Queue**: Events are queued during disconnection and sent when reconnected
- **Health Monitoring**: Ping/pong messages ensure connection health

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WHATSAPP_WEBSOCKET_URL` | `ws://localhost:3000/ws/whatsapp` | API server URL |
| `WHATSAPP_WEBSOCKET_PING_INTERVAL` | `30s` | Ping interval |
| `WHATSAPP_WEBSOCKET_PONG_TIMEOUT` | `10s` | Pong timeout |
| `WHATSAPP_WEBSOCKET_RECONNECT_DELAY` | `5s` | Initial reconnect delay |
| `WHATSAPP_WEBSOCKET_MAX_RECONNECTS` | `0` | Max reconnects (0 = unlimited) |
| `WHATSAPP_WEBSOCKET_QUEUE_SIZE` | `1000` | Event queue size |

## Handling Events (API Server)

### Example: Node.js WebSocket Server

```javascript
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3000, path: '/ws/whatsapp' });

wss.on('connection', (ws) => {
  console.log('WhatsApp service connected');

  ws.on('message', (data) => {
    const event = JSON.parse(data);
    
    switch (event.type) {
      case 'message.received':
        handleIncomingMessage(event);
        break;
      case 'message.sent':
        updateMessageStatus(event.payload.message_id, 'sent');
        break;
      case 'message.delivered':
        updateMessageStatus(event.payload.message_ids, 'delivered');
        break;
      case 'message.read':
        updateMessageStatus(event.payload.message_ids, 'read');
        break;
      case 'message.failed':
        handleMessageFailure(event);
        break;
      case 'connection.connected':
        updateSessionStatus(event.session_id, 'connected');
        break;
      case 'connection.disconnected':
        updateSessionStatus(event.session_id, 'disconnected');
        break;
      case 'session.authenticated':
        handleAuthentication(event);
        break;
      default:
        console.log('Unknown event type:', event.type);
    }
  });

  ws.on('close', () => {
    console.log('WhatsApp service disconnected');
  });
});
```

### Example: Go WebSocket Handler

```go
func handleWhatsAppEvents(w http.ResponseWriter, r *http.Request) {
    upgrader := websocket.Upgrader{}
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer conn.Close()

    for {
        _, message, err := conn.ReadMessage()
        if err != nil {
            break
        }

        var event Event
        if err := json.Unmarshal(message, &event); err != nil {
            continue
        }

        switch event.Type {
        case "message.received":
            handleIncomingMessage(event)
        case "message.sent":
            updateMessageStatus(event, "sent")
        case "message.delivered":
            updateMessageStatus(event, "delivered")
        case "message.read":
            updateMessageStatus(event, "read")
        case "message.failed":
            handleMessageFailure(event)
        case "connection.connected":
            updateSessionStatus(event, "connected")
        case "connection.disconnected":
            updateSessionStatus(event, "disconnected")
        case "session.authenticated":
            handleAuthentication(event)
        }
    }
}
```

## Event Reliability

### Delivery Guarantees

- **At-least-once delivery**: Events may be delivered multiple times during reconnection
- **Event queue**: Events are buffered during disconnection (configurable size)
- **Queue overflow**: Oldest events are dropped when queue is full

### Handling Duplicates

Events include a unique `id` field. Use this to deduplicate events:

```javascript
const processedEvents = new Set();

function handleEvent(event) {
  if (processedEvents.has(event.id)) {
    return; // Skip duplicate
  }
  processedEvents.add(event.id);
  
  // Process event...
  
  // Clean up old IDs periodically
  if (processedEvents.size > 10000) {
    // Remove oldest entries
  }
}
```

### Event Ordering

Events are sent in order per session, but may arrive out of order across sessions. Use the `timestamp` field for ordering if needed.
