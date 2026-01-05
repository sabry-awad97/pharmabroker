package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	httpPresentation "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
)

func TestCORSMiddleware_DefaultWildcard(t *testing.T) {
	gin.SetMode(gin.TestMode)

	router := gin.New()
	// Use empty config - CORSMiddlewareWithConfig applies defaults
	router.Use(httpPresentation.CORSMiddlewareWithConfig(config.CORSConfig{}))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://example.com")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
	assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Methods"))
	assert.NotEmpty(t, w.Header().Get("Access-Control-Allow-Headers"))
}

func TestCORSMiddlewareWithConfig_SpecificOrigins(t *testing.T) {
	gin.SetMode(gin.TestMode)

	corsConfig := config.CORSConfig{
		AllowedOrigins:   []string{"https://app.example.com", "https://admin.example.com"},
		AllowedMethods:   []string{"GET", "POST"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		ExposeHeaders:    []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           3600,
	}

	router := gin.New()
	router.Use(httpPresentation.CORSMiddlewareWithConfig(corsConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	tests := []struct {
		name           string
		origin         string
		expectedOrigin string
	}{
		{
			name:           "Allowed origin",
			origin:         "https://app.example.com",
			expectedOrigin: "https://app.example.com",
		},
		{
			name:           "Another allowed origin",
			origin:         "https://admin.example.com",
			expectedOrigin: "https://admin.example.com",
		},
		{
			name:           "Disallowed origin",
			origin:         "https://evil.com",
			expectedOrigin: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Origin", tt.origin)
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Equal(t, tt.expectedOrigin, w.Header().Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestCORSMiddlewareWithConfig_WildcardSubdomain(t *testing.T) {
	gin.SetMode(gin.TestMode)

	corsConfig := config.CORSConfig{
		AllowedOrigins: []string{"*.example.com"},
		AllowedMethods: []string{"GET"},
	}

	router := gin.New()
	router.Use(httpPresentation.CORSMiddlewareWithConfig(corsConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	tests := []struct {
		name           string
		origin         string
		expectedOrigin string
	}{
		{
			name:           "Subdomain match",
			origin:         "https://app.example.com",
			expectedOrigin: "https://app.example.com",
		},
		{
			name:           "Another subdomain match",
			origin:         "https://api.example.com",
			expectedOrigin: "https://api.example.com",
		},
		{
			name:           "Non-matching domain",
			origin:         "https://example.org",
			expectedOrigin: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("Origin", tt.origin)
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
			assert.Equal(t, tt.expectedOrigin, w.Header().Get("Access-Control-Allow-Origin"))
		})
	}
}

func TestCORSMiddlewareWithConfig_PreflightRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)

	corsConfig := config.CORSConfig{
		AllowedOrigins:   []string{"https://app.example.com"},
		AllowedMethods:   []string{"GET", "POST", "PUT"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           3600,
	}

	router := gin.New()
	router.Use(httpPresentation.CORSMiddlewareWithConfig(corsConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("OPTIONS", "/test", nil)
	req.Header.Set("Origin", "https://app.example.com")
	req.Header.Set("Access-Control-Request-Method", "POST")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.Equal(t, "https://app.example.com", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "GET, POST, PUT", w.Header().Get("Access-Control-Allow-Methods"))
	assert.Equal(t, "Content-Type, Authorization", w.Header().Get("Access-Control-Allow-Headers"))
	assert.Equal(t, "true", w.Header().Get("Access-Control-Allow-Credentials"))
	assert.Equal(t, "3600", w.Header().Get("Access-Control-Max-Age"))
}

func TestCORSMiddlewareWithConfig_ExposeHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)

	corsConfig := config.CORSConfig{
		AllowedOrigins: []string{"*"},
		ExposeHeaders:  []string{"X-Request-ID", "X-Custom-Header"},
	}

	router := gin.New()
	router.Use(httpPresentation.CORSMiddlewareWithConfig(corsConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Origin", "https://example.com")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "X-Request-ID, X-Custom-Header", w.Header().Get("Access-Control-Expose-Headers"))
}

func TestIsOriginAllowed(t *testing.T) {
	tests := []struct {
		name           string
		origin         string
		allowedOrigins []string
		expected       bool
	}{
		{
			name:           "Wildcard allows all",
			origin:         "https://any.domain.com",
			allowedOrigins: []string{"*"},
			expected:       true,
		},
		{
			name:           "Exact match",
			origin:         "https://app.example.com",
			allowedOrigins: []string{"https://app.example.com"},
			expected:       true,
		},
		{
			name:           "No match",
			origin:         "https://evil.com",
			allowedOrigins: []string{"https://app.example.com"},
			expected:       false,
		},
		{
			name:           "Wildcard subdomain match",
			origin:         "https://api.example.com",
			allowedOrigins: []string{"*.example.com"},
			expected:       true,
		},
		{
			name:           "Empty allowed origins",
			origin:         "https://example.com",
			allowedOrigins: []string{},
			expected:       false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := httpPresentation.IsOriginAllowed(tt.origin, tt.allowedOrigins)
			assert.Equal(t, tt.expected, result)
		})
	}
}
