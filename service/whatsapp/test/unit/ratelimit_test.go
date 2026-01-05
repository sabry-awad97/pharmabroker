package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
	httpPresentation "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewLimiter(t *testing.T) {
	config := ratelimit.DefaultConfig()
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	assert.NotNil(t, limiter)
	assert.Equal(t, config.Enabled, limiter.Config().Enabled)
	assert.Equal(t, config.RequestsPerSecond, limiter.Config().RequestsPerSecond)
	assert.Equal(t, config.BurstSize, limiter.Config().BurstSize)
}

func TestLimiter_Allow(t *testing.T) {
	config := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 2,
		BurstSize:         2,
		ByIP:              true,
		CleanupInterval:   0, // Disable cleanup for tests
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	key := "test-client"

	// First two requests should be allowed (burst size = 2)
	assert.True(t, limiter.Allow(key), "First request should be allowed")
	assert.True(t, limiter.Allow(key), "Second request should be allowed")

	// Third request should be denied (exceeded burst)
	assert.False(t, limiter.Allow(key), "Third request should be denied")
}

func TestLimiter_AllowDisabled(t *testing.T) {
	config := ratelimit.Config{
		Enabled:           false,
		RequestsPerSecond: 1,
		BurstSize:         1,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	key := "test-client"

	// All requests should be allowed when disabled
	for i := 0; i < 100; i++ {
		assert.True(t, limiter.Allow(key), "Request should be allowed when rate limiting is disabled")
	}
}

func TestLimiter_GetLimitInfo(t *testing.T) {
	config := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 10,
		BurstSize:         20,
		ByIP:              true,
		CleanupInterval:   0,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	key := "test-client"
	info := limiter.GetLimitInfo(key)

	assert.Equal(t, 10, info.Limit)
	assert.True(t, info.Remaining >= 0)
	assert.True(t, info.Reset > 0)
}

func TestLimiter_DifferentKeys(t *testing.T) {
	config := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 1,
		BurstSize:         1,
		ByIP:              true,
		CleanupInterval:   0,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	// Each key should have its own limiter
	assert.True(t, limiter.Allow("client-1"))
	assert.True(t, limiter.Allow("client-2"))
	assert.True(t, limiter.Allow("client-3"))

	// Same key should be rate limited
	assert.False(t, limiter.Allow("client-1"))
	assert.False(t, limiter.Allow("client-2"))
}

func TestIPKeyExtractor(t *testing.T) {
	tests := []struct {
		name     string
		headers  map[string]string
		remoteIP string
		expected string
	}{
		{
			name:     "X-Forwarded-For header",
			headers:  map[string]string{"X-Forwarded-For": "192.168.1.1"},
			remoteIP: "10.0.0.1:1234",
			expected: "192.168.1.1",
		},
		{
			name:     "X-Real-IP header",
			headers:  map[string]string{"X-Real-IP": "192.168.1.2"},
			remoteIP: "10.0.0.1:1234",
			expected: "192.168.1.2",
		},
		{
			name:     "RemoteAddr fallback",
			headers:  map[string]string{},
			remoteIP: "10.0.0.1:1234",
			expected: "10.0.0.1:1234",
		},
		{
			name:     "X-Forwarded-For takes precedence",
			headers:  map[string]string{"X-Forwarded-For": "192.168.1.1", "X-Real-IP": "192.168.1.2"},
			remoteIP: "10.0.0.1:1234",
			expected: "192.168.1.1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			req.RemoteAddr = tt.remoteIP
			for k, v := range tt.headers {
				req.Header.Set(k, v)
			}

			result := ratelimit.IPKeyExtractor(req)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestAPIKeyExtractor(t *testing.T) {
	extractor := ratelimit.APIKeyExtractor("X-API-Key")

	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "my-secret-key")

	result := extractor(req)
	assert.Equal(t, "my-secret-key", result)
}

func TestRateLimitMiddleware(t *testing.T) {
	gin.SetMode(gin.TestMode)

	config := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 2,
		BurstSize:         2,
		ByIP:              true,
		CleanupInterval:   0,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	router := gin.New()
	router.Use(httpPresentation.RateLimitMiddleware(limiter))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// First two requests should succeed
	for i := 0; i < 2; i++ {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/test", nil)
		req.RemoteAddr = "192.168.1.1:1234"
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
		assert.NotEmpty(t, w.Header().Get("X-RateLimit-Limit"))
		assert.NotEmpty(t, w.Header().Get("X-RateLimit-Remaining"))
		assert.NotEmpty(t, w.Header().Get("X-RateLimit-Reset"))
	}

	// Third request should be rate limited
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.RemoteAddr = "192.168.1.1:1234"
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusTooManyRequests, w.Code)
	assert.Equal(t, "0", w.Header().Get("X-RateLimit-Remaining"))
	assert.NotEmpty(t, w.Header().Get("Retry-After"))
}

func TestRateLimitMiddleware_Disabled(t *testing.T) {
	gin.SetMode(gin.TestMode)

	config := ratelimit.Config{
		Enabled:           false,
		RequestsPerSecond: 1,
		BurstSize:         1,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	router := gin.New()
	router.Use(httpPresentation.RateLimitMiddleware(limiter))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// All requests should succeed when disabled
	for i := 0; i < 10; i++ {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	}
}

func TestRateLimitMiddleware_NilLimiter(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	router.Use(httpPresentation.RateLimitMiddleware(nil))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// All requests should succeed with nil limiter
	for i := 0; i < 10; i++ {
		w := httptest.NewRecorder()
		req := httptest.NewRequest("GET", "/test", nil)
		router.ServeHTTP(w, req)

		assert.Equal(t, http.StatusOK, w.Code)
	}
}

func TestLimiter_TokenRefill(t *testing.T) {
	config := ratelimit.Config{
		Enabled:           true,
		RequestsPerSecond: 10, // 10 tokens per second = 1 token every 100ms
		BurstSize:         1,
		ByIP:              true,
		CleanupInterval:   0,
	}
	limiter := ratelimit.NewLimiter(config)
	defer limiter.Stop()

	key := "test-client"

	// Use the burst
	require.True(t, limiter.Allow(key))
	require.False(t, limiter.Allow(key))

	// Wait for token refill (100ms for 1 token at 10 RPS)
	time.Sleep(150 * time.Millisecond)

	// Should be allowed again
	assert.True(t, limiter.Allow(key))
}
