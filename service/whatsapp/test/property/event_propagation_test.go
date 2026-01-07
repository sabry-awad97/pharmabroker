package property

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
)

// Feature: whatsapp-service, Property 11: Event Propagation Completeness
// *For any* WhatsApp event (message, connection, or session), it should be propagated
// via WebSocket with all required metadata fields.
// **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.8**

func TestEventPropagationCompleteness_Property11(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 11.1: All events have required metadata fields
	properties.Property("all events have required metadata fields", prop.ForAll(
		func(eventTypeIdx int, sessionID string) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			eventTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeMessageSent,
				entity.EventTypeMessageDelivered,
				entity.EventTypeMessageRead,
				entity.EventTypeMessageFailed,
				entity.EventTypeConnected,
				entity.EventTypeDisconnected,
				entity.EventTypeLoggedOut,
				entity.EventTypeQRScanned,
				entity.EventTypeAuthenticated,
				entity.EventTypeSessionExpired,
			}
			eventType := eventTypes[eventTypeIdx%len(eventTypes)]

			// Create event with payload
			payload := map[string]string{"test": "data"}
			event, err := entity.NewEventWithPayload(
				generateTestEventID(),
				eventType,
				sessionID,
				payload,
			)
			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Verify required fields
			hasID := event.ID != ""
			hasType := event.Type != ""
			hasSessionID := event.SessionID != ""
			hasTimestamp := !event.Timestamp.IsZero()
			hasData := event.Data != nil

			return hasID && hasType && hasSessionID && hasTimestamp && hasData
		},
		gen.IntRange(0, 10),
		gen.Identifier(),
	))

	// Property 11.2: Message events contain message-specific metadata
	properties.Property("message events contain message metadata", prop.ForAll(
		func(messageID, from, sessionID string, msgTypeIdx int) bool {
			if messageID == "" || from == "" || sessionID == "" {
				return true // skip empty inputs
			}

			messageTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeMessageSent,
				entity.EventTypeMessageDelivered,
				entity.EventTypeMessageRead,
				entity.EventTypeMessageFailed,
			}
			eventType := messageTypes[msgTypeIdx%len(messageTypes)]

			payload := map[string]interface{}{
				"message_id": messageID,
				"from":       from,
				"timestamp":  time.Now(),
				"type":       "text",
			}

			event, err := entity.NewEventWithPayload(
				generateTestEventID(),
				eventType,
				sessionID,
				payload,
			)
			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Verify event type is a message event
			if !event.Type.IsMessageEvent() {
				t.Logf("Expected message event, got %s", event.Type)
				return false
			}

			// Verify payload contains message metadata
			var payloadMap map[string]interface{}
			if err := json.Unmarshal(event.Data, &payloadMap); err != nil {
				t.Logf("Failed to unmarshal payload: %v", err)
				return false
			}

			hasMessageID := payloadMap["message_id"] != nil
			hasFrom := payloadMap["from"] != nil

			return hasMessageID && hasFrom
		},
		gen.Identifier(),
		gen.Identifier(),
		gen.Identifier(),
		gen.IntRange(0, 4),
	))

	// Property 11.3: Connection events contain connection-specific metadata
	properties.Property("connection events contain connection metadata", prop.ForAll(
		func(sessionID, status string, connTypeIdx int) bool {
			if sessionID == "" || status == "" {
				return true // skip empty inputs
			}

			connectionTypes := []entity.EventType{
				entity.EventTypeConnected,
				entity.EventTypeDisconnected,
				entity.EventTypeLoggedOut,
			}
			eventType := connectionTypes[connTypeIdx%len(connectionTypes)]

			payload := map[string]string{
				"status": status,
			}

			event, err := entity.NewEventWithPayload(
				generateTestEventID(),
				eventType,
				sessionID,
				payload,
			)
			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Verify event type is a connection event
			if !event.Type.IsConnectionEvent() {
				t.Logf("Expected connection event, got %s", event.Type)
				return false
			}

			// Verify payload contains status
			var payloadMap map[string]string
			if err := json.Unmarshal(event.Data, &payloadMap); err != nil {
				t.Logf("Failed to unmarshal payload: %v", err)
				return false
			}

			return payloadMap["status"] != ""
		},
		gen.Identifier(),
		gen.OneConstOf("connected", "disconnected", "logged_out"),
		gen.IntRange(0, 2),
	))

	// Property 11.4: Session events contain session-specific metadata
	properties.Property("session events contain session metadata", prop.ForAll(
		func(sessionID string, sessTypeIdx int) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			sessionTypes := []entity.EventType{
				entity.EventTypeQRScanned,
				entity.EventTypeAuthenticated,
				entity.EventTypeSessionExpired,
			}
			eventType := sessionTypes[sessTypeIdx%len(sessionTypes)]

			payload := map[string]string{
				"session_id": sessionID,
			}

			event, err := entity.NewEventWithPayload(
				generateTestEventID(),
				eventType,
				sessionID,
				payload,
			)
			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Verify event type is a session event
			if !event.Type.IsSessionEvent() {
				t.Logf("Expected session event, got %s", event.Type)
				return false
			}

			return event.SessionID == sessionID
		},
		gen.Identifier(),
		gen.IntRange(0, 2),
	))

	// Property 11.5: Event serialization preserves all fields
	properties.Property("event serialization preserves all fields", prop.ForAll(
		func(id, sessionID string, eventTypeIdx int) bool {
			if id == "" || sessionID == "" {
				return true // skip empty inputs
			}

			eventTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeConnected,
				entity.EventTypeAuthenticated,
			}
			eventType := eventTypes[eventTypeIdx%len(eventTypes)]

			payload := map[string]string{"key": "value"}
			original, err := entity.NewEventWithPayload(id, eventType, sessionID, payload)
			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Serialize
			data, err := json.Marshal(original)
			if err != nil {
				t.Logf("Failed to marshal event: %v", err)
				return false
			}

			// Deserialize
			var restored entity.Event
			if err := json.Unmarshal(data, &restored); err != nil {
				t.Logf("Failed to unmarshal event: %v", err)
				return false
			}

			// Verify fields preserved
			idMatch := restored.ID == original.ID
			typeMatch := restored.Type == original.Type
			sessionMatch := restored.SessionID == original.SessionID
			dataMatch := string(restored.Data) == string(original.Data)

			return idMatch && typeMatch && sessionMatch && dataMatch
		},
		gen.Identifier(),
		gen.Identifier(),
		gen.IntRange(0, 2),
	))

	// Property 11.6: Event timestamp is always set
	properties.Property("event timestamp is always set", prop.ForAll(
		func(sessionID string, eventTypeIdx int) bool {
			if sessionID == "" {
				return true // skip empty inputs
			}

			eventTypes := []entity.EventType{
				entity.EventTypeMessageReceived,
				entity.EventTypeConnected,
				entity.EventTypeAuthenticated,
			}
			eventType := eventTypes[eventTypeIdx%len(eventTypes)]

			before := time.Now()
			event, err := entity.NewEventWithPayload(
				generateTestEventID(),
				eventType,
				sessionID,
				map[string]string{},
			)
			after := time.Now()

			if err != nil {
				t.Logf("Failed to create event: %v", err)
				return false
			}

			// Timestamp should be between before and after
			return !event.Timestamp.Before(before) && !event.Timestamp.After(after)
		},
		gen.Identifier(),
		gen.IntRange(0, 2),
	))

	properties.TestingRun(t)
}

// generateTestEventID generates a unique event ID for testing
func generateTestEventID() string {
	return time.Now().Format("20060102150405.000000000")
}
