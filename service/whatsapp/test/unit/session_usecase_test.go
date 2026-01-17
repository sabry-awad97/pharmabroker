package unit

import (
	"context"
	"testing"

	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== SessionUseCase Tests ====================

func TestSessionUseCase_CreateSessionWithID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	session, err := uc.CreateSessionWithID(context.Background(), "test-id", "Test Session")

	require.NoError(t, err)
	assert.Equal(t, "test-id", session.ID)
	assert.Equal(t, "Test Session", session.Name)
	assert.Equal(t, entity.StatusPending, session.Status)

	// Verify session was persisted
	stored, _ := repo.GetByID(context.Background(), session.ID)
	assert.NotNil(t, stored)
	assert.Equal(t, session.ID, stored.ID)
}

func TestSessionUseCase_CreateSessionWithID_RepositoryError(t *testing.T) {
	repo := NewSessionRepositoryMock()
	repo.CreateFn = func(ctx context.Context, session *entity.Session) error {
		return errors.ErrDatabaseError
	}

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	session, err := uc.CreateSessionWithID(context.Background(), "test-id", "Test Session")

	assert.Nil(t, session)
	assert.ErrorIs(t, err, errors.ErrDatabaseError)
}

func TestSessionUseCase_DeleteSession(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.Sessions["test-id"] = existingSession
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

	// Should succeed (idempotent) even if session doesn't exist
	require.NoError(t, err)
}

func TestSessionUseCase_StartQRAuth(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "test-id")

	require.NoError(t, err)
	assert.NotNil(t, qrChan)

	// Verify status was updated to connecting
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnecting, session.Status)
}

func TestSessionUseCase_StartQRAuth_CreatesSessionIfNotExists(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()

	uc := usecase.NewSessionUseCase(repo, waClient, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "new-session")

	require.NoError(t, err)
	assert.NotNil(t, qrChan)

	// Verify session was created
	session, _ := repo.GetByID(context.Background(), "new-session")
	assert.NotNil(t, session)
	assert.Equal(t, entity.StatusConnecting, session.Status)
}

func TestSessionUseCase_StartQRAuth_NoClient(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	qrChan, err := uc.StartQRAuth(context.Background(), "test-id")

	assert.Nil(t, qrChan)
	assert.ErrorIs(t, err, errors.ErrConnectionFailed)
}

func TestSessionUseCase_UpdateSessionStatus(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.UpdateSessionStatus(context.Background(), "test-id", entity.StatusConnected)

	require.NoError(t, err)

	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_UpdateSessionStatus_CreatesSessionIfNotExists(t *testing.T) {
	repo := NewSessionRepositoryMock()

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.UpdateSessionStatus(context.Background(), "new-session", entity.StatusConnected)

	require.NoError(t, err)

	// Verify session was created with the status
	session, _ := repo.GetByID(context.Background(), "new-session")
	assert.NotNil(t, session)
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_UpdateSessionJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, publisher)

	err := uc.UpdateSessionJID(context.Background(), "test-id", "1234567890@s.whatsapp.net")

	require.NoError(t, err)

	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, "1234567890@s.whatsapp.net", session.JID)
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_UpdateSessionJID_CreatesSessionIfNotExists(t *testing.T) {
	repo := NewSessionRepositoryMock()
	publisher := NewEventPublisherMock()

	uc := usecase.NewSessionUseCase(repo, nil, publisher)

	err := uc.UpdateSessionJID(context.Background(), "new-session", "1234567890@s.whatsapp.net")

	require.NoError(t, err)

	// Verify session was created with JID
	session, _ := repo.GetByID(context.Background(), "new-session")
	assert.NotNil(t, session)
	assert.Equal(t, "1234567890@s.whatsapp.net", session.JID)
}

// ==================== ReconnectSession Tests ====================

func TestSessionUseCase_ReconnectSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.ReconnectSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify client was connected
	assert.True(t, waClient.IsConnected("test-id"))

	// Verify status was updated to connected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusConnected, session.Status)
}

func TestSessionUseCase_ReconnectSession_AlreadyConnected(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	repo.Sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.ReconnectSession(context.Background(), "test-id")

	// Should succeed without error
	require.NoError(t, err)

	// Client should still be connected
	assert.True(t, waClient.IsConnected("test-id"))
}

func TestSessionUseCase_ReconnectSession_NoClient(t *testing.T) {
	repo := NewSessionRepositoryMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.ReconnectSession(context.Background(), "test-id")

	assert.ErrorIs(t, err, errors.ErrConnectionFailed)

	// Verify status was reverted to disconnected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusDisconnected, session.Status)
}

func TestSessionUseCase_ReconnectSession_ConnectionFailed(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.Sessions["test-id"] = existingSession

	// Make connect fail
	waClient.ConnectFn = func(ctx context.Context, sessionID string) error {
		return errors.ErrConnectionFailed
	}

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.ReconnectSession(context.Background(), "test-id")

	assert.ErrorIs(t, err, errors.ErrConnectionFailed)

	// Verify status was reverted to disconnected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusDisconnected, session.Status)
}

func TestSessionUseCase_ReconnectSession_UpdatesJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.ReconnectSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify JID was updated (mock returns sessionID@s.whatsapp.net)
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, "test-id@s.whatsapp.net", session.JID)
}

// ==================== DisconnectSession Tests ====================

func TestSessionUseCase_DisconnectSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.Sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.DisconnectSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify client was disconnected
	assert.False(t, waClient.IsConnected("test-id"))

	// Verify status was updated to disconnected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusDisconnected, session.Status)
}

func TestSessionUseCase_DisconnectSession_AlreadyDisconnected(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.DisconnectSession(context.Background(), "test-id")

	// Should succeed without error
	require.NoError(t, err)

	// Status should remain disconnected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusDisconnected, session.Status)
}

func TestSessionUseCase_DisconnectSession_PreservesJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.Sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.DisconnectSession(context.Background(), "test-id")

	require.NoError(t, err)

	// Verify JID is preserved
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, "1234567890@s.whatsapp.net", session.JID)
}

func TestSessionUseCase_DisconnectSession_NoClient(t *testing.T) {
	repo := NewSessionRepositoryMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	repo.Sessions["test-id"] = existingSession

	uc := usecase.NewSessionUseCase(repo, nil, nil)

	err := uc.DisconnectSession(context.Background(), "test-id")

	// Should succeed - no client means nothing to disconnect
	require.NoError(t, err)

	// Status should be updated to disconnected
	session, _ := repo.GetByID(context.Background(), "test-id")
	assert.Equal(t, entity.StatusDisconnected, session.Status)
}

func TestSessionUseCase_DisconnectSession_SessionNotInRepo(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Session exists in client but not in repo
	waClient.Connected["test-id"] = true

	uc := usecase.NewSessionUseCase(repo, waClient, publisher)

	err := uc.DisconnectSession(context.Background(), "test-id")

	// Should succeed - disconnect is idempotent
	require.NoError(t, err)

	// Client should be disconnected
	assert.False(t, waClient.IsConnected("test-id"))
}
