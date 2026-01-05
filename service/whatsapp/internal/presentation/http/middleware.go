package http

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
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

// CORSMiddleware handles CORS headers
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Accept, Authorization, X-Request-ID")
		c.Header("Access-Control-Expose-Headers", "X-Request-ID")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
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

// RateLimitMiddleware provides basic rate limiting (placeholder for more sophisticated implementation)
func RateLimitMiddleware(requestsPerSecond int) gin.HandlerFunc {
	// This is a simple placeholder. In production, use a proper rate limiter
	// like golang.org/x/time/rate or a Redis-based solution
	return func(c *gin.Context) {
		// For now, just pass through
		c.Next()
	}
}
