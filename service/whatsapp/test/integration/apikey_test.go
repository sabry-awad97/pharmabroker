package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	httpHandler "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupAPIKeyTestRouter(sessionUC *usecase.SessionUseCase, apiKeyConfig *config.APIKeyConfig) *gin.Engine {
	gin.SetMode(gin.TestMode)

	routerConfig := httpHandler.DefaultRouterConfig()
	routerConfig.APIKeyConfig = apiKeyConfig

	handler := httpHandler.NewHandler(sessionUC, nil, nil, nil)
	return httpHandler.NewRouter(handler, routerConfig)
}

// ==================== API Key Authentication Tests ====================

func TestAPIKey_ValidKey(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1", "valid-api-key-2"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req.Header.Set("X-API-Key", "valid-api-key-1")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// 400 is expected because we're not sending a valid message body,
	// but it proves the API key was accepted (not 401)
	assert.NotEqual(t, http.StatusUnauthorized, w.Code)
}

func TestAPIKey_InvalidKey(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1", "valid-api-key-2"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req.Header.Set("X-API-Key", "invalid-api-key")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "INVALID_API_KEY", response.Error.Code)
}

func TestAPIKey_MissingKey(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	// No API key header
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "MISSING_API_KEY", response.Error.Code)
}

func TestAPIKey_Disabled(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: false, // Disabled
		Keys:    []string{"valid-api-key-1"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Request without API key should not get 401 when auth is disabled
	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusUnauthorized, w.Code)
}

func TestAPIKey_NoConfig(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	// No API key config
	router := setupAPIKeyTestRouter(sessionUC, nil)

	// Request without API key should not get 401 when no config
	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusUnauthorized, w.Code)
}

func TestAPIKey_CustomHeader(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1"},
		Header:  "Authorization", // Custom header
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Request with custom header
	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req.Header.Set("Authorization", "valid-api-key-1")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Not 401 means API key was accepted
	assert.NotEqual(t, http.StatusUnauthorized, w.Code)
}

func TestAPIKey_MultipleValidKeys(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"key-1", "key-2", "key-3"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Test each valid key
	for _, key := range []string{"key-1", "key-2", "key-3"} {
		req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
		req.Header.Set("X-API-Key", key)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.NotEqual(t, http.StatusUnauthorized, w.Code, "Key %s should be valid", key)
	}
}

func TestAPIKey_HealthEndpointsNoAuth(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Health endpoints should not require API key
	healthEndpoints := []string{"/health", "/ready"}

	for _, endpoint := range healthEndpoints {
		req := httptest.NewRequest(http.MethodGet, endpoint, nil)
		// No API key
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Endpoint %s should not require API key", endpoint)
	}
}

func TestAPIKey_EmptyKey(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-api-key-1"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Request with empty API key
	req := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req.Header.Set("X-API-Key", "")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "MISSING_API_KEY", response.Error.Code)
}

func TestAPIKey_CaseSensitive(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	apiKeyConfig := &config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"ValidApiKey"},
		Header:  "X-API-Key",
	}

	router := setupAPIKeyTestRouter(sessionUC, apiKeyConfig)

	// Exact case should work
	req1 := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req1.Header.Set("X-API-Key", "ValidApiKey")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.NotEqual(t, http.StatusUnauthorized, w1.Code)

	// Different case should fail
	req2 := httptest.NewRequest(http.MethodPost, "/api/messages", nil)
	req2.Header.Set("X-API-Key", "validapikey")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusUnauthorized, w2.Code)
}
