package http

import (
	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
)

// RouterConfig holds configuration for the router
type RouterConfig struct {
	// Debug enables debug mode
	Debug bool
	// EnableRequestLogging enables request body logging
	EnableRequestLogging bool
}

// DefaultRouterConfig returns the default router configuration
func DefaultRouterConfig() RouterConfig {
	return RouterConfig{
		Debug:                false,
		EnableRequestLogging: false,
	}
}

// NewRouter creates a new Gin router with all routes configured
func NewRouter(sessionUC *usecase.SessionUseCase, messageUC *usecase.MessageUseCase, config RouterConfig) *gin.Engine {
	// Set Gin mode
	if !config.Debug {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Apply global middleware
	router.Use(gin.Recovery())
	router.Use(ErrorHandlerMiddleware())
	router.Use(RequestIDMiddleware())
	router.Use(LoggingMiddleware())
	router.Use(CORSMiddleware())
	router.Use(ContentTypeMiddleware())

	// Optional request body logging
	if config.EnableRequestLogging {
		router.Use(RequestBodyLoggerMiddleware())
	}

	// Create handler
	handler := NewHandler(sessionUC, messageUC)

	// Health check routes (no auth required)
	router.GET("/health", handler.Health)
	router.GET("/ready", handler.Ready)

	// API routes
	api := router.Group("/api")
	{
		// Session routes
		sessions := api.Group("/sessions")
		{
			sessions.POST("", handler.CreateSession)
			sessions.GET("", handler.ListSessions)
			sessions.GET("/:id", handler.GetSession)
			sessions.DELETE("/:id", handler.DeleteSession)
		}

		// Message routes
		messages := api.Group("/messages")
		{
			messages.POST("", handler.SendMessage)
		}
	}

	return router
}

// NewRouterWithHandler creates a new Gin router with a pre-configured handler
func NewRouterWithHandler(handler *Handler, config RouterConfig) *gin.Engine {
	// Set Gin mode
	if !config.Debug {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Apply global middleware
	router.Use(gin.Recovery())
	router.Use(ErrorHandlerMiddleware())
	router.Use(RequestIDMiddleware())
	router.Use(LoggingMiddleware())
	router.Use(CORSMiddleware())
	router.Use(ContentTypeMiddleware())

	// Optional request body logging
	if config.EnableRequestLogging {
		router.Use(RequestBodyLoggerMiddleware())
	}

	// Health check routes (no auth required)
	router.GET("/health", handler.Health)
	router.GET("/ready", handler.Ready)

	// API routes
	api := router.Group("/api")
	{
		// Session routes
		sessions := api.Group("/sessions")
		{
			sessions.POST("", handler.CreateSession)
			sessions.GET("", handler.ListSessions)
			sessions.GET("/:id", handler.GetSession)
			sessions.DELETE("/:id", handler.DeleteSession)
		}

		// Message routes
		messages := api.Group("/messages")
		{
			messages.POST("", handler.SendMessage)
		}
	}

	return router
}
