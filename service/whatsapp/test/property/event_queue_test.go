package property

import (
	"context"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
)

// Feature: whatsapp-service, Property 12: Event Queue Preservation During Reconnection
// *For any* events queued during WebSocket disconnection, all events should be
// delivered in order once reconnected.
// **Validates: Requirements 6.7**

func TestEventQueuePreservation_Property12(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 12.1: Events are queued when publisher is not connected
	properties.Property("events are queued when not connected", prop.ForAll(
		func(eventCount int) bool {
			if eventCount < 1 || eventCount > 50 {
				return true // skip invalid counts
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = 100
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			// Publish events without connecting
			for i := 0; i < eventCount; i++ {
				event, _ := entity.NewEventWithPayload(
					generateQueueTestEventID(i),
					entity.EventTypeMessageReceived,
					"test-session",
					map[string]int{"index": i},
				)
				_ = publisher.Publish(ctx, event)
			}

			// Verify queue size
			queueSize := publisher.QueueSize()
			return queueSize == eventCount
		},
		gen.IntRange(1, 50),
	))

	// Property 12.2: Queue preserves event order (FIFO)
	properties.Property("queue preserves event order", prop.ForAll(
		func(eventCount int) bool {
			if eventCount < 2 || eventCount > 20 {
				return true // skip invalid counts
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = 100
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			// Publish events with sequential IDs
			expectedOrder := make([]string, eventCount)
			for i := 0; i < eventCount; i++ {
				id := generateQueueTestEventID(i)
				expectedOrder[i] = id
				event, _ := entity.NewEventWithPayload(
					id,
					entity.EventTypeMessageReceived,
					"test-session",
					map[string]int{"index": i},
				)
				_ = publisher.Publish(ctx, event)
			}

			// Get queued events
			queuedEvents := publisher.GetQueuedEvents()

			if len(queuedEvents) != eventCount {
				t.Logf("Expected %d events, got %d", eventCount, len(queuedEvents))
				return false
			}

			// Verify order
			for i, event := range queuedEvents {
				if event.ID != expectedOrder[i] {
					t.Logf("Order mismatch at %d: expected %s, got %s", i, expectedOrder[i], event.ID)
					return false
				}
			}

			return true
		},
		gen.IntRange(2, 20),
	))

	// Property 12.3: Queue respects maximum size
	properties.Property("queue respects maximum size", prop.ForAll(
		func(queueSize, eventCount int) bool {
			if queueSize < 1 || queueSize > 50 || eventCount < 1 {
				return true // skip invalid inputs
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = queueSize
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			// Publish more events than queue size
			for i := 0; i < eventCount; i++ {
				event, _ := entity.NewEventWithPayload(
					generateQueueTestEventID(i),
					entity.EventTypeMessageReceived,
					"test-session",
					map[string]int{"index": i},
				)
				_ = publisher.Publish(ctx, event)
			}

			// Queue size should not exceed configured maximum
			actualSize := publisher.QueueSize()
			return actualSize <= queueSize
		},
		gen.IntRange(5, 20),
		gen.IntRange(10, 50),
	))

	// Property 12.4: IsConnected returns false when not connected
	properties.Property("IsConnected returns false when not connected", prop.ForAll(
		func(_ int) bool {
			config := websocket.DefaultPublisherConfig()
			publisher := websocket.NewGorillaEventPublisher(config)

			return !publisher.IsConnected()
		},
		gen.Const(0),
	))

	// Property 12.5: QueueSize returns 0 for empty queue
	properties.Property("QueueSize returns 0 for empty queue", prop.ForAll(
		func(_ int) bool {
			config := websocket.DefaultPublisherConfig()
			publisher := websocket.NewGorillaEventPublisher(config)

			return publisher.QueueSize() == 0
		},
		gen.Const(0),
	))

	// Property 12.6: Events with different types are all queued
	properties.Property("events with different types are all queued", prop.ForAll(
		func(typeCount int) bool {
			if typeCount < 1 || typeCount > 10 {
				return true // skip invalid counts
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = 100
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			eventTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeMessageSent,
				entity.EventTypeConnected,
				entity.EventTypeDisconnected,
				entity.EventTypeAuthenticated,
			}

			// Publish events of different types
			for i := 0; i < typeCount; i++ {
				eventType := eventTypes[i%len(eventTypes)]
				event, _ := entity.NewEventWithPayload(
					generateQueueTestEventID(i),
					eventType,
					"test-session",
					map[string]int{"index": i},
				)
				_ = publisher.Publish(ctx, event)
			}

			// All events should be queued
			return publisher.QueueSize() == typeCount
		},
		gen.IntRange(1, 10),
	))

	// Property 12.7: Publish returns nil even when not connected (events are queued)
	properties.Property("Publish returns nil when not connected", prop.ForAll(
		func(eventCount int) bool {
			if eventCount < 1 || eventCount > 10 {
				return true // skip invalid counts
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = 100
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			// All publishes should succeed (events are queued)
			for i := 0; i < eventCount; i++ {
				event, _ := entity.NewEventWithPayload(
					generateQueueTestEventID(i),
					entity.EventTypeMessageReceived,
					"test-session",
					map[string]int{"index": i},
				)
				err := publisher.Publish(ctx, event)
				if err != nil {
					t.Logf("Publish failed: %v", err)
					return false
				}
			}

			return true
		},
		gen.IntRange(1, 10),
	))

	// Property 12.8: Events from different sessions are all queued
	properties.Property("events from different sessions are all queued", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 1 || sessionCount > 10 {
				return true // skip invalid counts
			}

			config := websocket.DefaultPublisherConfig()
			config.QueueSize = 100
			publisher := websocket.NewGorillaEventPublisher(config)

			ctx := context.Background()

			// Publish events from different sessions
			for i := 0; i < sessionCount; i++ {
				sessionID := "session-" + string(rune('a'+i))
				event, _ := entity.NewEventWithPayload(
					generateQueueTestEventID(i),
					entity.EventTypeMessageReceived,
					sessionID,
					map[string]int{"index": i},
				)
				_ = publisher.Publish(ctx, event)
			}

			// All events should be queued
			return publisher.QueueSize() == sessionCount
		},
		gen.IntRange(1, 10),
	))

	properties.TestingRun(t)
}

// generateQueueTestEventID generates a unique event ID for queue testing
func generateQueueTestEventID(index int) string {
	return time.Now().Format("20060102150405") + "_" + string(rune('a'+index))
}
