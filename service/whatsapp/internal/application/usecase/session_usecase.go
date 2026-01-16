package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// SessionUseCase handles WhatsApp client operations (connect, disconnect, QR).
// Session CRUD is managed by Node.js API with PostgreSQL.
// This usecase maintains local state for WhatsApp client tracking.
type SessionUseCase struct {
	repo      repository.SessionRepository
	waClient  repository.WhatsAppClient
	publisher repository.EventPublisher
}

// NewSessionUseCase creates a new SessionUseCase
func NewSessionUseCase(
	repo repository.SessionRepository,
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
) *SessionUseCase {
	return &SessionUseCase{
		repo:      repo,
		waClient:  waClient,
		publisher: publisher,
	}
}

// CreateSessionWithID creates a session record for WhatsApp client tracking
// Called by Node.js API when a new session is created
func (uc *SessionUseCase) CreateSessionWithID(ctx context.Context, id, name string) (*entity.Session, error) {
	session := entity.NewSession(id, name)

	if err := uc.repo.Create(ctx, session); err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	return session, nil
}

// DeleteSession removes a session and disconnects WhatsApp client
// Called by Node.js API when a session is deleted
func (uc *SessionUseCase) DeleteSession(ctx context.Context, id string) error {
	// Disconnect the WhatsApp client if connected
	if uc.waClient != nil && uc.waClient.IsConnected(id) {
		_ = uc.waClient.Disconnect(ctx, id)
	}

	// Delete from local repository (ignore not found errors)
	if err := uc.repo.Delete(ctx, id); err != nil {
		if errors.IsNotFound(err) {
			return nil // Idempotent - already deleted
		}
		return errors.ErrDatabaseError.WithCause(err)
	}

	return nil
}

// StartQRAuth initiates QR code authentication for a session
func (uc *SessionUseCase) StartQRAuth(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	// Check if session exists locally
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil && !errors.IsNotFound(err) {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	// Create local session if it doesn't exist (lazy registration)
	if session == nil {
		session = entity.NewSession(sessionID, "")
		if err := uc.repo.Create(ctx, session); err != nil {
			return nil, errors.ErrDatabaseError.WithCause(err)
		}
	}

	// Update session status to connecting
	if err := uc.repo.UpdateStatus(ctx, sessionID, entity.StatusConnecting); err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	// Get QR channel from WhatsApp client
	if uc.waClient == nil {
		return nil, errors.ErrConnectionFailed.WithMessage("WhatsApp client not available")
	}

	qrChan, err := uc.waClient.GetQRChannel(ctx, sessionID)
	if err != nil {
		_ = uc.repo.UpdateStatus(ctx, sessionID, entity.StatusDisconnected)
		return nil, errors.ErrQRGenerationFailed.WithCause(err)
	}

	return qrChan, nil
}

// UpdateSessionStatus updates the status of a session
func (uc *SessionUseCase) UpdateSessionStatus(ctx context.Context, sessionID string, status entity.Status) error {
	if err := uc.repo.UpdateStatus(ctx, sessionID, status); err != nil {
		// Session might not exist locally, create it with the status
		if errors.IsNotFound(err) {
			session := entity.NewSession(sessionID, "")
			session.SetStatus(status)
			return uc.repo.Create(ctx, session)
		}
		return errors.ErrDatabaseError.WithCause(err)
	}
	return nil
}

// ReconnectSession attempts to reconnect a session using stored WhatsApp credentials
func (uc *SessionUseCase) ReconnectSession(ctx context.Context, sessionID string) error {
	return uc.ReconnectSessionWithJID(ctx, sessionID, "")
}

// ReconnectSessionWithJID attempts to reconnect a session using stored WhatsApp credentials
// If jid is provided, it will be used to find the correct device in whatsmeow's store
func (uc *SessionUseCase) ReconnectSessionWithJID(ctx context.Context, sessionID, jid string) error {
	// Check if already connected
	if uc.waClient != nil && uc.waClient.IsConnected(sessionID) {
		// Still emit connected event so API can update status
		uc.publishConnectionEvent(ctx, sessionID, entity.EventTypeConnected)
		return nil // Already connected
	}

	// Update status to connecting
	_ = uc.UpdateSessionStatus(ctx, sessionID, entity.StatusConnecting)

	// Publish connection.connecting event
	uc.publishConnectionEvent(ctx, sessionID, entity.EventTypeConnectionConnecting)

	// Attempt to connect using stored credentials
	if uc.waClient == nil {
		_ = uc.UpdateSessionStatus(ctx, sessionID, entity.StatusDisconnected)
		uc.publishConnectionFailedEvent(ctx, sessionID, "CLIENT_UNAVAILABLE", "WhatsApp client not available")
		return errors.ErrConnectionFailed.WithMessage("WhatsApp client not available")
	}

	// Set JID mapping if provided (helps find the correct device after restart)
	if jid != "" {
		uc.waClient.SetSessionJIDMapping(sessionID, jid)
	}

	if err := uc.waClient.Connect(ctx, sessionID); err != nil {
		_ = uc.UpdateSessionStatus(ctx, sessionID, entity.StatusDisconnected)
		uc.publishConnectionFailedEvent(ctx, sessionID, "CONNECTION_ERROR", err.Error())
		return errors.ErrConnectionFailed.WithCause(err)
	}

	// Update status to connected
	_ = uc.UpdateSessionStatus(ctx, sessionID, entity.StatusConnected)

	// Publish connection.connected event
	uc.publishConnectionEvent(ctx, sessionID, entity.EventTypeConnected)

	// Get JID if available
	if newJID, err := uc.waClient.GetSessionJID(sessionID); err == nil && newJID != "" {
		_ = uc.UpdateSessionJID(ctx, sessionID, newJID)
	}

	return nil
}

// publishConnectionEvent publishes a connection event via WebSocket
func (uc *SessionUseCase) publishConnectionEvent(ctx context.Context, sessionID string, eventType entity.EventType) {
	if uc.publisher == nil || !uc.publisher.IsConnected() {
		return
	}

	event := entity.NewEvent(
		uuid.New().String(),
		eventType,
		sessionID,
		nil,
	)
	_ = uc.publisher.Publish(ctx, event)
}

// publishConnectionFailedEvent publishes a connection.failed event with error details
func (uc *SessionUseCase) publishConnectionFailedEvent(ctx context.Context, sessionID, errorCode, errorMessage string) {
	if uc.publisher == nil || !uc.publisher.IsConnected() {
		return
	}

	event, err := entity.NewConnectionFailedEvent(
		uuid.New().String(),
		sessionID,
		errorCode,
		errorMessage,
	)
	if err != nil {
		return
	}
	_ = uc.publisher.Publish(ctx, event)
}

// DisconnectSession disconnects a session without deleting it (keeps credentials)
func (uc *SessionUseCase) DisconnectSession(ctx context.Context, sessionID string) error {
	// Disconnect the WhatsApp client if connected
	if uc.waClient != nil && uc.waClient.IsConnected(sessionID) {
		if err := uc.waClient.Disconnect(ctx, sessionID); err != nil {
			return errors.ErrConnectionFailed.WithCause(err)
		}
	}

	// Update status to disconnected
	_ = uc.UpdateSessionStatus(ctx, sessionID, entity.StatusDisconnected)

	// Publish connection.disconnected event
	uc.publishConnectionEvent(ctx, sessionID, entity.EventTypeDisconnected)

	return nil
}

// UpdateSessionJID updates the JID of a session after authentication
func (uc *SessionUseCase) UpdateSessionJID(ctx context.Context, sessionID, jid string) error {
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil {
		if errors.IsNotFound(err) {
			// Create session with JID
			newSession := entity.NewSession(sessionID, "")
			newSession.SetJID(jid)
			newSession.SetStatus(entity.StatusConnected)
			return uc.repo.Create(ctx, newSession)
		}
		return errors.ErrDatabaseError.WithCause(err)
	}

	session.SetJID(jid)
	session.SetStatus(entity.StatusConnected)

	if err := uc.repo.Update(ctx, session); err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}

	// Publish authenticated event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			entity.EventTypeAuthenticated,
			sessionID,
			map[string]string{"jid": jid},
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return nil
}
