package presentation

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
	infraWs "github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/pharmabroker/whatsapp/internal/presentation/ws"
	"go.uber.org/fx"
)

// Module provides all presentation layer dependencies
var Module = fx.Module("presentation",
	fx.Provide(
		NewHTTPHandler,
		NewRouter,
		NewQRHandler,
		NewEventHub,
		NewEventHandler,
	),
)

// NewHTTPHandler creates a new HTTP handler with health use case
func NewHTTPHandler(
	sessionUC *usecase.SessionUseCase,
	messageUC *usecase.MessageUseCase,
	healthUC *usecase.HealthUseCase,
	groupsUC *usecase.GroupsUseCase,
) *http.Handler {
	return http.NewHandler(sessionUC, messageUC, healthUC, groupsUC)
}

// NewRouter creates a new Gin router with all routes configured
func NewRouter(
	handler *http.Handler,
	cfg *config.Config,
) *gin.Engine {
	// Create rate limiter if enabled
	var rateLimiter *ratelimit.Limiter
	if cfg.RateLimit.Enabled {
		rateLimiterConfig := ratelimit.Config{
			Enabled:           cfg.RateLimit.Enabled,
			RequestsPerSecond: cfg.RateLimit.RequestsPerSecond,
			BurstSize:         cfg.RateLimit.BurstSize,
			ByIP:              cfg.RateLimit.ByIP,
			ByAPIKey:          cfg.RateLimit.ByAPIKey,
			CleanupInterval:   cfg.RateLimit.CleanupInterval,
			MaxAge:            cfg.RateLimit.MaxAge,
		}
		rateLimiter = ratelimit.NewLimiter(rateLimiterConfig)
	}

	routerConfig := http.RouterConfig{
		Debug:                cfg.Log.Level == "debug",
		EnableRequestLogging: cfg.Log.Level == "debug",
		RateLimiter:          rateLimiter,
		CORSConfig:           &cfg.CORS,
		APIKeyConfig:         &cfg.APIKey,
	}

	return http.NewRouter(handler, routerConfig)
}

// NewQRHandler creates a new QR WebSocket handler
func NewQRHandler(sessionUC *usecase.SessionUseCase, cfg *config.Config) *ws.QRHandler {
	qrConfig := ws.QRHandlerConfig{
		AuthTimeout:    cfg.WhatsApp.QRTimeout,
		WriteTimeout:   10 * time.Second,
		PingInterval:   30 * time.Second,
		AllowedOrigins: cfg.CORS.AllowedOrigins,
	}

	return ws.NewQRHandler(sessionUC, qrConfig)
}

// NewEventHub creates a new EventHub for WebSocket event broadcasting
func NewEventHub(lc fx.Lifecycle, cfg *config.Config) *infraWs.EventHub {
	// Get API key from config - use the first key if available
	apiKey := ""
	if cfg.APIKey.Enabled && len(cfg.APIKey.Keys) > 0 {
		apiKey = cfg.APIKey.Keys[0]
	}

	hubConfig := infraWs.EventHubConfig{
		APIKey:       apiKey,
		PingInterval: cfg.WebSocket.PingInterval,
		WriteTimeout: cfg.WebSocket.PongTimeout,
		AuthTimeout:  10 * time.Second,
	}

	hub := infraWs.NewEventHub(hubConfig)

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			// Start the event hub's main loop
			go hub.Run()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			// Stop the event hub
			hub.Stop()
			return nil
		},
	})

	return hub
}

// NewEventHandler creates a new Event WebSocket handler
func NewEventHandler(hub *infraWs.EventHub, cfg *config.Config) *ws.EventHandler {
	eventConfig := ws.EventHandlerConfig{
		PingInterval:   cfg.WebSocket.PingInterval,
		WriteTimeout:   cfg.WebSocket.PongTimeout,
		AuthTimeout:    10 * time.Second,
		AllowedOrigins: cfg.CORS.AllowedOrigins,
	}

	return ws.NewEventHandler(hub, eventConfig)
}
