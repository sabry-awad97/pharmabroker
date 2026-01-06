package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	httpHandler "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupTestRouter(sessionUC *usecase.SessionUseCase) *gin.Engine {
	gin.SetMode(gin.TestMode)
	return httpHandler.NewRouter(sessionUC, nil, httpHandler.DefaultRouterConfig())
}

// ==================== POST /api/internal/sessions/register Tests ====================

func TestRegisterSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"id": "test-session-id", "name": "Test Session"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response dto.APIResponse[dto.SessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, "test-session-id", response.Data.ID)
	assert.Equal(t, "Test Session", response.Data.Name)
	assert.Equal(t, "pending", response.Data.Status)
}

func TestRegisterSession_InvalidJSON(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/register", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "INVALID_JSON", response.Error.Code)
}

func TestRegisterSession_MissingID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"name": "Test Session"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ==================== POST /api/internal/sessions/:id/unregister Tests ====================

func TestUnregisterSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/unregister", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[map[string]string]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, "Session unregistered successfully", response.Data["message"])

	// Verify session was deleted
	_, exists := repo.sessions["test-id"]
	assert.False(t, exists)
}

func TestUnregisterSession_NotFound_NoError(t *testing.T) {
	// Unregistering a non-existent session should succeed (idempotent)
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/non-existent/unregister", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Should succeed even if session doesn't exist
	assert.Equal(t, http.StatusOK, w.Code)
}

// ==================== POST /api/internal/sessions/:id/status Tests ====================

func TestUpdateSessionStatus_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"status": "connected"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[map[string]string]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)

	// Verify status was updated
	assert.Equal(t, entity.StatusConnected, repo.sessions["test-id"].Status)
}

func TestUpdateSessionStatus_WithJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"status": "connected", "jid": "1234567890@s.whatsapp.net"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify JID was updated
	assert.Equal(t, "1234567890@s.whatsapp.net", repo.sessions["test-id"].JID)
}

func TestUpdateSessionStatus_InvalidStatus(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"status": "invalid_status"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "INVALID_STATUS", response.Error.Code)
}

func TestUpdateSessionStatus_CreatesSessionIfNotExists(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	reqBody := map[string]string{"status": "connected"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/new-session/status", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify session was created
	_, exists := repo.sessions["new-session"]
	assert.True(t, exists)
}

// ==================== POST /api/internal/sessions/:id/reconnect Tests ====================

func TestReconnectSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.sessions["test-id"] = existingSession

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/reconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[map[string]interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, true, response.Data["success"])

	// Verify client was connected
	assert.True(t, waClient.Connected["test-id"])

	// Verify status was updated to connected
	assert.Equal(t, entity.StatusConnected, repo.sessions["test-id"].Status)
}

func TestReconnectSession_AlreadyConnected(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/reconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Should succeed even if already connected
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestReconnectSession_ConnectionFailed(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.sessions["test-id"] = existingSession

	// Make connect fail
	waClient.ConnectFn = func(ctx context.Context, sessionID string) error {
		return errors.ErrConnectionFailed
	}

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/reconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	// Verify status was reverted to disconnected
	assert.Equal(t, entity.StatusDisconnected, repo.sessions["test-id"].Status)
}

func TestReconnectSession_MissingID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions//reconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Empty ID path returns 400 (INVALID_ID)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ==================== POST /api/internal/sessions/:id/disconnect Tests ====================

func TestDisconnectSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/disconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[map[string]interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, true, response.Data["success"])

	// Verify client was disconnected
	assert.False(t, waClient.Connected["test-id"])

	// Verify status was updated to disconnected
	assert.Equal(t, entity.StatusDisconnected, repo.sessions["test-id"].Status)
}

func TestDisconnectSession_AlreadyDisconnected(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusDisconnected)
	repo.sessions["test-id"] = existingSession

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/disconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Should succeed even if already disconnected
	assert.Equal(t, http.StatusOK, w.Code)

	// Status should remain disconnected
	assert.Equal(t, entity.StatusDisconnected, repo.sessions["test-id"].Status)
}

func TestDisconnectSession_PreservesJID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	existingSession.SetStatus(entity.StatusConnected)
	existingSession.SetJID("1234567890@s.whatsapp.net")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/test-id/disconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Verify JID is preserved after disconnect
	assert.Equal(t, "1234567890@s.whatsapp.net", repo.sessions["test-id"].JID)
}

func TestDisconnectSession_MissingID(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions//disconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Empty ID path returns 400 (INVALID_ID)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestDisconnectSession_SessionNotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/internal/sessions/non-existent/disconnect", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Should succeed - disconnect is idempotent
	assert.Equal(t, http.StatusOK, w.Code)
}
