package entity

import (
	"encoding/json"
	"time"
)

// EventType represents the type of WhatsApp event
type EventType string

// Message events
const (
	EventTypeMessageReceived  EventType = "message.received"
	EventTypeMessageSent      EventType = "message.sent"
	EventTypeMessageDelivered EventType = "message.delivered"
	EventTypeMessageRead      EventType = "message.read"
	EventTypeMessageFailed    EventType = "message.failed"
)

// Connection events
const (
	EventTypeConnected    EventType = "connection.connected"
	EventTypeDisconnected EventType = "connection.disconnected"
	EventTypeLoggedOut    EventType = "connection.logged_out"
)

// Session events
const (
	EventTypeQRScanned      EventType = "session.qr_scanned"
	EventTypeAuthenticated  EventType = "session.authenticated"
	EventTypeSessionExpired EventType = "session.expired"
)

// QR events
const (
	EventTypeQRCode EventType = "qr.code"
)

// IsValid checks if the event type is valid
func (et EventType) IsValid() bool {
	switch et {
	case EventTypeMessageReceived, EventTypeMessageSent, EventTypeMessageDelivered,
		EventTypeMessageRead, EventTypeMessageFailed, EventTypeConnected,
		EventTypeDisconnected, EventTypeLoggedOut, EventTypeQRScanned,
		EventTypeAuthenticated, EventTypeSessionExpired, EventTypeQRCode:
		return true
	}
	return false
}

// String returns the string representation of the event type
func (et EventType) String() string {
	return string(et)
}

// IsMessageEvent returns true if this is a message-related event
func (et EventType) IsMessageEvent() bool {
	switch et {
	case EventTypeMessageReceived, EventTypeMessageSent, EventTypeMessageDelivered,
		EventTypeMessageRead, EventTypeMessageFailed:
		return true
	}
	return false
}

// IsConnectionEvent returns true if this is a connection-related event
func (et EventType) IsConnectionEvent() bool {
	switch et {
	case EventTypeConnected, EventTypeDisconnected, EventTypeLoggedOut:
		return true
	}
	return false
}

// IsSessionEvent returns true if this is a session-related event
func (et EventType) IsSessionEvent() bool {
	switch et {
	case EventTypeQRScanned, EventTypeAuthenticated, EventTypeSessionExpired:
		return true
	}
	return false
}

// Event represents a WhatsApp event for propagation
type Event struct {
	ID        string          `json:"id"`
	Type      EventType       `json:"type"`
	SessionID string          `json:"session_id"`
	Payload   json.RawMessage `json:"payload"`
	Timestamp time.Time       `json:"timestamp"`
}

// NewEvent creates a new Event
func NewEvent(id string, eventType EventType, sessionID string, payload json.RawMessage) *Event {
	return &Event{
		ID:        id,
		Type:      eventType,
		SessionID: sessionID,
		Payload:   payload,
		Timestamp: time.Now(),
	}
}

// NewEventWithPayload creates a new Event with a typed payload that gets marshaled to JSON
func NewEventWithPayload(id string, eventType EventType, sessionID string, payload interface{}) (*Event, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return &Event{
		ID:        id,
		Type:      eventType,
		SessionID: sessionID,
		Payload:   payloadBytes,
		Timestamp: time.Now(),
	}, nil
}

// MarshalJSON implements json.Marshaler
func (e *Event) MarshalJSON() ([]byte, error) {
	type Alias Event
	return json.Marshal(&struct {
		*Alias
		Timestamp string `json:"timestamp"`
	}{
		Alias:     (*Alias)(e),
		Timestamp: e.Timestamp.Format(time.RFC3339),
	})
}

// UnmarshalPayload unmarshals the event payload into the provided target
func (e *Event) UnmarshalPayload(target interface{}) error {
	return json.Unmarshal(e.Payload, target)
}
