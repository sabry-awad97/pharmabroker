package unit

import (
	"context"
	"testing"

	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== SessionUseCase Tests ====================

func TestSessionUseCase_CreateSession(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	req := dto.CreateSessionRequest{
		Name: "Test Session",
	}

	session, err := uc.CreateSession(context.Background(), req)

	require.NoError(t, err)
	assert.NotEmpty(t, session.ID)
	assert.Equal(t, "Test Session", session.Name)
	assert.Equal(t, entity.StatusPending, session.Status)

	// Verify session was persisted
	stored, _ := repo.GetByID(context.Background(), session.ID)
	assert.NotNil(t, stored)
	assert.Equal(t, session.ID, stored.ID)
}

func TestSessionUseCase_CreateSession_RepositoryError(t *testing.T) {
	repo := NewSessionRepositoryMock()
	repo.createFn = func(ctx context.Context, session *entity.Session) error {
		return errors.ErrDatabaseError
	}

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	req := dto.CreateSessionRequest{
		Name: "Test Session",
	}

	session, err := uc.CreateSession(context.Background(), req)

	assert.Nil(t, session)
	assert.ErrorIs(t, err, errors.ErrDatabaseError)
}

func TestSessionUseCase_GetSession(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	session, err := uc.GetSession(context.Background(), "test-id")

	require.NoError(t, err)
	assert.Equal(t, "test-id", session.ID)
	assert.Equal(t, "Test Session", session.Name)
}

func TestSessionUseCase_GetSession_NotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	uc := usecase.NewSessionUseCase(repo, nil, nil)

	session, err := uc.GetSession(context.Background(), "non-existent")

	assert.Nil(t, session)
	assert.ErrorIs(t, err, errors.ErrSessionNotFound)
}

func TestSessionUseCase_ListSessions(t *testing.T) {
	repo := NewSessionRepositoryMock()
	repo.sessions["id1"] = entity.NewSession("id1", "Session 1")
	repo.sessions["id2"] = entity.NewSession("id2", "Session 2")

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	sessions, err := uc.ListSessions(context.Background())

	require.NoError(t, err)
	assert.Len(t, sessions, 2)
}

func TestSessionUseCase_DeleteSession(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.DeleteSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify session was deleted
	stored, _ := repo.GetByID(context.Background(), "test-id")
	assert.Nil(t, stored)

	// Verify client was disconnected
	assert.False(t, waClient.IsConnected("test-id"))
}

func TestSessionUseCase_DeleteSession_NotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.DeleteSession(context.Background(), "non-existent")

	assert.ErrorIs(t, err, errors.ErrSessionNotFound)
}

func TestSessionUseCase_StartQRAuth(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "test-id")

	require.NoError(t, err)
	assert.NotNil(t, qrChan)

	// Verify status was updated to connecting
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnecting, session.Status)
}

func TestSessionUseCase_StartQRAuth_SessionNotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "non-existent")

	assert.Nil(t, qrChan)
	assert.ErrorIs(t, err, errors.ErrSessionNotFound)
}

func TestSessionUseCase_StartQRAuth_NoClient(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "test-id")

	assert.Nil(t, qrChan)
	assert.ErrorIs(t, err, errors.ErrConnectionFailed)
}

func TestSessionUseCase_ReconnectSession(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.ReconnectSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify client is connected
	assert.True(t, waClient.IsConnected("test-id"))

	// Verify status was updated
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_ReconnectSession_AlreadyConnected(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	err := uc.ReconnectSession(context.Background(), "test-id")

	require.NoError(t, err)
}

func TestSessionUseCase_ReconnectSession_NotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	err := uc.ReconnectSession(context.Background(), "non-existent")

	assert.ErrorIs(t, err, errors.ErrSessionNotFound)
}

func TestSessionUseCase_UpdateSessionStatus(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.UpdateSessionStatus(context.Background(), "test-id", entity.StatusConnected)

	require.NoError(t, err)

	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_UpdateSessionJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, publisher)

	err := uc.UpdateSessionJID(context.Background(), "test-id", "1234567890@s.whatsapp.net")

	require.NoError(t, err)

	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, "1234567890@s.whatsapp.net", session.JID)
	assert.Equal(t, entity.StatusConnected, session.Status)
}
