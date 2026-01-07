package integration

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	httpHandler "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Health Checker Mocks ====================

// MockHealthChecker is a mock implementation of HealthChecker
type MockHealthChecker struct {
	name    string
	healthy bool
	message string
	details map[string]interface{}
}

func NewMockHealthChecker(name string, healthy bool, message string) *MockHealthChecker {
	return &MockHealthChecker{
		name:    name,
		healthy: healthy,
		message: message,
		details: make(map[string]interface{}),
	}
}

func (m *MockHealthChecker) Check(ctx context.Context) repository.HealthStatus {
	return repository.HealthStatus{
		Name:    m.name,
		Healthy: m.healthy,
		Message: m.message,
		Details: m.details,
	}
}

func (m *MockHealthChecker) Name() string {
	return m.name
}

// ==================== Test Setup ====================

func setupHealthTestRouter(healthUC *usecase.HealthUseCase) *gin.Engine {
	gin.SetMode(gin.TestMode)

	// Create handler with health use case
	handler := httpHandler.NewHandler(nil, nil, healthUC, nil)

	// Register routes with health-enabled handler
	return httpHandler.NewRouter(handler, httpHandler.DefaultRouterConfig())
}

// ==================== GET /health Tests ====================

func TestHealth_Success(t *testing.T) {
	healthUC := usecase.NewHealthUseCase()
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Check for success wrapper or direct response
	if success, ok := response["success"]; ok {
		assert.True(t, success.(bool))
		data := response["data"].(map[string]interface{})
		assert.Equal(t, "healthy", data["status"])
	} else {
		assert.Equal(t, "healthy", response["status"])
	}
}

func TestHealth_WithDetails(t *testing.T) {
	healthUC := usecase.NewHealthUseCase()
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/health?details=true", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Should contain details when requested
	assert.NotNil(t, response)
}

func TestHealth_WithoutHealthUseCase(t *testing.T) {
	// Create router without health use case
	gin.SetMode(gin.TestMode)
	handler := httpHandler.NewHandler(nil, nil, nil, nil)
	router := httpHandler.NewRouter(handler, httpHandler.DefaultRouterConfig())

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Should still return healthy status
	if success, ok := response["success"]; ok {
		assert.True(t, success.(bool))
	}
}

// ==================== GET /ready Tests ====================

func TestReady_AllComponentsHealthy(t *testing.T) {
	dbChecker := NewMockHealthChecker("database", true, "database is healthy")
	waChecker := NewMockHealthChecker("whatsapp_client", true, "client is initialized")
	pubChecker := NewMockHealthChecker("event_publisher", true, "publisher is connected")

	healthUC := usecase.NewHealthUseCase(dbChecker, waChecker, pubChecker)
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "ready", response["status"])
	assert.NotNil(t, response["components"])

	components := response["components"].([]interface{})
	assert.Len(t, components, 3)

	// Verify all components are healthy
	for _, comp := range components {
		c := comp.(map[string]interface{})
		assert.True(t, c["healthy"].(bool))
	}
}

func TestReady_SomeComponentsUnhealthy(t *testing.T) {
	dbChecker := NewMockHealthChecker("database", true, "database is healthy")
	waChecker := NewMockHealthChecker("whatsapp_client", false, "client not initialized")
	pubChecker := NewMockHealthChecker("event_publisher", true, "publisher is connected")

	healthUC := usecase.NewHealthUseCase(dbChecker, waChecker, pubChecker)
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "not_ready", response["status"])
	assert.NotNil(t, response["components"])

	components := response["components"].([]interface{})
	assert.Len(t, components, 3)

	// Find the unhealthy component
	foundUnhealthy := false
	for _, comp := range components {
		c := comp.(map[string]interface{})
		if c["name"] == "whatsapp_client" {
			assert.False(t, c["healthy"].(bool))
			foundUnhealthy = true
		}
	}
	assert.True(t, foundUnhealthy)
}

func TestReady_AllComponentsUnhealthy(t *testing.T) {
	dbChecker := NewMockHealthChecker("database", false, "database connection failed")
	waChecker := NewMockHealthChecker("whatsapp_client", false, "client not initialized")
	pubChecker := NewMockHealthChecker("event_publisher", false, "publisher disconnected")

	healthUC := usecase.NewHealthUseCase(dbChecker, waChecker, pubChecker)
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusServiceUnavailable, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "not_ready", response["status"])

	components := response["components"].([]interface{})
	for _, comp := range components {
		c := comp.(map[string]interface{})
		assert.False(t, c["healthy"].(bool))
	}
}

func TestReady_NoCheckers(t *testing.T) {
	healthUC := usecase.NewHealthUseCase()
	router := setupHealthTestRouter(healthUC)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.Equal(t, "ready", response["status"])
	components := response["components"].([]interface{})
	assert.Empty(t, components)
}

func TestReady_WithoutHealthUseCase(t *testing.T) {
	// Create router without health use case
	gin.SetMode(gin.TestMode)
	handler := httpHandler.NewHandler(nil, nil, nil, nil)
	router := httpHandler.NewRouter(handler, httpHandler.DefaultRouterConfig())

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	var response map[string]interface{}
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	// Should still return ready status (fallback behavior)
	if success, ok := response["success"]; ok {
		assert.True(t, success.(bool))
	}
}
