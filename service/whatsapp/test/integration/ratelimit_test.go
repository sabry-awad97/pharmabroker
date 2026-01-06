package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
	httpHandler "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupRateLimitTestRouter(sessionUC *usecase.SessionUseCase, limiter *ratelimit.Limiter) *gin.Engine {
	gin.SetMode(gin.TestMode)

	config := httpHandler.DefaultRouterConfig()
	config.RateLimiter = limiter

	return httpHandler.NewRouter(sessionUC, nil, config)
}

// ==================== Rate Limiting Tests ====================

func TestRateLimit_AllowedRequests(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	// Configure rate limiter with high limit
	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 100,
		BurstSize:         100,
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// Make multiple requests - all should succeed (using health endpoint)
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed", i)
	}
}

func TestRateLimit_ExceedLimit(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	// Configure rate limiter with very low limit
	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 1,
		BurstSize:         2, // Allow only 2 requests initially
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// First 2 requests should succeed (burst)
	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed (within burst)", i)
	}

	// Third request should be rate limited
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)

	var response dto.APIResponse[any]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "RATE_LIMIT_EXCEEDED", response.Error.Code)
}

func TestRateLimit_Headers(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 10,
		BurstSize:         10,
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Check rate limit headers
	limitHeader := w.Header().Get("X-RateLimit-Limit")
	remainingHeader := w.Header().Get("X-RateLimit-Remaining")
	resetHeader := w.Header().Get("X-RateLimit-Reset")

	assert.NotEmpty(t, limitHeader, "X-RateLimit-Limit header should be present")
	assert.NotEmpty(t, remainingHeader, "X-RateLimit-Remaining header should be present")
	assert.NotEmpty(t, resetHeader, "X-RateLimit-Reset header should be present")

	// Verify header values are valid numbers
	limit, err := strconv.Atoi(limitHeader)
	require.NoError(t, err)
	assert.Equal(t, 10, limit)

	remaining, err := strconv.Atoi(remainingHeader)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, remaining, 0)
}

func TestRateLimit_RetryAfterHeader(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 1,
		BurstSize:         1, // Allow only 1 request
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// First request succeeds
	req1 := httptest.NewRequest(http.MethodGet, "/health", nil)
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Second request should be rate limited with Retry-After header
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusTooManyRequests, w2.Code)

	retryAfter := w2.Header().Get("Retry-After")
	assert.NotEmpty(t, retryAfter, "Retry-After header should be present on 429 response")
}

func TestRateLimit_ByIP(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 1,
		BurstSize:         1,
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// Request from IP 1 - should succeed (using X-Real-IP header for cleaner IP extraction)
	req1 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req1.Header.Set("X-Real-IP", "192.168.1.1")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Second request from IP 1 - should be rate limited
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req2.Header.Set("X-Real-IP", "192.168.1.1")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusTooManyRequests, w2.Code)

	// Request from IP 2 - should succeed (different rate limit bucket)
	req3 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req3.Header.Set("X-Real-IP", "192.168.1.2")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	assert.Equal(t, http.StatusOK, w3.Code)
}

func TestRateLimit_Disabled(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	limiterConfig := ratelimit.Config{
		Enabled:           false, // Disabled
		RequestsPerSecond: 1,
		BurstSize:         1,
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// All requests should succeed when rate limiting is disabled
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed when rate limiting is disabled", i)
	}
}

func TestRateLimit_NoLimiter(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	// No rate limiter configured
	router := setupRateLimitTestRouter(sessionUC, nil)

	// All requests should succeed
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodGet, "/health", nil)
		w := httptest.NewRecorder()

		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code, "Request %d should succeed without rate limiter", i)
	}
}

func TestRateLimit_XForwardedFor(t *testing.T) {
	repo := NewSessionRepositoryMock()
	sessionUC := usecase.NewSessionUseCase(repo, nil, nil)

	limiterConfig := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 1,
		BurstSize:         1,
		ByIP:              true,
	}
	limiter := ratelimit.NewLimiter(limiterConfig)
	defer limiter.Stop()

	router := setupRateLimitTestRouter(sessionUC, limiter)

	// Request with X-Forwarded-For header
	req1 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req1.Header.Set("X-Forwarded-For", "10.0.0.1")
	w1 := httptest.NewRecorder()
	router.ServeHTTP(w1, req1)
	assert.Equal(t, http.StatusOK, w1.Code)

	// Second request with same X-Forwarded-For - should be rate limited
	req2 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req2.Header.Set("X-Forwarded-For", "10.0.0.1")
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)
	assert.Equal(t, http.StatusTooManyRequests, w2.Code)

	// Request with different X-Forwarded-For - should succeed
	req3 := httptest.NewRequest(http.MethodGet, "/health", nil)
	req3.Header.Set("X-Forwarded-For", "10.0.0.2")
	w3 := httptest.NewRecorder()
	router.ServeHTTP(w3, req3)
	assert.Equal(t, http.StatusOK, w3.Code)
}
