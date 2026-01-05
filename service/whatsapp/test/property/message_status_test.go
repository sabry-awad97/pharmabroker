package property

import (
	"context"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
)

// Feature: whatsapp-service, Property 9: Message Status Event Emission
// *For any* message status change, the corresponding event should be emitted
// with correct event type and message metadata.
// **Validates: Requirements 4.6**

// mockEventPublisher is a test double for EventPublisher
type mockEventPublisher struct {
	mu        sync.Mutex
	events    []*entity.Event
	connected bool
}

func newMockEventPublisher() *mockEventPublisher {
	return &mockEventPublisher{
		events:    make([]*entity.Event, 0),
		connected: true,
	}
}

func (m *mockEventPublisher) Publish(ctx context.Context, event *entity.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = append(m.events, event)
	return nil
}

func (m *mockEventPublisher) Connect(ctx context.Context) error {
	m.connected = true
	return nil
}

func (m *mockEventPublisher) Disconnect(ctx context.Context) error {
	m.connected = false
	return nil
}

func (m *mockEventPublisher) IsConnected() bool {
	return m.connected
}

func (m *mockEventPublisher) QueueSize() int {
	return 0
}

func (m *mockEventPublisher) GetEvents() []*entity.Event {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([]*entity.Event, len(m.events))
	copy(result, m.events)
	return result
}

func (m *mockEventPublisher) Clear() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.events = make([]*entity.Event, 0)
}

func TestMessageStatusEventEmission_Property9(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 9.1: HandleMessageStatusUpdate emits correct event type for each status
	properties.Property("HandleMessageStatusUpdate emits correct event type for each status", prop.ForAll(
		func(statusIndex int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			msgID := uuid.New().String()
			sessionID := uuid.New().String()

			// Map index to status
			statuses := []entity.MessageStatus{
				entity.MessageStatusSent,
				entity.MessageStatusDelivered,
				entity.MessageStatusRead,
				entity.MessageStatusFailed,
			}
			status := statuses[statusIndex%len(statuses)]

			// Expected event types
			expectedEventTypes := map[entity.MessageStatus]entity.EventType{
				entity.MessageStatusSent:      entity.EventTypeMessageSent,
				entity.MessageStatusDelivered: entity.EventTypeMessageDelivered,
				entity.MessageStatusRead:      entity.EventTypeMessageRead,
				entity.MessageStatusFailed:    entity.EventTypeMessageFailed,
			}

			err := uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, status)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			if len(events) != 1 {
				return false
			}

			event := events[0]
			expectedType := expectedEventTypes[status]

			return event.Type == expectedType && event.SessionID == sessionID
		},
		gen.IntRange(0, 3),
	))

	// Property 9.2: Event contains message metadata (message_id, status)
	properties.Property("Event contains message metadata", prop.ForAll(
		func(statusIndex int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			msgID := uuid.New().String()
			sessionID := uuid.New().String()

			statuses := []entity.MessageStatus{
				entity.MessageStatusSent,
				entity.MessageStatusDelivered,
				entity.MessageStatusRead,
				entity.MessageStatusFailed,
			}
			status := statuses[statusIndex%len(statuses)]

			err := uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, status)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			if len(events) != 1 {
				return false
			}

			event := events[0]

			// Verify payload contains required fields
			var payload map[string]interface{}
			if err := event.UnmarshalPayload(&payload); err != nil {
				return false
			}

			// Check message_id is present and correct
			payloadMsgID, ok := payload["message_id"].(string)
			if !ok || payloadMsgID != msgID {
				return false
			}

			// Check status is present and correct
			payloadStatus, ok := payload["status"].(string)
			if !ok || payloadStatus != status.String() {
				return false
			}

			return true
		},
		gen.IntRange(0, 3),
	))

	// Property 9.3: HandleIncomingMessage emits message.received event
	properties.Property("HandleIncomingMessage emits message.received event", prop.ForAll(
		func(textLen int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()

			// Create a message
			text := "test message"
			msg := entity.NewMessage(
				uuid.New().String(),
				uuid.New().String(),
				"+14155551234",
				"+14155555678",
				entity.NewTextContent(text),
				entity.MessageTypeText,
			)

			err := uc.HandleIncomingMessage(ctx, msg)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			// Should have at least one event (message received)
			if len(events) < 1 {
				return false
			}

			// Find the message received event
			var foundReceived bool
			for _, event := range events {
				if event.Type == entity.EventTypeMessageReceived {
					foundReceived = true
					if event.SessionID != msg.SessionID {
						return false
					}
				}
			}

			return foundReceived
		},
		gen.IntRange(1, 100),
	))

	// Property 9.4: No event emitted when publisher is disconnected
	properties.Property("No event emitted when publisher is disconnected", prop.ForAll(
		func(statusIndex int) bool {
			publisher := newMockEventPublisher()
			publisher.Disconnect(context.Background()) // Disconnect the publisher

			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			msgID := uuid.New().String()
			sessionID := uuid.New().String()

			statuses := []entity.MessageStatus{
				entity.MessageStatusSent,
				entity.MessageStatusDelivered,
				entity.MessageStatusRead,
				entity.MessageStatusFailed,
			}
			status := statuses[statusIndex%len(statuses)]

			err := uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, status)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			// No events should be emitted when disconnected
			return len(events) == 0
		},
		gen.IntRange(0, 3),
	))

	// Property 9.5: Event timestamp is set
	properties.Property("Event timestamp is set", prop.ForAll(
		func(statusIndex int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			msgID := uuid.New().String()
			sessionID := uuid.New().String()

			statuses := []entity.MessageStatus{
				entity.MessageStatusSent,
				entity.MessageStatusDelivered,
				entity.MessageStatusRead,
				entity.MessageStatusFailed,
			}
			status := statuses[statusIndex%len(statuses)]

			err := uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, status)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			if len(events) != 1 {
				return false
			}

			event := events[0]
			// Timestamp should not be zero
			return !event.Timestamp.IsZero()
		},
		gen.IntRange(0, 3),
	))

	// Property 9.6: Event ID is unique for each event
	properties.Property("Event ID is unique for each event", prop.ForAll(
		func(count int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			sessionID := uuid.New().String()

			// Generate multiple events
			actualCount := (count % 10) + 1
			for i := 0; i < actualCount; i++ {
				msgID := uuid.New().String()
				_ = uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, entity.MessageStatusSent)
			}

			events := publisher.GetEvents()
			if len(events) != actualCount {
				return false
			}

			// Check all IDs are unique
			ids := make(map[string]bool)
			for _, event := range events {
				if ids[event.ID] {
					return false // Duplicate ID found
				}
				ids[event.ID] = true
			}

			return true
		},
		gen.IntRange(1, 10),
	))

	// Property 9.7: Pending status does not emit event (only sent, delivered, read, failed)
	properties.Property("Pending status does not emit event via HandleMessageStatusUpdate", prop.ForAll(
		func(_ int) bool {
			publisher := newMockEventPublisher()
			config := usecase.DefaultMessageUseCaseConfig()
			uc := usecase.NewMessageUseCase(nil, publisher, config)
			defer uc.Close()

			ctx := context.Background()
			msgID := uuid.New().String()
			sessionID := uuid.New().String()

			// Pending status should not emit an event
			err := uc.HandleMessageStatusUpdate(ctx, msgID, sessionID, entity.MessageStatusPending)
			if err != nil {
				return false
			}

			events := publisher.GetEvents()
			// No events should be emitted for pending status
			return len(events) == 0
		},
		gen.Const(0),
	))

	properties.TestingRun(t)
}
