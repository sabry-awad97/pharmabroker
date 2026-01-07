package infrastructure

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/health"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"go.uber.org/fx"
)

// Module provides all infrastructure layer dependencies
var Module = fx.Module("infrastructure",
	fx.Provide(
		NewInMemorySessionRepository,
		NewWhatsmeowClient,
		fx.Annotate(
			func(c *whatsapp.WhatsmeowClient) *whatsapp.WhatsmeowClient { return c },
			fx.As(new(repository.WhatsAppClient)),
		),
		fx.Annotate(
			func(c *whatsapp.WhatsmeowClient) *whatsapp.WhatsmeowClient { return c },
			fx.As(new(repository.GroupFetcher)),
		),
		NewGorillaEventPublisher,
		NewHealthCheckers,
		NewMediaUploader,
	),
)

// NewInMemorySessionRepository creates a new in-memory session repository
// Session state is stored in memory; whatsmeow's SQLite preserves auth for auto-reconnect
func NewInMemorySessionRepository() repository.SessionRepository {
	return persistence.NewInMemorySessionRepository()
}

// NewWhatsmeowClient creates a new WhatsApp client
func NewWhatsmeowClient(lc fx.Lifecycle, cfg *config.Config) (*whatsapp.WhatsmeowClient, error) {
	clientConfig := whatsapp.ClientConfig{
		DBPath:           cfg.WhatsApp.DBPath,
		QRTimeout:        cfg.WhatsApp.QRTimeout,
		ReconnectDelay:   cfg.WhatsApp.ReconnectDelay,
		MaxReconnects:    cfg.WhatsApp.MaxReconnects,
		MessageRateLimit: cfg.WhatsApp.MessageRateLimit,
	}

	client, err := whatsapp.NewWhatsmeowClient(context.Background(), clientConfig)
	if err != nil {
		return nil, err
	}

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			return client.Close()
		},
	})

	return client, nil
}

// NewGorillaEventPublisher creates a new WebSocket event publisher
func NewGorillaEventPublisher(lc fx.Lifecycle, cfg *config.Config) repository.EventPublisher {
	publisherConfig := websocket.PublisherConfig{
		URL:            cfg.WebSocket.URL,
		PingInterval:   cfg.WebSocket.PingInterval,
		PongTimeout:    cfg.WebSocket.PongTimeout,
		ReconnectDelay: cfg.WebSocket.ReconnectDelay,
		MaxReconnects:  cfg.WebSocket.MaxReconnects,
		QueueSize:      cfg.WebSocket.QueueSize,
	}

	publisher := websocket.NewGorillaEventPublisher(publisherConfig)

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			// Connect to API server in background (non-blocking)
			go func() {
				_ = publisher.Connect(context.Background())
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			return publisher.Disconnect(ctx)
		},
	})

	return publisher
}

// HealthCheckers holds all health checker instances
type HealthCheckers struct {
	WhatsAppClient *health.WhatsAppClientHealthChecker
	EventPublisher *health.EventPublisherHealthChecker
}

// NewHealthCheckers creates all health checkers
func NewHealthCheckers(
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
) *HealthCheckers {
	return &HealthCheckers{
		WhatsAppClient: health.NewWhatsAppClientHealthChecker(waClient),
		EventPublisher: health.NewEventPublisherHealthChecker(publisher),
	}
}

// NewMediaUploader creates a new media uploader
func NewMediaUploader(waClient *whatsapp.WhatsmeowClient, cfg *config.Config) repository.MediaUploader {
	// Create media constraints
	constraints := valueobject.DefaultMediaConstraints()

	// Create downloader config
	downloaderConfig := whatsapp.DefaultDownloaderConfig()

	// Create downloader
	downloader := whatsapp.NewHTTPMediaDownloader(downloaderConfig, constraints)

	// Create the media uploader
	mediaUploader := whatsapp.NewWhatsmeowMediaUploader(waClient, downloader, constraints)

	// Wire the media uploader to the client for sending media messages
	waClient.SetMediaUploader(mediaUploader)

	return mediaUploader
}
