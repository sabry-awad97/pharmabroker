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

func TestAPIKeyMiddleware_ValidKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key-1", "valid-key-2"},
		Header:  "X-API-Key",
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	tests := []struct {
		name   string
		apiKey string
	}{
		{"First valid key", "valid-key-1"},
		{"Second valid key", "valid-key-2"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := httptest.NewRecorder()
			req := httptest.NewRequest("GET", "/test", nil)
			req.Header.Set("X-API-Key", tt.apiKey)
			router.ServeHTTP(w, req)

			assert.Equal(t, http.StatusOK, w.Code)
		})
	}
}

func TestAPIKeyMiddleware_InvalidKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key"},
		Header:  "X-API-Key",
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "invalid-key")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "INVALID_API_KEY")
}

func TestAPIKeyMiddleware_MissingKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key"},
		Header:  "X-API-Key",
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	// No API key header
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
	assert.Contains(t, w.Body.String(), "MISSING_API_KEY")
}

func TestAPIKeyMiddleware_Disabled(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: false,
		Keys:    []string{"valid-key"},
		Header:  "X-API-Key",
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Request without API key should succeed when disabled
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAPIKeyMiddleware_CustomHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key"},
		Header:  "Authorization",
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Using custom header
	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("Authorization", "valid-key")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	// Using default header should fail
	w = httptest.NewRecorder()
	req = httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "valid-key")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAPIKeyMiddleware_DefaultHeader(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key"},
		Header:  "", // Empty header should default to X-API-Key
	}

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "valid-key")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAPIKeyMiddleware_StoresKeyInContext(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiKeyConfig := config.APIKeyConfig{
		Enabled: true,
		Keys:    []string{"valid-key"},
		Header:  "X-API-Key",
	}

	var capturedKey string

	router := gin.New()
	router.Use(httpPresentation.APIKeyMiddleware(apiKeyConfig))
	router.GET("/test", func(c *gin.Context) {
		capturedKey = httpPresentation.GetAPIKey(c)
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	req.Header.Set("X-API-Key", "valid-key")
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "valid-key", capturedKey)
}

func TestGetAPIKey_NoKey(t *testing.T) {
	gin.SetMode(gin.TestMode)

	var capturedKey string

	router := gin.New()
	router.GET("/test", func(c *gin.Context) {
		capturedKey = httpPresentation.GetAPIKey(c)
		c.String(http.StatusOK, "OK")
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, capturedKey)
}
