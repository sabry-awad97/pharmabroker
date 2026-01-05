package service

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// SessionService defines session-related domain operations
type SessionService interface {
	// CreateSession creates a new WhatsApp session
	CreateSession(ctx context.Context, name string) (*entity.Session, error)

	// GetSession retrieves a session by ID
	GetSession(ctx context.Context, id string) (*entity.Session, error)

	// ListSessions retrieves all sessions
	ListSessions(ctx context.Context) ([]*entity.Session, error)

	// DeleteSession removes a session
	DeleteSession(ctx context.Context, id string) error

	// StartQRAuth initiates QR code authentication for a session
	StartQRAuth(ctx context.Context, sessionID string) (<-chan repository.QREvent, error)

	// ReconnectSession attempts to reconnect an existing session
	ReconnectSession(ctx context.Context, sessionID string) error
}

// MessageService defines message-related domain operations
type MessageService interface {
	// SendMessage sends a WhatsApp message
	SendMessage(ctx context.Context, msg *entity.Message) error

	// HandleIncomingMessage processes an incoming WhatsApp message
	HandleIncomingMessage(ctx context.Context, msg *entity.Message) error

	// GetMessageStatus retrieves the status of a message
	GetMessageStatus(ctx context.Context, messageID string) (entity.MessageStatus, error)
}

// EventService defines event-related domain operations
type EventService interface {
	// PublishEvent publishes an event to the API server
	PublishEvent(ctx context.Context, event *entity.Event) error

	// SubscribeToEvents registers a handler for events
	SubscribeToEvents(handler func(*entity.Event))
}
