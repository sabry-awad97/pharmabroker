package presentation

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/ratelimit"
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
	),
)

// NewHTTPHandler creates a new HTTP handler with health use case
func NewHTTPHandler(
	sessionUC *usecase.SessionUseCase,
	messageUC *usecase.MessageUseCase,
	healthUC *usecase.HealthUseCase,
) *http.Handler {
	return http.NewHandlerWithHealth(sessionUC, messageUC, healthUC)
}

// NewRouter creates a new Gin router with all routes configured
func NewRouter(
	sessionUC *usecase.SessionUseCase,
	messageUC *usecase.MessageUseCase,
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

	return http.NewRouter(sessionUC, messageUC, routerConfig)
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
