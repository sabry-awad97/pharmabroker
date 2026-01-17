package property

import (
	"context"
	"sync"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
)

// ==================== Mock Types for Session Connection Tests ====================

// WhatsAppClientMock is a mock implementation of WhatsAppClient
type WhatsAppClientMock struct {
	mu                sync.Mutex
	Connected         map[string]bool
	ConnectFn         func(ctx context.Context, sessionID string) error
	DisconnectFn      func(ctx context.Context, sessionID string) error
	SendFn            func(ctx context.Context, msg *entity.Message) error
	QRChan            chan repository.QREvent
	JIDMappings       map[string]string
	historySyncConfig map[string]struct {
		enabled, fullSync bool
		since             string
	}
}

func NewWhatsAppClientMock() *WhatsAppClientMock {
	return &WhatsAppClientMock{
		Connected:   make(map[string]bool),
		QRChan:      make(chan repository.QREvent, 10),
		JIDMappings: make(map[string]string),
		historySyncConfig: make(map[string]struct {
			enabled, fullSync bool
			since             string
		}),
	}
}

func (m *WhatsAppClientMock) Connect(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ConnectFn != nil {
		return m.ConnectFn(ctx, sessionID)
	}
	m.Connected[sessionID] = true
	return nil
}

func (m *WhatsAppClientMock) Disconnect(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.DisconnectFn != nil {
		return m.DisconnectFn(ctx, sessionID)
	}
	delete(m.Connected, sessionID)
	return nil
}

func (m *WhatsAppClientMock) SendMessage(ctx context.Context, msg *entity.Message) error {
	if m.SendFn != nil {
		return m.SendFn(ctx, msg)
	}
	return nil
}

func (m *WhatsAppClientMock) GetQRChannel(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	return m.QRChan, nil
}

func (m *WhatsAppClientMock) RegisterEventHandler(handler repository.EventHandler) {}

func (m *WhatsAppClientMock) IsConnected(sessionID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.Connected[sessionID]
}

func (m *WhatsAppClientMock) GetSessionJID(sessionID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.Connected[sessionID] {
		if jid, ok := m.JIDMappings[sessionID]; ok {
			return jid, nil
		}
		return sessionID + "@s.whatsapp.net", nil
	}
	return "", errors.ErrSessionNotFound
}

func (m *WhatsAppClientMock) SetSessionJIDMapping(sessionID, jid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.JIDMappings[sessionID] = jid
}

func (m *WhatsAppClientMock) SetHistorySyncConfig(sessionID string, enabled, fullSync bool, since string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.historySyncConfig[sessionID] = struct {
		enabled, fullSync bool
		since             string
	}{
		enabled:  enabled,
		fullSync: fullSync,
		since:    since,
	}
}

func (m *WhatsAppClientMock) GetHistorySyncConfig(sessionID string) (enabled, fullSync bool, since string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	config, exists := m.historySyncConfig[sessionID]
	if !exists {
		return false, false, ""
	}
	return config.enabled, config.fullSync, config.since
}

// EventPublisherMock is a mock implementation of EventPublisher
type EventPublisherMock struct {
	mu             sync.Mutex
	IsConnectedVal bool
	Events         []*entity.Event
	PublishFn      func(ctx context.Context, event *entity.Event) error
}

func NewEventPublisherMock() *EventPublisherMock {
	return &EventPublisherMock{
		IsConnectedVal: true,
		Events:         make([]*entity.Event, 0),
	}
}

func (m *EventPublisherMock) Publish(ctx context.Context, event *entity.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.PublishFn != nil {
		return m.PublishFn(ctx, event)
	}
	m.Events = append(m.Events, event)
	return nil
}

func (m *EventPublisherMock) Connect(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsConnectedVal = true
	return nil
}

func (m *EventPublisherMock) Disconnect(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsConnectedVal = false
	return nil
}

func (m *EventPublisherMock) IsConnected() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.IsConnectedVal
}

func (m *EventPublisherMock) QueueSize() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Events)
}

func (m *EventPublisherMock) GetEvents() []*entity.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]*entity.Event, len(m.Events))
	copy(result, m.Events)
	return result
}

func (m *EventPublisherMock) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Events = make([]*entity.Event, 0)
}

// Feature: session-connection-flow, Property 3: Go Service Publishes Connecting Event on Connection Start
// *For any* session reconnection attempt in the Go service, a 'connection.connecting' event
// SHALL be published via WebSocket before the WhatsApp client connection is attempted.
// **Validates: Requirements 1.3, 2.2**

func TestConnectingEventPublication_Property3(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 3.1: ReconnectSessionWithJID publishes connection.connecting event
	properties.Property("reconnect publishes connecting event before connection attempt", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Track connection order
			var connectingEventPublished bool
			var connectCalled bool
			var connectingBeforeConnect bool

			// Set up mock to track order
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				connectCalled = true
				// Check if connecting event was published before Connect was called
				for _, event := range publisher.GetEvents() {
					if event.Type == entity.EventTypeConnectionConnecting && event.SessionID == sessionID {
						connectingEventPublished = true
						connectingBeforeConnect = true
					}
				}
				return nil
			}

			// Call reconnect
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Verify connecting event was published
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionConnecting && event.SessionID == sessionID {
					connectingEventPublished = true
				}
			}

			return connectingEventPublished && connectCalled && connectingBeforeConnect
		},
		gen.Identifier(),
	))

	// Property 3.2: Connecting event has correct session_id
	properties.Property("connecting event has correct session_id", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find connecting event
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionConnecting {
					return event.SessionID == sessionID
				}
			}

			return false // No connecting event found
		},
		gen.Identifier(),
	))

	// Property 3.3: Connecting event has valid timestamp
	properties.Property("connecting event has valid timestamp", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find connecting event
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionConnecting {
					return !event.Timestamp.IsZero()
				}
			}

			return false // No connecting event found
		},
		gen.Identifier(),
	))

	// Property 3.4: Connecting event is published even when connection fails
	properties.Property("connecting event published even on connection failure", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Verify connecting event was still published
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionConnecting && event.SessionID == sessionID {
					return true
				}
			}

			return false
		},
		gen.Identifier(),
	))

	properties.TestingRun(t)
}

// Feature: session-connection-flow, Property 8: Failed Connection Publishes Error Event
// *For any* connection failure in the Go service, a 'connection.failed' event SHALL be
// published with error_code and error_message fields populated.
// **Validates: Requirements 3.1**

func TestFailedEventPublication_Property8(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 8.1: Connection failure publishes connection.failed event
	properties.Property("connection failure publishes failed event", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Verify failed event was published
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed && event.SessionID == sessionID {
					return true
				}
			}

			return false
		},
		gen.Identifier(),
	))

	// Property 8.2: Failed event contains error_code field
	properties.Property("failed event contains error_code", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find failed event and check error_code
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed {
					var data entity.ConnectionFailedData
					if err := event.UnmarshalData(&data); err != nil {
						return false
					}
					return data.ErrorCode != ""
				}
			}

			return false
		},
		gen.Identifier(),
	))

	// Property 8.3: Failed event contains error_message field
	properties.Property("failed event contains error_message", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find failed event and check error_message
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed {
					var data entity.ConnectionFailedData
					if err := event.UnmarshalData(&data); err != nil {
						return false
					}
					return data.ErrorMessage != ""
				}
			}

			return false
		},
		gen.Identifier(),
	))

	// Property 8.4: Failed event has correct session_id
	properties.Property("failed event has correct session_id", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find failed event and check session_id
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed {
					return event.SessionID == sessionID
				}
			}

			return false
		},
		gen.Identifier(),
	))

	// Property 8.5: Failed event has valid timestamp
	properties.Property("failed event has valid timestamp", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			waClient := NewWhatsAppClientMock()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Make connection fail
			waClient.ConnectFn = func(ctx context.Context, sid string) error {
				return errors.ErrConnectionFailed.WithMessage("simulated failure")
			}

			uc := usecase.NewSessionUseCase(repo, waClient, publisher)

			// Call reconnect (will fail)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find failed event and check timestamp
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed {
					return !event.Timestamp.IsZero()
				}
			}

			return false
		},
		gen.Identifier(),
	))

	// Property 8.6: Client unavailable publishes failed event with CLIENT_UNAVAILABLE code
	properties.Property("client unavailable publishes failed event with correct code", prop.ForAll(
		func(sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			ctx := context.Background()
			repo := persistence.NewInMemorySessionRepository()
			publisher := NewEventPublisherMock()

			// Create session
			session := entity.NewSession(sessionID, "Test Session")
			_ = repo.Create(ctx, session)

			// Create usecase with nil waClient
			uc := usecase.NewSessionUseCase(repo, nil, publisher)

			// Call reconnect (will fail due to nil client)
			_ = uc.ReconnectSessionWithJID(ctx, sessionID, "")

			// Find failed event and check error_code
			for _, event := range publisher.GetEvents() {
				if event.Type == entity.EventTypeConnectionFailed {
					var data entity.ConnectionFailedData
					if err := event.UnmarshalData(&data); err != nil {
						return false
					}
					return data.ErrorCode == "CLIENT_UNAVAILABLE"
				}
			}

			return false
		},
		gen.Identifier(),
	))

	properties.TestingRun(t)
}
