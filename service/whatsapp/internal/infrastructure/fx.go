package infrastructure

import (
	"context"
	"database/sql"

	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/health"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"go.uber.org/fx"
)

// SQLiteDB is a wrapper type for the database connection to use with fx
type SQLiteDB struct {
	DB *sql.DB
}

// Module provides all infrastructure layer dependencies
var Module = fx.Module("infrastructure",
	fx.Provide(
		NewSQLiteSessionRepository,
		NewWhatsmeowClient,
		NewGorillaEventPublisher,
		NewHealthCheckers,
	),
)

// NewSQLiteSessionRepository creates a new SQLite session repository
func NewSQLiteSessionRepository(lc fx.Lifecycle, cfg *config.Config) (repository.SessionRepository, *SQLiteDB, error) {
	dsn := cfg.SQLite.DSN()
	repo, err := persistence.NewSQLiteSessionRepository(dsn)
	if err != nil {
		return nil, nil, err
	}

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			return repo.Close()
		},
	})

	return repo, &SQLiteDB{DB: repo.DB()}, nil
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

// HealthCheckers holds all health checker instances
type HealthCheckers struct {
	SQLite         *health.SQLiteHealthChecker
	WhatsAppClient *health.WhatsAppClientHealthChecker
	EventPublisher *health.EventPublisherHealthChecker
}

// NewHealthCheckers creates all health checkers
func NewHealthCheckers(
	sqliteDB *SQLiteDB,
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
) *HealthCheckers {
	return &HealthCheckers{
		SQLite:         health.NewSQLiteHealthChecker(sqliteDB.DB),
		WhatsAppClient: health.NewWhatsAppClientHealthChecker(waClient),
		EventPublisher: health.NewEventPublisherHealthChecker(publisher),
	}
}
