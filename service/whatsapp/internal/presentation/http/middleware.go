package http

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/metrics"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
)

// RequestIDKey is the context key for request ID
const RequestIDKey = "request_id"

// RequestIDMiddleware adds a unique request ID to each request
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		requestID := c.GetHeader("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}
		c.Set(RequestIDKey, requestID)
		c.Header("X-Request-ID", requestID)
		c.Next()
	}
}

// LoggingMiddleware logs request and response information
func LoggingMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		query := c.Request.URL.RawQuery

		// Get request ID
		requestID, _ := c.Get(RequestIDKey)

		// Process request
		c.Next()

		// Calculate latency
		latency := time.Since(start)

		// Log request details
		log.Printf(
			"[%s] %s %s %s | %d | %v | %s",
			requestID,
			c.Request.Method,
			path,
			query,
			c.Writer.Status(),
			latency,
			c.ClientIP(),
		)
	}
}

// ErrorHandlerMiddleware handles panics and converts them to error responses
func ErrorHandlerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				c.JSON(500, dto.NewErrorResponse[interface{}](
					"INTERNAL_ERROR",
					"An internal error occurred",
					nil,
				))
				c.Abort()
			}
		}()
		c.Next()
	}
}

// CORSMiddlewareWithConfig handles CORS headers with configurable options
// Pass nil to use default configuration
func CORSMiddlewareWithConfig(corsConfig config.CORSConfig) gin.HandlerFunc {
	// Apply defaults if empty
	if len(corsConfig.AllowedOrigins) == 0 {
		corsConfig.AllowedOrigins = []string{"*"}
	}
	if len(corsConfig.AllowedMethods) == 0 {
		corsConfig.AllowedMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	}
	if len(corsConfig.AllowedHeaders) == 0 {
		corsConfig.AllowedHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID", "X-API-Key"}
	}
	if len(corsConfig.ExposeHeaders) == 0 {
		corsConfig.ExposeHeaders = []string{"X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"}
	}
	if corsConfig.MaxAge == 0 {
		corsConfig.MaxAge = 86400
	}

	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")

		// Check if origin is allowed
		allowedOrigin := getAllowedOrigin(origin, corsConfig.AllowedOrigins)
		if allowedOrigin != "" {
			c.Header("Access-Control-Allow-Origin", allowedOrigin)
		}

		// Set other CORS headers
		if len(corsConfig.AllowedMethods) > 0 {
			c.Header("Access-Control-Allow-Methods", strings.Join(corsConfig.AllowedMethods, ", "))
		}
		if len(corsConfig.AllowedHeaders) > 0 {
			c.Header("Access-Control-Allow-Headers", strings.Join(corsConfig.AllowedHeaders, ", "))
		}
		if len(corsConfig.ExposeHeaders) > 0 {
			c.Header("Access-Control-Expose-Headers", strings.Join(corsConfig.ExposeHeaders, ", "))
		}
		if corsConfig.AllowCredentials {
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		if corsConfig.MaxAge > 0 {
			c.Header("Access-Control-Max-Age", strconv.Itoa(corsConfig.MaxAge))
		}

		// Handle preflight requests
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}

// getAllowedOrigin checks if the origin is allowed and returns the appropriate value
func getAllowedOrigin(origin string, allowedOrigins []string) string {
	if len(allowedOrigins) == 0 {
		return ""
	}

	for _, allowed := range allowedOrigins {
		// Wildcard allows all origins
		if allowed == "*" {
			return "*"
		}
		// Exact match
		if allowed == origin {
			return origin
		}
		// Wildcard subdomain match (e.g., "*.example.com")
		if strings.HasPrefix(allowed, "*.") {
			domain := allowed[1:] // Remove the "*" prefix, keep the "."
			if strings.HasSuffix(origin, domain) {
				return origin
			}
		}
	}

	return ""
}

// IsOriginAllowed checks if an origin is in the allowed list (exported for WebSocket use)
func IsOriginAllowed(origin string, allowedOrigins []string) bool {
	return getAllowedOrigin(origin, allowedOrigins) != ""
}

// ContentTypeMiddleware ensures JSON content type for API requests
func ContentTypeMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip for non-API routes
		if c.Request.URL.Path == "/health" || c.Request.URL.Path == "/ready" {
			c.Next()
			return
		}

		// For POST/PUT/PATCH requests, validate content type
		if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" {
			contentType := c.GetHeader("Content-Type")
			if contentType != "" && contentType != "application/json" {
				// Check if it starts with application/json (might have charset)
				if len(contentType) < 16 || contentType[:16] != "application/json" {
					c.JSON(415, dto.NewErrorResponse[interface{}](
						"UNSUPPORTED_MEDIA_TYPE",
						"Content-Type must be application/json",
						nil,
					))
					c.Abort()
					return
				}
			}
		}

		c.Next()
	}
}

// RequestBodyLoggerMiddleware logs request bodies for debugging (use with caution in production)
func RequestBodyLoggerMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Only log for POST/PUT/PATCH requests
		if c.Request.Method == "POST" || c.Request.Method == "PUT" || c.Request.Method == "PATCH" {
			// Read body
			body, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.Next()
				return
			}

			// Restore body for further processing
			c.Request.Body = io.NopCloser(bytes.NewBuffer(body))

			// Log body (sanitize sensitive data in production)
			if len(body) > 0 {
				var prettyJSON bytes.Buffer
				if json.Indent(&prettyJSON, body, "", "  ") == nil {
					log.Printf("Request body: %s", prettyJSON.String())
				}
			}
		}

		c.Next()
	}
}

// RateLimitMiddleware provides rate limiting using token bucket algorithm.
// It uses the provided limiter to control request rates per client.
func RateLimitMiddleware(limiter *ratelimit.Limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip if rate limiting is disabled
		if limiter == nil || !limiter.Config().Enabled {
			c.Next()
			return
		}

		// Extract key based on configuration
		key := extractRateLimitKey(c.Request, limiter.Config())

		// Check if request is allowed
		if !limiter.Allow(key) {
			info := limiter.GetLimitInfo(key)

			// Set rate limit headers
			c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", info.Limit))
			c.Header("X-RateLimit-Remaining", "0")
			c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", info.Reset))
			c.Header("Retry-After", "1")

			c.JSON(http.StatusTooManyRequests, dto.NewErrorResponse[interface{}](
				"RATE_LIMIT_EXCEEDED",
				"Too many requests. Please try again later.",
				nil,
			))
			c.Abort()
			return
		}

		// Set rate limit headers for successful requests
		info := limiter.GetLimitInfo(key)
		c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", info.Limit))
		c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", info.Remaining))
		c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", info.Reset))

		c.Next()
	}
}

// extractRateLimitKey extracts the rate limit key from the request based on configuration.
func extractRateLimitKey(r *http.Request, config ratelimit.Config) string {
	// If API key-based limiting is enabled and API key is present, use it
	if config.ByAPIKey {
		if apiKey := r.Header.Get("X-API-Key"); apiKey != "" {
			return "apikey:" + apiKey
		}
	}

	// Fall back to IP-based limiting
	if config.ByIP {
		return "ip:" + ratelimit.IPKeyExtractor(r)
	}

	// Default to a global limiter
	return "global"
}

// APIKeyMiddleware provides API key authentication for protected routes.
// It validates the API key from the configured header against the list of valid keys.
func APIKeyMiddleware(apiKeyConfig config.APIKeyConfig) gin.HandlerFunc {
	// Build a set of valid keys for O(1) lookup
	validKeys := make(map[string]struct{}, len(apiKeyConfig.Keys))
	for _, key := range apiKeyConfig.Keys {
		validKeys[key] = struct{}{}
	}

	headerName := apiKeyConfig.Header
	if headerName == "" {
		headerName = "X-API-Key"
	}

	return func(c *gin.Context) {
		// Skip if API key authentication is disabled
		if !apiKeyConfig.Enabled {
			c.Next()
			return
		}

		// Get API key from header
		apiKey := c.GetHeader(headerName)
		if apiKey == "" {
			c.JSON(http.StatusUnauthorized, dto.NewErrorResponse[interface{}](
				"MISSING_API_KEY",
				fmt.Sprintf("API key is required in %s header", headerName),
				nil,
			))
			c.Abort()
			return
		}

		// Validate API key
		if _, valid := validKeys[apiKey]; !valid {
			c.JSON(http.StatusUnauthorized, dto.NewErrorResponse[interface{}](
				"INVALID_API_KEY",
				"Invalid API key",
				nil,
			))
			c.Abort()
			return
		}

		// Store API key in context for potential use by other middleware (e.g., rate limiting)
		c.Set("api_key", apiKey)

		c.Next()
	}
}

// APIKeyContextKey is the context key for the authenticated API key
const APIKeyContextKey = "api_key"

// GetAPIKey retrieves the API key from the Gin context
func GetAPIKey(c *gin.Context) string {
	if apiKey, exists := c.Get(APIKeyContextKey); exists {
		if key, ok := apiKey.(string); ok {
			return key
		}
	}
	return ""
}

// MetricsMiddleware records HTTP request metrics using Prometheus
func MetricsMiddleware(m *metrics.Metrics) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip metrics endpoint to avoid recursion
		if c.Request.URL.Path == "/metrics" {
			c.Next()
			return
		}

		// Track in-flight requests
		m.IncrementInFlight()
		defer m.DecrementInFlight()

		// Record start time
		start := time.Now()

		// Process request
		c.Next()

		// Calculate duration
		duration := time.Since(start).Seconds()

		// Normalize path for metrics (replace IDs with placeholders)
		path := normalizePath(c.Request.URL.Path)

		// Record metrics
		status := strconv.Itoa(c.Writer.Status())
		m.RecordHTTPRequest(c.Request.Method, path, status, duration)
	}
}

// normalizePath normalizes URL paths for metrics by replacing dynamic segments
func normalizePath(path string) string {
	// Replace UUIDs with :id placeholder
	parts := strings.Split(path, "/")
	for i, part := range parts {
		// Check if part looks like a UUID (36 chars with dashes)
		if len(part) == 36 && strings.Count(part, "-") == 4 {
			parts[i] = ":id"
		}
	}
	return strings.Join(parts, "/")
}
