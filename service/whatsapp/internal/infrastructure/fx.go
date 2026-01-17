package infrastructure

import (
	"context"
	"log"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
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
		NewEventHub,
		NewHealthCheckers,
		NewMediaUploader,
	),
	// Wire EventHub to WhatsApp client events
	fx.Invoke(WireEventHubToWhatsAppClient),
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
			log.Println("🛑 Shutting down WhatsApp client...")

			// Close all WhatsApp connections gracefully
			if err := client.Close(); err != nil {
				log.Printf("⚠️  WhatsApp client shutdown error: %v", err)
				return err
			}

			log.Println("✅ WhatsApp client stopped gracefully")
			return nil
		},
	})

	return client, nil
}

// NewGorillaEventPublisher creates a new WebSocket event publisher
func NewGorillaEventPublisher(lc fx.Lifecycle, cfg *config.Config) repository.EventPublisher {
	publisherConfig := websocket.PublisherConfig{
		URL:            cfg.WebSocket.URL,
		APIKey:         cfg.WebSocket.APIKey,
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
			log.Println("🛑 Shutting down WebSocket publisher...")

			// Log queue status before shutdown
			queueSize := publisher.QueueSize()
			if queueSize > 0 {
				log.Printf("📤 Flushing %d queued events before shutdown...", queueSize)
			}

			// Disconnect will flush the queue automatically
			if err := publisher.Disconnect(ctx); err != nil {
				log.Printf("⚠️  WebSocket publisher shutdown error: %v", err)
				return err
			}

			log.Println("✅ WebSocket publisher stopped gracefully")
			return nil
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

// WireEventHubToWhatsAppClient connects the EventHub and EventPublisher to receive events from the WhatsApp client
// This enables real-time event broadcasting to connected WebSocket clients AND the API server
func WireEventHubToWhatsAppClient(
	waClient *whatsapp.WhatsmeowClient,
	hub *websocket.EventHub,
	publisher repository.EventPublisher,
) {
	// Register an event handler that broadcasts events to the EventHub (for frontend WebSocket clients)
	waClient.RegisterEventHandler(func(event *entity.Event) {
		// Broadcast the event to all connected WebSocket clients
		hub.Broadcast(event)
	})

	// Register an event handler that publishes events to the API server via WebSocket
	waClient.RegisterEventHandler(func(event *entity.Event) {
		// Publish the event to the API server (non-blocking)
		go func() {
			ctx := context.Background()
			if err := publisher.Publish(ctx, event); err != nil {
				// Log error but don't block (events are queued internally)
			}
		}()
	})
}

// NewEventHub creates a new WebSocket event hub for broadcasting events to connected clients
func NewEventHub(lc fx.Lifecycle, cfg *config.Config) *websocket.EventHub {
	hubConfig := websocket.EventHubConfig{
		APIKey:       cfg.WebSocket.APIKey,
		PingInterval: cfg.WebSocket.PingInterval,
		WriteTimeout: 10 * time.Second,
		AuthTimeout:  10 * time.Second,
	}

	hub := websocket.NewEventHub(hubConfig)

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			// Start event hub in background
			go hub.Run()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			log.Println("🛑 Shutting down WebSocket event hub...")

			// Log connected clients
			clientCount := hub.ClientCount()
			if clientCount > 0 {
				log.Printf("📡 Closing %d WebSocket client connections...", clientCount)
			}

			// Stop the hub (will close all client connections)
			hub.Stop()

			log.Println("✅ WebSocket event hub stopped gracefully")
			return nil
		},
	})

	return hub
}
