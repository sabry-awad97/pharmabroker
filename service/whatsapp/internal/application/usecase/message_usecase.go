package usecase

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// MessageUseCaseConfig holds configuration for the MessageUseCase
type MessageUseCaseConfig struct {
	// MaxRetries is the maximum number of retry attempts for failed messages
	MaxRetries int
	// RateLimitPerSecond is the maximum number of messages per second
	RateLimitPerSecond int
	// QueueSize is the maximum size of the message queue
	QueueSize int
}

// DefaultMessageUseCaseConfig returns the default configuration
func DefaultMessageUseCaseConfig() MessageUseCaseConfig {
	return MessageUseCaseConfig{
		MaxRetries:         3,
		RateLimitPerSecond: 10,
		QueueSize:          1000,
	}
}

// MessageUseCase handles message business logic
type MessageUseCase struct {
	waClient  repository.WhatsAppClient
	publisher repository.EventPublisher
	config    MessageUseCaseConfig

	// Rate limiting
	mu            sync.Mutex
	lastSendTime  time.Time
	sendCount     int
	rateLimitChan chan struct{}

	// Message queue for rate limiting
	queue chan *entity.Message
	done  chan struct{}
}

// NewMessageUseCase creates a new MessageUseCase
func NewMessageUseCase(
	waClient repository.WhatsAppClient,
	publisher repository.EventPublisher,
	config MessageUseCaseConfig,
) *MessageUseCase {
	uc := &MessageUseCase{
		waClient:      waClient,
		publisher:     publisher,
		config:        config,
		rateLimitChan: make(chan struct{}, config.RateLimitPerSecond),
		queue:         make(chan *entity.Message, config.QueueSize),
		done:          make(chan struct{}),
	}

	// Start the message processor
	go uc.processQueue()

	return uc
}

// SendMessage sends a WhatsApp message
func (uc *MessageUseCase) SendMessage(ctx context.Context, req dto.SendMessageRequest) (*entity.Message, error) {
	// Validate phone number
	_, err := valueobject.NewPhoneNumber(req.To)
	if err != nil {
		return nil, errors.ErrInvalidPhoneNumber
	}

	// Create message entity
	msgID := uuid.New().String()
	content := uc.buildMessageContent(req)
	msgType := uc.getMessageType(req.Type)

	msg := entity.NewMessage(
		msgID,
		req.SessionID,
		"", // From will be set by the WhatsApp client
		req.To,
		content,
		msgType,
	)

	// Enqueue the message for rate-limited sending
	select {
	case uc.queue <- msg:
		// Message queued successfully
	default:
		return nil, errors.ErrMessageSendFailed.WithMessage("message queue is full")
	}

	// Emit pending status event
	uc.emitMessageStatusEvent(ctx, msg, entity.MessageStatusPending)

	return msg, nil
}

// SendMessageSync sends a message synchronously (bypassing the queue)
func (uc *MessageUseCase) SendMessageSync(ctx context.Context, req dto.SendMessageRequest) (*entity.Message, error) {
	// Validate phone number
	_, err := valueobject.NewPhoneNumber(req.To)
	if err != nil {
		return nil, errors.ErrInvalidPhoneNumber
	}

	// Create message entity
	msgID := uuid.New().String()
	content := uc.buildMessageContent(req)
	msgType := uc.getMessageType(req.Type)

	msg := entity.NewMessage(
		msgID,
		req.SessionID,
		"",
		req.To,
		content,
		msgType,
	)

	// Apply rate limiting
	if err := uc.waitForRateLimit(ctx); err != nil {
		return nil, err
	}

	// Send the message
	if err := uc.sendWithRetry(ctx, msg); err != nil {
		return nil, err
	}

	return msg, nil
}

// HandleIncomingMessage processes an incoming WhatsApp message
func (uc *MessageUseCase) HandleIncomingMessage(ctx context.Context, msg *entity.Message) error {
	if msg == nil {
		return errors.ErrInvalidInput.WithMessage("message cannot be nil")
	}

	// Emit message received event
	uc.emitMessageStatusEvent(ctx, msg, entity.MessageStatusDelivered)

	// Publish the incoming message event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			entity.EventTypeMessageReceived,
			msg.SessionID,
			msg,
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return nil
}

// HandleMessageStatusUpdate handles status updates for sent messages
func (uc *MessageUseCase) HandleMessageStatusUpdate(ctx context.Context, msgID, sessionID string, status entity.MessageStatus) error {
	// Determine the event type based on status
	var eventType entity.EventType
	switch status {
	case entity.MessageStatusSent:
		eventType = entity.EventTypeMessageSent
	case entity.MessageStatusDelivered:
		eventType = entity.EventTypeMessageDelivered
	case entity.MessageStatusRead:
		eventType = entity.EventTypeMessageRead
	case entity.MessageStatusFailed:
		eventType = entity.EventTypeMessageFailed
	default:
		return nil // Ignore unknown statuses
	}

	// Publish the status event
	if uc.publisher != nil && uc.publisher.IsConnected() {
		event, err := entity.NewEventWithPayload(
			uuid.New().String(),
			eventType,
			sessionID,
			map[string]interface{}{
				"message_id": msgID,
				"status":     status.String(),
			},
		)
		if err == nil {
			_ = uc.publisher.Publish(ctx, event)
		}
	}

	return nil
}

// Close stops the message processor
func (uc *MessageUseCase) Close() {
	close(uc.done)
}

// QueueSize returns the current number of messages in the queue
func (uc *MessageUseCase) QueueSize() int {
	return len(uc.queue)
}

// processQueue processes messages from the queue with rate limiting
func (uc *MessageUseCase) processQueue() {
	for {
		select {
		case <-uc.done:
			return
		case msg := <-uc.queue:
			ctx := context.Background()

			// Apply rate limiting
			_ = uc.waitForRateLimit(ctx)

			// Send with retry
			if err := uc.sendWithRetry(ctx, msg); err != nil {
				// Message failed after all retries
				msg.SetStatus(entity.MessageStatusFailed)
				uc.emitMessageStatusEvent(ctx, msg, entity.MessageStatusFailed)
			}
		}
	}
}

// sendWithRetry sends a message with exponential backoff retry
func (uc *MessageUseCase) sendWithRetry(ctx context.Context, msg *entity.Message) error {
	var lastErr error

	for attempt := 0; attempt < uc.config.MaxRetries; attempt++ {
		if uc.waClient == nil {
			lastErr = errors.ErrConnectionFailed.WithMessage("WhatsApp client not available")
			continue
		}

		err := uc.waClient.SendMessage(ctx, msg)
		if err == nil {
			// Success
			msg.SetStatus(entity.MessageStatusSent)
			uc.emitMessageStatusEvent(ctx, msg, entity.MessageStatusSent)
			return nil
		}

		lastErr = err

		// Exponential backoff: 1s, 2s, 4s
		backoff := time.Duration(1<<attempt) * time.Second
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(backoff):
			// Continue to next attempt
		}
	}

	return errors.ErrMessageSendFailed.WithCause(lastErr)
}

// waitForRateLimit waits until sending is allowed under rate limiting
func (uc *MessageUseCase) waitForRateLimit(ctx context.Context) error {
	uc.mu.Lock()
	defer uc.mu.Unlock()

	now := time.Now()

	// Reset counter if a second has passed
	if now.Sub(uc.lastSendTime) >= time.Second {
		uc.sendCount = 0
		uc.lastSendTime = now
	}

	// Check if we've exceeded the rate limit
	if uc.sendCount >= uc.config.RateLimitPerSecond {
		// Wait until the next second
		waitTime := time.Second - now.Sub(uc.lastSendTime)
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(waitTime):
			uc.sendCount = 0
			uc.lastSendTime = time.Now()
		}
	}

	uc.sendCount++
	return nil
}

// emitMessageStatusEvent emits a message status event
func (uc *MessageUseCase) emitMessageStatusEvent(ctx context.Context, msg *entity.Message, status entity.MessageStatus) {
	if uc.publisher == nil || !uc.publisher.IsConnected() {
		return
	}

	var eventType entity.EventType
	switch status {
	case entity.MessageStatusPending:
		return // Don't emit pending status
	case entity.MessageStatusSent:
		eventType = entity.EventTypeMessageSent
	case entity.MessageStatusDelivered:
		eventType = entity.EventTypeMessageDelivered
	case entity.MessageStatusRead:
		eventType = entity.EventTypeMessageRead
	case entity.MessageStatusFailed:
		eventType = entity.EventTypeMessageFailed
	default:
		return
	}

	event, err := entity.NewEventWithPayload(
		uuid.New().String(),
		eventType,
		msg.SessionID,
		map[string]interface{}{
			"message_id": msg.ID,
			"to":         msg.To,
			"type":       msg.Type.String(),
			"status":     status.String(),
			"timestamp":  msg.Timestamp,
		},
	)
	if err == nil {
		_ = uc.publisher.Publish(ctx, event)
	}
}

// buildMessageContent builds MessageContent from the request
func (uc *MessageUseCase) buildMessageContent(req dto.SendMessageRequest) entity.MessageContent {
	content := entity.MessageContent{}

	if req.Content.Text != nil {
		content.Text = req.Content.Text
	}
	if req.Content.ImageURL != nil {
		content.ImageURL = req.Content.ImageURL
	}
	if req.Content.DocURL != nil {
		content.DocURL = req.Content.DocURL
	}
	if req.Content.Caption != nil {
		content.Caption = req.Content.Caption
	}

	return content
}

// getMessageType converts string type to MessageType
func (uc *MessageUseCase) getMessageType(typeStr string) entity.MessageType {
	switch typeStr {
	case "text":
		return entity.MessageTypeText
	case "image":
		return entity.MessageTypeImage
	case "document":
		return entity.MessageTypeDocument
	default:
		return entity.MessageTypeText
	}
}
