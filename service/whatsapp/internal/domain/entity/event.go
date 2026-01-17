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
	EventTypeConnectionConnecting EventType = "connection.connecting"
	EventTypeConnected            EventType = "connection.connected"
	EventTypeDisconnected         EventType = "connection.disconnected"
	EventTypeLoggedOut            EventType = "connection.logged_out"
	EventTypeConnectionFailed     EventType = "connection.failed"
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

// Sync events
const (
	EventTypeSyncProgress EventType = "sync.progress"
)

// IsValid checks if the event type is valid
func (et EventType) IsValid() bool {
	switch et {
	case EventTypeMessageReceived, EventTypeMessageSent, EventTypeMessageDelivered,
		EventTypeMessageRead, EventTypeMessageFailed, EventTypeConnectionConnecting,
		EventTypeConnected, EventTypeDisconnected, EventTypeLoggedOut,
		EventTypeConnectionFailed, EventTypeQRScanned, EventTypeAuthenticated,
		EventTypeSessionExpired, EventTypeQRCode, EventTypeSyncProgress:
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
	case EventTypeConnectionConnecting, EventTypeConnected, EventTypeDisconnected,
		EventTypeLoggedOut, EventTypeConnectionFailed:
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
	ID        string          `json:"id,omitempty"`
	Type      EventType       `json:"type"`
	SessionID string          `json:"session_id"`
	Data      json.RawMessage `json:"data,omitempty"`
	Timestamp time.Time       `json:"timestamp,omitempty"`
}

// NewEvent creates a new Event
func NewEvent(id string, eventType EventType, sessionID string, data json.RawMessage) *Event {
	return &Event{
		ID:        id,
		Type:      eventType,
		SessionID: sessionID,
		Data:      data,
		Timestamp: time.Now(),
	}
}

// NewEventWithPayload creates a new Event with a typed payload that gets marshaled to JSON
func NewEventWithPayload(id string, eventType EventType, sessionID string, data any) (*Event, error) {
	dataBytes, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	return &Event{
		ID:        id,
		Type:      eventType,
		SessionID: sessionID,
		Data:      dataBytes,
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

// UnmarshalData unmarshals the event data into the provided target
func (e *Event) UnmarshalData(target any) error {
	return json.Unmarshal(e.Data, target)
}

// ConnectionFailedData represents the data payload for connection.failed events
type ConnectionFailedData struct {
	ErrorCode    string `json:"error_code"`
	ErrorMessage string `json:"error_message"`
}

// NewConnectionFailedEvent creates a new connection.failed event with error details
func NewConnectionFailedEvent(id, sessionID string, errorCode, errorMessage string) (*Event, error) {
	data := ConnectionFailedData{
		ErrorCode:    errorCode,
		ErrorMessage: errorMessage,
	}
	return NewEventWithPayload(id, EventTypeConnectionFailed, sessionID, data)
}
