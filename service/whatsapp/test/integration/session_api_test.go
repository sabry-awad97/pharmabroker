package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
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
