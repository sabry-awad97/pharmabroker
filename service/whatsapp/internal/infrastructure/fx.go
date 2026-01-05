package infrastructure

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"go.uber.org/fx"
)

// Module provides all infrastructure layer dependencies
var Module = fx.Module("infrastructure",
	fx.Provide(
		NewSQLiteSessionRepository,
		NewWhatsmeowClient,
		NewGorillaEventPublisher,
	),
)

// NewSQLiteSessionRepository creates a new SQLite session repository
func NewSQLiteSessionRepository(lc fx.Lifecycle, cfg *config.Config) (repository.SessionRepository, error) {
	dsn := cfg.SQLite.DSN()
	repo, err := persistence.NewSQLiteSessionRepository(dsn)
	if err != nil {
		return nil, err
	}

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			return repo.Close()
		},
	})

	return repo, nil
}

// NewWhatsmeowClient creates a new WhatsApp client
func NewWhatsmeowClient(lc fx.Lifecycle, cfg *config.Config) (repository.WhatsAppClient, error) {
	clientConfig := whatsapp.ClientConfig{
		DBPath:           cfg.SQLite.Path,
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
