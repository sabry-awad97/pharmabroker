# WhatsApp Service Architecture

This document describes the architecture and design decisions of the WhatsApp Service.

## Overview

The WhatsApp Service is a Go microservice that provides WhatsApp integration capabilities through a REST API and WebSocket interface. It follows Clean Architecture principles with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Presentation Layer                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           HTTP Server (Gin)                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐││
│  │  │   Router    │  │  Handlers   │  │ Middleware  │  │ QR WebSocket    │││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application Layer                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                              Use Cases                                  ││
│  │  ┌─────────────────────────┐  ┌─────────────────────────────────────┐  ││
│  │  │    SessionUseCase       │  │       MessageUseCase                │  ││
│  │  │  - CreateSession        │  │  - SendMessage                      │  ││
│  │  │  - GetSession           │  │  - SendMessageSync                  │  ││
│  │  │  - ListSessions         │  │  - HandleIncomingMessage            │  ││
│  │  │  - DeleteSession        │  │  - HandleMessageStatusUpdate        │  ││
│  │  │  - StartQRAuth          │  │  - Rate Limiting                    │  ││
│  │  │  - ReconnectSession     │  │  - Retry Logic                      │  ││
│  │  └─────────────────────────┘  └─────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                                DTOs                                     ││
│  │  CreateSessionRequest, SendMessageRequest, SessionResponse, etc.        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               Domain Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                              Entities                                   ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐││
│  │  │   Session   │  │   Message   │  │    Event    │  │    QREvent      │││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Value Objects                                 ││
│  │  ┌─────────────────────────────────────────────────────────────────┐   ││
│  │  │                        PhoneNumber                              │   ││
│  │  └─────────────────────────────────────────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Repository Interfaces                           ││
│  │  SessionRepository, WhatsAppClient, EventPublisher, MessageQueue        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Domain Errors                                 ││
│  │  ErrSessionNotFound, ErrInvalidPhoneNumber, ErrMessageSendFailed, etc.  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Infrastructure Layer                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Implementations                               ││
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────┐ ││
│  │  │ SQLiteSessionRepo   │  │  WhatsmeowClient    │  │ GorillaPublisher│ ││
│  │  │ (persistence)       │  │  (whatsapp)         │  │ (websocket)     │ ││
│  │  └─────────────────────┘  └─────────────────────┘  └─────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                           Configuration                                 ││
│  │  Config, ServerConfig, SQLiteConfig, WhatsAppConfig, WebSocketConfig    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Systems                                  │
│  ┌─────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐ │
│  │     SQLite      │  │   WhatsApp Web      │  │     API Server          │ │
│  │   (Database)    │  │   (whatsmeow)       │  │   (WebSocket)           │ │
│  └─────────────────┘  └─────────────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### Presentation Layer

The presentation layer handles all external communication:

- **HTTP Router**: Route definitions and middleware chain
- **Handlers**: Request parsing, validation, and response formatting
- **Middleware**: Cross-cutting concerns (logging, CORS, error handling)
- **WebSocket Handler**: Real-time QR code authentication

### Application Layer

The application layer contains business logic:

- **Use Cases**: Orchestrate domain operations
- **DTOs**: Data transfer objects for API communication
- **Validation**: Input validation rules

### Domain Layer

The domain layer contains core business concepts:

- **Entities**: Core business objects (Session, Message, Event)
- **Value Objects**: Immutable objects with validation (PhoneNumber)
- **Repository Interfaces**: Abstractions for data access
- **Domain Errors**: Business-specific error types

### Infrastructure Layer

The infrastructure layer provides implementations:

- **Persistence**: SQLite repository implementation
- **WhatsApp Client**: whatsmeow integration
- **Event Publisher**: WebSocket event propagation
- **Configuration**: Environment-based configuration

## Key Design Decisions

### 1. Clean Architecture

The service follows Clean Architecture principles:

- **Dependency Rule**: Dependencies point inward (infrastructure → application → domain)
- **Separation of Concerns**: Each layer has a single responsibility
- **Testability**: Business logic is isolated from external dependencies

### 2. Dependency Injection (Uber Fx)

Uber Fx provides:

- Automatic dependency resolution
- Lifecycle management (startup/shutdown hooks)
- Module organization
- Easy testing with mock injection

### 3. Repository Pattern

Repository interfaces in the domain layer:

```go
type SessionRepository interface {
    Create(ctx context.Context, session *Session) error
    GetByID(ctx context.Context, id string) (*Session, error)
    GetAll(ctx context.Context) ([]*Session, error)
    Update(ctx context.Context, session *Session) error
    Delete(ctx context.Context, id string) error
}
```

Benefits:

- Decouples business logic from data access
- Enables easy testing with mocks
- Allows swapping storage implementations

### 4. Domain Errors

Custom domain errors with codes:

```go
type DomainError struct {
    Code    string
    Message string
    Cause   error
}

var ErrSessionNotFound = NewDomainError("SESSION_NOT_FOUND", "session not found")
```

Benefits:

- Consistent error handling across layers
- Easy mapping to HTTP status codes
- Error chaining with causes

### 5. Event-Driven Architecture

Events are published to the API server:

```
WhatsApp → WhatsmeowClient → Event → EventPublisher → API Server
```

Event types:

- Message events (received, sent, delivered, read, failed)
- Connection events (connected, disconnected, logged_out)
- Session events (authenticated, expired)

### 6. Rate Limiting

Message sending is rate-limited:

```go
type MessageUseCase struct {
    config MessageUseCaseConfig
    queue  chan *Message
    // ...
}
```

Features:

- Configurable rate limit (messages per minute)
- Message queue for overflow
- Exponential backoff retry

## Data Flow

### Session Creation

```
1. POST /api/sessions
2. Handler validates request
3. SessionUseCase.CreateSession()
4. Generate UUID
5. Create Session entity
6. SessionRepository.Create()
7. Publish event (optional)
8. Return SessionResponse
```

### QR Authentication

```
1. WebSocket /ws/qr/:session_id
2. QRHandler.HandleQRAuth()
3. SessionUseCase.StartQRAuth()
4. WhatsAppClient.GetQRChannel()
5. Loop: QR events → WebSocket messages
6. On success: Update session JID
7. Close WebSocket
```

### Message Sending

```
1. POST /api/messages
2. Handler validates request
3. MessageUseCase.SendMessage()
4. Validate phone number
5. Create Message entity
6. Enqueue message
7. Return pending status
8. Background: Rate-limited sending
9. WhatsAppClient.SendMessage()
10. Publish status events
```

## Concurrency Model

### Thread Safety

- **SQLite Repository**: RWMutex for single-writer limitation
- **WhatsApp Client**: RWMutex for client map access
- **Event Publisher**: RWMutex for connection state
- **Message Queue**: Buffered channels

### Background Workers

- **Message Processor**: Processes queued messages
- **Ping Loop**: WebSocket health monitoring
- **Write Loop**: Event publishing
- **Reconnect Loop**: Automatic reconnection

## Error Handling Strategy

### Layer-Specific Handling

1. **Presentation**: Convert domain errors to HTTP responses
2. **Application**: Wrap infrastructure errors with domain errors
3. **Domain**: Define business error types
4. **Infrastructure**: Return domain errors or wrap system errors

### Error Mapping

```go
func mapErrorToHTTPStatus(code string) int {
    switch code {
    case "SESSION_NOT_FOUND":
        return http.StatusNotFound
    case "VALIDATION_FAILED":
        return http.StatusBadRequest
    case "CONNECTION_FAILED":
        return http.StatusServiceUnavailable
    default:
        return http.StatusInternalServerError
    }
}
```

## Configuration Management

### Environment Variables

Configuration is loaded from environment variables with defaults:

```go
v.SetDefault("server.port", 8080)
v.SetDefault("sqlite.path", "/data/whatsapp.db")
v.SetDefault("whatsapp.qr_timeout", 2*time.Minute)
```

### Validation

Configuration is validated at startup:

```go
func (c *Config) Validate() error {
    var errs ValidationErrors
    if c.Server.Port < 1 || c.Server.Port > 65535 {
        errs = append(errs, ValidationError{...})
    }
    // ...
    return errs
}
```

## Testing Strategy

### Unit Tests

- Domain entities and value objects
- Use case logic with mocked repositories
- Validation rules

### Property-Based Tests

Located in `test/property/`:

- API response validation
- Concurrent session handling
- Configuration validation
- Domain error handling
- Event propagation
- Message status transitions
- Phone number validation

### Integration Tests

Located in `test/integration/`:

- Full API endpoint testing
- Database operations
- WebSocket communication

## Deployment Considerations

### Docker

- Multi-stage build for minimal image
- Non-root user for security
- Health check endpoint
- Volume for data persistence

### Kubernetes

- Readiness probe: `/ready`
- Liveness probe: `/health`
- Resource limits recommended
- Persistent volume for SQLite

### Scaling

Current limitations:

- Single instance (SQLite)
- Session affinity required

Future improvements:

- PostgreSQL for multi-instance
- Redis for session state
- Message queue (RabbitMQ/Kafka)
