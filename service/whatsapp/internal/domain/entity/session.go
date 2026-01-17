package entity

import (
	"encoding/json"
	"time"
)

// Status represents the connection status of a WhatsApp session
type Status string

const (
	StatusConnected    Status = "connected"
	StatusDisconnected Status = "disconnected"
	StatusConnecting   Status = "connecting"
	StatusLoggedOut    Status = "logged_out"
	StatusPending      Status = "pending"
)

// IsValid checks if the status is a valid Status value
func (s Status) IsValid() bool {
	switch s {
	case StatusConnected, StatusDisconnected, StatusConnecting, StatusLoggedOut, StatusPending:
		return true
	}
	return false
}

// String returns the string representation of the status
func (s Status) String() string {
	return string(s)
}

// Session represents a WhatsApp session
type Session struct {
	ID        string    `json:"id"`
	JID       string    `json:"jid"`    // WhatsApp JID
	Name      string    `json:"name"`   // Display name
	Status    Status    `json:"status"` // connected, disconnected, etc.
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	// History Sync Configuration
	HistorySyncEnabled bool   `json:"history_sync_enabled"` // Whether to sync history on first connection
	FullSync           bool   `json:"full_sync"`            // Whether to perform full history sync
	SyncSince          string `json:"sync_since"`           // ISO 8601 timestamp for incremental sync
}

// NewSession creates a new Session with the given ID and name
func NewSession(id, name string) *Session {
	now := time.Now()
	return &Session{
		ID:        id,
		Name:      name,
		Status:    StatusPending,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// SetStatus updates the session status and updated timestamp
func (s *Session) SetStatus(status Status) {
	s.Status = status
	s.UpdatedAt = time.Now()
}

// SetJID sets the WhatsApp JID for the session
func (s *Session) SetJID(jid string) {
	s.JID = jid
	s.UpdatedAt = time.Now()
}

// SetHistorySyncConfig sets the history sync configuration for the session
func (s *Session) SetHistorySyncConfig(enabled, fullSync bool, since string) {
	s.HistorySyncEnabled = enabled
	s.FullSync = fullSync
	s.SyncSince = since
	s.UpdatedAt = time.Now()
}

// IsConnected returns true if the session is connected
func (s *Session) IsConnected() bool {
	return s.Status == StatusConnected
}

// MarshalJSON implements json.Marshaler
func (s *Session) MarshalJSON() ([]byte, error) {
	type Alias Session
	return json.Marshal(&struct {
		*Alias
		CreatedAt string `json:"created_at"`
		UpdatedAt string `json:"updated_at"`
	}{
		Alias:     (*Alias)(s),
		CreatedAt: s.CreatedAt.Format(time.RFC3339),
		UpdatedAt: s.UpdatedAt.Format(time.RFC3339),
	})
}
