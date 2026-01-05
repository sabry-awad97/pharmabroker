package application

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"go.uber.org/fx"
)

// Module provides all application layer dependencies (use cases)
var Module = fx.Module("application",
	fx.Provide(
		NewSessionUseCase,
		NewMessageUseCase,
	),
)

// NewSessionUseCase creates a new session use case
func NewSessionUseCase(
	repo repository.SessionRepository,
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
) *usecase.SessionUseCase {
	return usecase.NewSessionUseCase(repo, waClient, publisher)
}

// NewMessageUseCase creates a new message use case with lifecycle management
func NewMessageUseCase(
	lc fx.Lifecycle,
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
	cfg *config.Config,
) *usecase.MessageUseCase {
	// Convert rate limit from per minute to per second
	rateLimitPerSecond := cfg.WhatsApp.MessageRateLimit / 60
	if rateLimitPerSecond < 1 {
		rateLimitPerSecond = 1
	}

	msgConfig := usecase.MessageUseCaseConfig{
		MaxRetries:         3,
		RateLimitPerSecond: rateLimitPerSecond,
		QueueSize:          1000,
	}

	uc := usecase.NewMessageUseCase(waClient, publisher, msgConfig)

	lc.Append(fx.Hook{
		OnStop: func(ctx context.Context) error {
			uc.Close()
			return nil
		},
	})

	return uc
}
