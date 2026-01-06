# WhatsApp Service

A production-ready Go microservice for WhatsApp integration using the WhatsApp Web protocol. Built with Clean Architecture principles, featuring session management, message sending, real-time QR authentication, and event propagation.

## Features

- **Session Management**: Create, list, retrieve, and delete WhatsApp sessions
- **QR Authentication**: Real-time WebSocket-based QR code authentication
- **Message Sending**: Send text messages with rate limiting and retry logic
- **Event Propagation**: WebSocket-based event publishing to API server
- **Persistence**: SQLite database with WAL mode for session storage
- **Graceful Shutdown**: Proper cleanup of connections and resources

## Architecture

```
service/whatsapp/
├── cmd/whatsapp/          # Application entry point
├── internal/
│   ├── app/               # Module aggregation (Uber Fx)
│   ├── application/       # Use cases and DTOs
│   │   ├── dto/           # Request/Response DTOs
│   │   └── usecase/       # Business logic
│   ├── domain/            # Domain layer
│   │   ├── entity/        # Domain entities
│   │   ├── errors/        # Domain errors
│   │   ├── repository/    # Repository interfaces
│   │   └── valueobject/   # Value objects
│   ├── infrastructure/    # Infrastructure layer
│   │   ├── config/        # Configuration management
│   │   ├── persistence/   # SQLite repository
│   │   ├── websocket/     # Event publisher
│   │   └── whatsapp/      # WhatsApp client (whatsmeow)
│   └── presentation/      # Presentation layer
│       ├── http/          # HTTP handlers, router, middleware
│       └── ws/            # WebSocket handlers
├── pkg/                   # Shared utilities
│   └── validator/         # Input validation
└── test/                  # Tests
    ├── integration/
    └── property/          # Property-based tests
```

## Quick Start

### Prerequisites

- Go 1.24+
- Docker (optional)

### Running Locally

```bash
cd service/whatsapp

# Install dependencies
go mod download

# Run the service
go run ./cmd/whatsapp
```

### Running with Docker

```bash
cd service/whatsapp

# Build the image
docker build -t pharmabroker-whatsapp .

# Run the container
docker run -d \
  -p 8080:8080 \
  -v whatsapp-data:/data \
  -e WHATSAPP_WEBSOCKET_URL=ws://host.docker.internal:3000/ws/whatsapp \
  pharmabroker-whatsapp
```

## API Reference

### Health Endpoints

| Method | Endpoint  | Description     |
| ------ | --------- | --------------- |
| GET    | `/health` | Health check    |
| GET    | `/ready`  | Readiness probe |

### Session Endpoints

| Method | Endpoint            | Description          |
| ------ | ------------------- | -------------------- |
| POST   | `/api/sessions`     | Create a new session |
| GET    | `/api/sessions`     | List all sessions    |
| GET    | `/api/sessions/:id` | Get session by ID    |
| DELETE | `/api/sessions/:id` | Delete a session     |

### Message Endpoints

| Method | Endpoint        | Description    |
| ------ | --------------- | -------------- |
| POST   | `/api/messages` | Send a message |

### WebSocket Endpoints

| Endpoint             | Description                   |
| -------------------- | ----------------------------- |
| `/ws/qr/:session_id` | QR code authentication stream |

## API Examples

### Create Session

```bash
curl -X POST http://localhost:8080/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"name": "My WhatsApp Session"}'
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My WhatsApp Session",
    "status": "pending",
    "created_at": "2026-01-05T10:00:00Z",
    "updated_at": "2026-01-05T10:00:00Z"
  }
}
```

### QR Authentication (WebSocket)

Connect to `/ws/qr/:session_id` to receive QR codes for authentication:

```javascript
const ws = new WebSocket(
  'ws://localhost:8080/ws/qr/550e8400-e29b-41d4-a716-446655440000',
);

ws.onmessage = event => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'qr':
      // data.data contains base64 PNG image
      displayQRCode(data.data);
      break;
    case 'authenticated':
      // data.data.jid contains the WhatsApp JID
      console.log('Authenticated:', data.data.jid);
      break;
    case 'error':
      console.error('Error:', data.message);
      break;
    case 'timeout':
      console.log('QR authentication timed out');
      break;
  }
};
```

### Send Message

```bash
curl -X POST http://localhost:8080/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "to": "+1234567890",
    "type": "text",
    "content": {
      "text": "Hello from WhatsApp Service!"
    }
  }'
```

Response:

```json
{
  "success": true,
  "data": {
    "message_id": "660e8400-e29b-41d4-a716-446655440001",
    "status": "pending"
  }
}
```

### List Sessions

```bash
curl http://localhost:8080/api/sessions
```

### Delete Session

```bash
curl -X DELETE http://localhost:8080/api/sessions/550e8400-e29b-41d4-a716-446655440000
```

## Configuration

All configuration is done via environment variables with sensible defaults.

### Server Configuration

| Variable               | Default   | Description         |
| ---------------------- | --------- | ------------------- |
| `WHATSAPP_SERVER_HOST` | `0.0.0.0` | Server bind address |
| `WHATSAPP_SERVER_PORT` | `8080`    | Server port         |

### Database Configuration

| Variable                       | Default             | Description              |
| ------------------------------ | ------------------- | ------------------------ |
| `WHATSAPP_SQLITE_PATH`         | `/data/whatsapp.db` | SQLite database path     |
| `WHATSAPP_SQLITE_BUSY_TIMEOUT` | `5000`              | SQLite busy timeout (ms) |

### WhatsApp Client Configuration

| Variable                      | Default | Description                   |
| ----------------------------- | ------- | ----------------------------- |
| `WHATSAPP_QR_TIMEOUT`         | `2m`    | QR authentication timeout     |
| `WHATSAPP_RECONNECT_DELAY`    | `5s`    | Initial reconnect delay       |
| `WHATSAPP_MAX_RECONNECTS`     | `10`    | Maximum reconnection attempts |
| `WHATSAPP_MESSAGE_RATE_LIMIT` | `30`    | Messages per minute           |

### WebSocket Configuration

| Variable                             | Default                           | Description                    |
| ------------------------------------ | --------------------------------- | ------------------------------ |
| `WHATSAPP_WEBSOCKET_URL`             | `ws://localhost:3000/ws/whatsapp` | API server WebSocket URL       |
| `WHATSAPP_WEBSOCKET_PING_INTERVAL`   | `30s`                             | Ping interval                  |
| `WHATSAPP_WEBSOCKET_PONG_TIMEOUT`    | `10s`                             | Pong timeout                   |
| `WHATSAPP_WEBSOCKET_RECONNECT_DELAY` | `5s`                              | Reconnect delay                |
| `WHATSAPP_WEBSOCKET_MAX_RECONNECTS`  | `0`                               | Max reconnects (0 = unlimited) |
| `WHATSAPP_WEBSOCKET_QUEUE_SIZE`      | `1000`                            | Event queue size               |

### Logging Configuration

| Variable              | Default | Description                          |
| --------------------- | ------- | ------------------------------------ |
| `WHATSAPP_LOG_LEVEL`  | `info`  | Log level (debug, info, warn, error) |
| `WHATSAPP_LOG_FORMAT` | `json`  | Log format (json, text)              |

## Events

The service publishes events to the API server via WebSocket. Event types include:

### Message Events

- `message.received` - Incoming message received
- `message.sent` - Message sent successfully
- `message.delivered` - Message delivered to recipient
- `message.read` - Message read by recipient
- `message.failed` - Message sending failed

### Connection Events

- `connection.connected` - Session connected
- `connection.disconnected` - Session disconnected
- `connection.logged_out` - Session logged out

### Session Events

- `session.qr_scanned` - QR code scanned
- `session.authenticated` - Session authenticated
- `session.expired` - Session expired

## Error Codes

| Code                  | HTTP Status | Description                 |
| --------------------- | ----------- | --------------------------- |
| `SESSION_NOT_FOUND`   | 404         | Session does not exist      |
| `SESSION_EXISTS`      | 409         | Session already exists      |
| `INVALID_PHONE`       | 400         | Invalid E.164 phone number  |
| `VALIDATION_FAILED`   | 400         | Request validation failed   |
| `MESSAGE_SEND_FAILED` | 500         | Failed to send message      |
| `QR_TIMEOUT`          | 408         | QR authentication timed out |
| `CONNECTION_FAILED`   | 503         | Failed to connect           |
| `DATABASE_ERROR`      | 500         | Database operation failed   |

## Development

### Running Tests

```bash
# Run all tests
go test ./...

# Run property-based tests
go test ./test/property/...

# Run with coverage
go test -cover ./...
```

### Hot Reload (Development)

The service includes an Air configuration for hot reload:

```bash
# Install Air
go install github.com/air-verse/air@latest

# Run with hot reload
air
```

## Docker

### Build

```bash
docker build -t pharmabroker-whatsapp .
```

### Environment Variables

```bash
docker run -d \
  -p 8080:8080 \
  -v whatsapp-data:/data \
  -e WHATSAPP_SERVER_PORT=8080 \
  -e WHATSAPP_SQLITE_PATH=/data/whatsapp.db \
  -e WHATSAPP_WEBSOCKET_URL=ws://api-server:3000/ws/whatsapp \
  -e WHATSAPP_LOG_LEVEL=info \
  pharmabroker-whatsapp
```

### Health Check

The Docker image includes a health check that polls `/health` every 30 seconds.

## Dependencies

- [Gin](https://github.com/gin-gonic/gin) - HTTP framework
- [whatsmeow](https://github.com/tulir/whatsmeow) - WhatsApp Web client
- [Gorilla WebSocket](https://github.com/gorilla/websocket) - WebSocket implementation
- [Uber Fx](https://github.com/uber-go/fx) - Dependency injection
- [Viper](https://github.com/spf13/viper) - Configuration management
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) - Pure Go SQLite driver

## License

Proprietary - PharmaBroker
