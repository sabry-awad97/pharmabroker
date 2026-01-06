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
