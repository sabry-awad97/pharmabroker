package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// SessionUseCase handles session business logic
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

// CreateSession creates a new WhatsApp session
func (uc *SessionUseCase) CreateSession(ctx context.Context, req dto.CreateSessionRequest) (*entity.Session, error) {
	// Generate a new UUID for the session
	id := uuid.New().String()

	// Create the session entity
	session := entity.NewSession(id, req.Name)

	// Persist the session
	if err := uc.repo.Create(ctx, session); err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	// Publish session created event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			entity.EventTypeAuthenticated,
			session.ID,
			map[string]string{"action": "created", "name": session.Name},
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return session, nil
}

// GetSession retrieves a session by ID
func (uc *SessionUseCase) GetSession(ctx context.Context, id string) (*entity.Session, error) {
	session, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, errors.ErrSessionNotFound
	}
	return session, nil
}

// ListSessions retrieves all sessions
func (uc *SessionUseCase) ListSessions(ctx context.Context) ([]*entity.Session, error) {
	sessions, err := uc.repo.GetAll(ctx)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}
	return sessions, nil
}

// DeleteSession removes a session
func (uc *SessionUseCase) DeleteSession(ctx context.Context, id string) error {
	// Check if session exists
	session, err := uc.repo.GetByID(ctx, id)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}
	if session == nil {
		return errors.ErrSessionNotFound
	}

	// Disconnect the WhatsApp client if connected
	if uc.waClient != nil && uc.waClient.IsConnected(id) {
		// Ignore error - we still want to delete the session even if disconnect fails
		_ = uc.waClient.Disconnect(ctx, id)
	}

	// Delete from repository
	if err := uc.repo.Delete(ctx, id); err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}

	// Publish session deleted event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			entity.EventTypeSessionExpired,
			id,
			map[string]string{"action": "deleted"},
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return nil
}

// StartQRAuth initiates QR code authentication for a session
func (uc *SessionUseCase) StartQRAuth(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	// Check if session exists
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}
	if session == nil {
		return nil, errors.ErrSessionNotFound
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
		// Reset status on failure
		_ = uc.repo.UpdateStatus(ctx, sessionID, entity.StatusDisconnected)
		return nil, errors.ErrQRGenerationFailed.WithCause(err)
	}

	return qrChan, nil
}

// ReconnectSession attempts to reconnect an existing session
func (uc *SessionUseCase) ReconnectSession(ctx context.Context, sessionID string) error {
	// Check if session exists
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}
	if session == nil {
		return errors.ErrSessionNotFound
	}

	// Check if already connected
	if uc.waClient != nil && uc.waClient.IsConnected(sessionID) {
		return nil // Already connected
	}

	// Update status to connecting
	if err := uc.repo.UpdateStatus(ctx, sessionID, entity.StatusConnecting); err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}

	// Attempt to connect
	if uc.waClient == nil {
		return errors.ErrConnectionFailed.WithMessage("WhatsApp client not available")
	}

	if err := uc.waClient.Connect(ctx, sessionID); err != nil {
		// Reset status on failure
		_ = uc.repo.UpdateStatus(ctx, sessionID, entity.StatusDisconnected)
		return errors.ErrConnectionFailed.WithCause(err)
	}

	// Update status to connected
	if err := uc.repo.UpdateStatus(ctx, sessionID, entity.StatusConnected); err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}

	// Publish connected event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			entity.EventTypeConnected,
			sessionID,
			map[string]string{"action": "reconnected"},
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return nil
}

// UpdateSessionStatus updates the status of a session
func (uc *SessionUseCase) UpdateSessionStatus(ctx context.Context, sessionID string, status entity.Status) error {
	// Check if session exists
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}
	if session == nil {
		return errors.ErrSessionNotFound
	}

	// Update status
	if err := uc.repo.UpdateStatus(ctx, sessionID, status); err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}

	return nil
}

// UpdateSessionJID updates the JID of a session after authentication
func (uc *SessionUseCase) UpdateSessionJID(ctx context.Context, sessionID, jid string) error {
	// Get session
	session, err := uc.repo.GetByID(ctx, sessionID)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err)
	}
	if session == nil {
		return errors.ErrSessionNotFound
	}

	// Update JID and status
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
