package presentation

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
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

// NewHTTPHandler creates a new HTTP handler
func NewHTTPHandler(
	sessionUC *usecase.SessionUseCase,
	messageUC *usecase.MessageUseCase,
) *http.Handler {
	return http.NewHandler(sessionUC, messageUC)
}

// NewRouter creates a new Gin router with all routes configured
func NewRouter(
	sessionUC *usecase.SessionUseCase,
	messageUC *usecase.MessageUseCase,
	cfg *config.Config,
) *gin.Engine {
	routerConfig := http.RouterConfig{
		Debug:                cfg.Log.Level == "debug",
		EnableRequestLogging: cfg.Log.Level == "debug",
	}

	return http.NewRouter(sessionUC, messageUC, routerConfig)
}

// NewQRHandler creates a new QR WebSocket handler
func NewQRHandler(sessionUC *usecase.SessionUseCase, cfg *config.Config) *ws.QRHandler {
	qrConfig := ws.QRHandlerConfig{
		AuthTimeout:  cfg.WhatsApp.QRTimeout,
		WriteTimeout: 10 * time.Second,
		PingInterval: 30 * time.Second,
	}

	return ws.NewQRHandler(sessionUC, qrConfig)
}
