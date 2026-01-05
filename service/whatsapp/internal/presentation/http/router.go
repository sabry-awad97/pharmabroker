package http

import (
	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/metrics"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// RouterConfig holds configuration for the router
type RouterConfig struct {
	// Debug enables debug mode
	Debug bool
	// EnableRequestLogging enables request body logging
	EnableRequestLogging bool
	// RateLimiter is the rate limiter instance (optional)
	RateLimiter *ratelimit.Limiter
	// CORSConfig is the CORS configuration (optional, uses defaults if nil)
	CORSConfig *config.CORSConfig
	// APIKeyConfig is the API key authentication configuration (optional)
	APIKeyConfig *config.APIKeyConfig
	// Metrics is the metrics instance (optional)
	Metrics *metrics.Metrics
	// MetricsConfig is the metrics configuration (optional)
	MetricsConfig *config.MetricsConfig
}

// DefaultRouterConfig returns the default router configuration
func DefaultRouterConfig() RouterConfig {
	return RouterConfig{
		Debug:                false,
		EnableRequestLogging: false,
		RateLimiter:          nil,
		CORSConfig:           nil,
		APIKeyConfig:         nil,
		Metrics:              nil,
		MetricsConfig:        nil,
	}
}

// setupRouter creates and configures a Gin router with middleware
func setupRouter(routerConfig RouterConfig) *gin.Engine {
	if !routerConfig.Debug {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Apply global middleware
	router.Use(gin.Recovery())
	router.Use(ErrorHandlerMiddleware())
	router.Use(RequestIDMiddleware())
	router.Use(LoggingMiddleware())

	// Apply CORS middleware
	if routerConfig.CORSConfig != nil {
		router.Use(CORSMiddlewareWithConfig(*routerConfig.CORSConfig))
	} else {
		router.Use(CORSMiddlewareWithConfig(config.CORSConfig{}))
	}

	router.Use(ContentTypeMiddleware())

	// Apply metrics middleware if configured
	if routerConfig.Metrics != nil {
		router.Use(MetricsMiddleware(routerConfig.Metrics))
	}

	// Apply rate limiting if configured
	if routerConfig.RateLimiter != nil {
		router.Use(RateLimitMiddleware(routerConfig.RateLimiter))
	}

	// Optional request body logging
	if routerConfig.EnableRequestLogging {
		router.Use(RequestBodyLoggerMiddleware())
	}

	return router
}

// registerRoutes registers all routes on the router
func registerRoutes(router *gin.Engine, handler *Handler, routerConfig RouterConfig) {
	// Health check routes (no auth required)
	router.GET("/health", handler.Health)
	router.GET("/ready", handler.Ready)

	// Metrics endpoint (no auth required)
	if routerConfig.MetricsConfig != nil && routerConfig.MetricsConfig.Enabled {
		metricsPath := routerConfig.MetricsConfig.Path
		if metricsPath == "" {
			metricsPath = "/metrics"
		}
		router.GET(metricsPath, gin.WrapH(promhttp.Handler()))
	}

	// API routes
	api := router.Group("/api")

	// Apply API key authentication to API routes if configured
	if routerConfig.APIKeyConfig != nil && routerConfig.APIKeyConfig.Enabled {
		api.Use(APIKeyMiddleware(*routerConfig.APIKeyConfig))
	}

	// Session routes
	sessions := api.Group("/sessions")
	sessions.POST("", handler.CreateSession)
	sessions.GET("", handler.ListSessions)
	sessions.GET("/:id", handler.GetSession)
	sessions.DELETE("/:id", handler.DeleteSession)

	// Message routes
	messages := api.Group("/messages")
	messages.POST("", handler.SendMessage)
}

// NewRouter creates a new Gin router with all routes configured
func NewRouter(sessionUC *usecase.SessionUseCase, messageUC *usecase.MessageUseCase, routerConfig RouterConfig) *gin.Engine {
	router := setupRouter(routerConfig)
	handler := NewHandler(sessionUC, messageUC)
	registerRoutes(router, handler, routerConfig)
	return router
}

// NewRouterWithHandler creates a new Gin router with a pre-configured handler
func NewRouterWithHandler(handler *Handler, routerConfig RouterConfig) *gin.Engine {
	router := setupRouter(routerConfig)
	registerRoutes(router, handler, routerConfig)
	return router
}
