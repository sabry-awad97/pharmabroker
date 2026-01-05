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

// ==================== POST /api/sessions Tests ====================

func TestCreateSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	reqBody := dto.CreateSessionRequest{Name: "Test Session"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var response dto.APIResponse[dto.SessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.NotEmpty(t, response.Data.ID)
	assert.Equal(t, "Test Session", response.Data.Name)
	assert.Equal(t, "pending", response.Data.Status)
}

func TestCreateSession_InvalidJSON(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "INVALID_JSON", response.Error.Code)
}

func TestCreateSession_ValidationFailed_EmptyName(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	reqBody := dto.CreateSessionRequest{Name: ""}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/sessions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "VALIDATION_FAILED", response.Error.Code)
}

// ==================== GET /api/sessions Tests ====================

func TestListSessions_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	repo.sessions["id1"] = entity.NewSession("id1", "Session 1")
	repo.sessions["id2"] = entity.NewSession("id2", "Session 2")
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[[]dto.SessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Len(t, response.Data, 2)
}

func TestListSessions_Empty(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[[]dto.SessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Empty(t, response.Data)
}

// ==================== GET /api/sessions/:id Tests ====================

func TestGetSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/test-id", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[dto.SessionResponse]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, "test-id", response.Data.ID)
	assert.Equal(t, "Test Session", response.Data.Name)
}

func TestGetSession_NotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodGet, "/api/sessions/non-existent", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "SESSION_NOT_FOUND", response.Error.Code)
}

// ==================== DELETE /api/sessions/:id Tests ====================

func TestDeleteSession_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	existingSession := entity.NewSession("test-id", "Test Session")
	repo.sessions["test-id"] = existingSession
	waClient.Connected["test-id"] = true

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/test-id", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response dto.APIResponse[map[string]string]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.Equal(t, "Session deleted successfully", response.Data["message"])

	// Verify session was deleted
	_, exists := repo.sessions["test-id"]
	assert.False(t, exists)
}

func TestDeleteSession_NotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)
	router := setupTestRouter(sessionUC)

	req := httptest.NewRequest(http.MethodDelete, "/api/sessions/non-existent", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "SESSION_NOT_FOUND", response.Error.Code)
}
