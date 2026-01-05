package whatsapp

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// ClientConfig holds configuration for the WhatsApp client
type ClientConfig struct {
	DBPath           string
	QRTimeout        time.Duration
	ReconnectDelay   time.Duration
	MaxReconnects    int
	MessageRateLimit int
}

// DefaultClientConfig returns default configuration
func DefaultClientConfig() ClientConfig {
	return ClientConfig{
		DBPath:           "/data/whatsapp.db",
		QRTimeout:        2 * time.Minute,
		ReconnectDelay:   5 * time.Second,
		MaxReconnects:    10,
		MessageRateLimit: 30,
	}
}

// WhatsmeowClient implements WhatsAppClient using whatsmeow
type WhatsmeowClient struct {
	config    ClientConfig
	container *sqlstore.Container
	clients   map[string]*whatsmeow.Client
	mu        sync.RWMutex
	handlers  []repository.EventHandler
	logger    waLog.Logger
}

// NewWhatsmeowClient creates a new WhatsApp client
func NewWhatsmeowClient(ctx context.Context, config ClientConfig) (*WhatsmeowClient, error) {
	// Create a logger
	logger := waLog.Stdout("WhatsApp", "INFO", true)

	// Create the SQL store container with foreign keys enabled (required by whatsmeow)
	// Using modernc.org/sqlite pragma syntax: _pragma=foreign_keys(1)
	dsn := config.DBPath + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	container, err := sqlstore.New(ctx, "sqlite", dsn, logger)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to create whatsmeow store")
	}

	return &WhatsmeowClient{
		config:    config,
		container: container,
		clients:   make(map[string]*whatsmeow.Client),
		handlers:  make([]repository.EventHandler, 0),
		logger:    logger,
	}, nil
}

// Connect establishes a connection for the given session
func (c *WhatsmeowClient) Connect(ctx context.Context, sessionID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Check if already connected
	if client, exists := c.clients[sessionID]; exists && client.IsConnected() {
		return nil
	}

	// Get or create device store
	device, err := c.getOrCreateDevice(ctx, sessionID)
	if err != nil {
		return err
	}

	// Create client
	client := whatsmeow.NewClient(device, c.logger)

	// Register event handler
	client.AddEventHandler(func(evt interface{}) {
		c.handleEvent(sessionID, evt)
	})

	// Connect with retry
	err = c.connectWithRetry(ctx, client)
	if err != nil {
		return err
	}

	c.clients[sessionID] = client
	return nil
}

// connectWithRetry implements exponential backoff retry for connections
func (c *WhatsmeowClient) connectWithRetry(ctx context.Context, client *whatsmeow.Client) error {
	var lastErr error
	delay := c.config.ReconnectDelay

	for attempt := 0; attempt <= c.config.MaxReconnects; attempt++ {
		select {
		case <-ctx.Done():
			return errors.ErrConnectionFailed.WithCause(ctx.Err())
		default:
		}

		err := client.Connect()
		if err == nil {
			return nil
		}

		lastErr = err

		if attempt < c.config.MaxReconnects {
			// Wait with exponential backoff
			select {
			case <-ctx.Done():
				return errors.ErrConnectionFailed.WithCause(ctx.Err())
			case <-time.After(delay):
				delay = CalculateBackoff(delay, c.config.MaxReconnects)
			}
		}
	}

	return errors.ErrConnectionFailed.WithCause(lastErr).WithMessage(
		fmt.Sprintf("failed to connect after %d attempts", c.config.MaxReconnects+1))
}

// Disconnect closes the connection for the given session
func (c *WhatsmeowClient) Disconnect(ctx context.Context, sessionID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	client, exists := c.clients[sessionID]
	if !exists {
		return errors.ErrSessionNotFound
	}

	client.Disconnect()
	delete(c.clients, sessionID)
	return nil
}

// SendMessage sends a message through WhatsApp
func (c *WhatsmeowClient) SendMessage(ctx context.Context, msg *entity.Message) error {
	c.mu.RLock()
	client, exists := c.clients[msg.SessionID]
	c.mu.RUnlock()

	if !exists {
		return errors.ErrSessionNotFound
	}

	if !client.IsConnected() {
		return errors.ErrDisconnected
	}

	// Parse recipient JID
	recipientJID, err := types.ParseJID(string(msg.To) + "@s.whatsapp.net")
	if err != nil {
		return errors.ErrInvalidPhoneNumber.WithCause(err)
	}

	// Build message based on type
	waMsg, err := buildWhatsAppMessage(msg)
	if err != nil {
		return err
	}

	// Send message with retry
	_, err = c.sendWithRetry(ctx, client, recipientJID, waMsg)
	if err != nil {
		return errors.ErrMessageSendFailed.WithCause(err)
	}

	return nil
}

// sendWithRetry sends a message with exponential backoff retry
func (c *WhatsmeowClient) sendWithRetry(ctx context.Context, client *whatsmeow.Client, to types.JID, msg *waProto.Message) (whatsmeow.SendResponse, error) {
	var lastErr error
	delay := c.config.ReconnectDelay
	maxAttempts := 3 // Max 3 attempts for message sending

	for attempt := 0; attempt < maxAttempts; attempt++ {
		select {
		case <-ctx.Done():
			return whatsmeow.SendResponse{}, ctx.Err()
		default:
		}

		resp, err := client.SendMessage(ctx, to, msg)
		if err == nil {
			return resp, nil
		}

		lastErr = err

		if attempt < maxAttempts-1 {
			select {
			case <-ctx.Done():
				return whatsmeow.SendResponse{}, ctx.Err()
			case <-time.After(delay):
				delay = CalculateBackoff(delay, maxAttempts)
			}
		}
	}

	return whatsmeow.SendResponse{}, lastErr
}

// GetQRChannel returns a channel that receives QR code events for authentication
func (c *WhatsmeowClient) GetQRChannel(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Get or create device store
	device, err := c.getOrCreateDevice(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	// Create client
	client := whatsmeow.NewClient(device, c.logger)

	// Create QR event channel
	qrChan := make(chan repository.QREvent, 10)

	// Register event handler for this session
	client.AddEventHandler(func(evt interface{}) {
		c.handleEvent(sessionID, evt)
	})

	// Start QR authentication in goroutine
	go func() {
		defer close(qrChan)

		// Get QR channel from whatsmeow
		waQRChan, err := client.GetQRChannel(ctx)
		if err != nil {
			qrChan <- repository.QREvent{
				Type:    "error",
				Message: err.Error(),
			}
			return
		}

		// Set timeout
		timeout := time.NewTimer(c.config.QRTimeout)
		defer timeout.Stop()

		// Connect to start QR generation
		err = client.Connect()
		if err != nil {
			qrChan <- repository.QREvent{
				Type:    "error",
				Message: err.Error(),
			}
			return
		}

		for {
			select {
			case <-ctx.Done():
				client.Disconnect()
				return

			case <-timeout.C:
				qrChan <- repository.QREvent{
					Type:    "timeout",
					Message: "QR authentication timed out",
				}
				client.Disconnect()
				return

			case evt, ok := <-waQRChan:
				if !ok {
					return
				}

				switch evt.Event {
				case "code":
					// Encode QR code as base64 PNG
					qrBase64, err := encodeQRToBase64(evt.Code)
					if err != nil {
						qrChan <- repository.QREvent{
							Type:    "error",
							Message: "failed to encode QR code",
						}
						continue
					}
					qrChan <- repository.QREvent{
						Type: "qr",
						Data: qrBase64,
					}

				case "success":
					// Store client
					c.mu.Lock()
					c.clients[sessionID] = client
					c.mu.Unlock()

					qrChan <- repository.QREvent{
						Type: "authenticated",
						Data: client.Store.ID.String(),
					}
					return

				case "timeout":
					qrChan <- repository.QREvent{
						Type:    "timeout",
						Message: "QR code expired",
					}
					// New QR will be generated automatically
				}
			}
		}
	}()

	return qrChan, nil
}

// RegisterEventHandler registers a handler for WhatsApp events
func (c *WhatsmeowClient) RegisterEventHandler(handler repository.EventHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers = append(c.handlers, handler)
}

// IsConnected checks if a session is currently connected
func (c *WhatsmeowClient) IsConnected(sessionID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	client, exists := c.clients[sessionID]
	if !exists {
		return false
	}
	return client.IsConnected()
}

// GetSessionJID returns the JID for a connected session
func (c *WhatsmeowClient) GetSessionJID(sessionID string) (string, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	client, exists := c.clients[sessionID]
	if !exists {
		return "", errors.ErrSessionNotFound
	}

	if client.Store.ID == nil {
		return "", errors.ErrSessionInvalid
	}

	return client.Store.ID.String(), nil
}

// Close closes all connections and the container
func (c *WhatsmeowClient) Close() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	for _, client := range c.clients {
		client.Disconnect()
	}
	c.clients = make(map[string]*whatsmeow.Client)

	return nil
}

// getOrCreateDevice gets or creates a device store for the session
func (c *WhatsmeowClient) getOrCreateDevice(ctx context.Context, sessionID string) (*store.Device, error) {
	// Try to get existing device
	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	// Look for device with matching session ID in JID
	for _, device := range devices {
		if device.ID != nil && device.ID.User == sessionID {
			return device, nil
		}
	}

	// Create new device
	device := c.container.NewDevice()
	return device, nil
}

// handleEvent processes WhatsApp events and dispatches to handlers
func (c *WhatsmeowClient) handleEvent(sessionID string, evt interface{}) {
	var event *entity.Event
	var err error

	switch v := evt.(type) {
	case *events.Message:
		event, err = c.handleMessageEvent(sessionID, v)
	case *events.Connected:
		event, err = entity.NewEventWithPayload(
			generateEventID(),
			entity.EventTypeConnected,
			sessionID,
			map[string]string{"status": "connected"},
		)
	case *events.Disconnected:
		event, err = entity.NewEventWithPayload(
			generateEventID(),
			entity.EventTypeDisconnected,
			sessionID,
			map[string]string{"status": "disconnected"},
		)
	case *events.LoggedOut:
		event, err = entity.NewEventWithPayload(
			generateEventID(),
			entity.EventTypeLoggedOut,
			sessionID,
			map[string]string{"reason": "logged_out"},
		)
		// Remove client from map
		c.mu.Lock()
		delete(c.clients, sessionID)
		c.mu.Unlock()
	case *events.Receipt:
		event, err = c.handleReceiptEvent(sessionID, v)
	default:
		// Ignore other events
		return
	}

	if err != nil || event == nil {
		return
	}

	// Dispatch to all handlers
	c.mu.RLock()
	handlers := make([]repository.EventHandler, len(c.handlers))
	copy(handlers, c.handlers)
	c.mu.RUnlock()

	for _, handler := range handlers {
		handler(event)
	}
}

// handleMessageEvent converts a WhatsApp message event to a domain event
func (c *WhatsmeowClient) handleMessageEvent(sessionID string, msg *events.Message) (*entity.Event, error) {
	payload := map[string]interface{}{
		"message_id": msg.Info.ID,
		"from":       msg.Info.Sender.String(),
		"timestamp":  msg.Info.Timestamp,
		"push_name":  msg.Info.PushName,
	}

	// Extract message content
	if msg.Message.GetConversation() != "" {
		payload["text"] = msg.Message.GetConversation()
		payload["type"] = "text"
	} else if msg.Message.GetExtendedTextMessage() != nil {
		payload["text"] = msg.Message.GetExtendedTextMessage().GetText()
		payload["type"] = "text"
	} else if msg.Message.GetImageMessage() != nil {
		payload["type"] = "image"
		payload["caption"] = msg.Message.GetImageMessage().GetCaption()
	} else if msg.Message.GetDocumentMessage() != nil {
		payload["type"] = "document"
		payload["filename"] = msg.Message.GetDocumentMessage().GetFileName()
	}

	return entity.NewEventWithPayload(
		generateEventID(),
		entity.EventTypeMessageReceived,
		sessionID,
		payload,
	)
}

// handleReceiptEvent converts a WhatsApp receipt event to a domain event
func (c *WhatsmeowClient) handleReceiptEvent(sessionID string, receipt *events.Receipt) (*entity.Event, error) {
	var eventType entity.EventType

	switch receipt.Type {
	case types.ReceiptTypeDelivered:
		eventType = entity.EventTypeMessageDelivered
	case types.ReceiptTypeRead:
		eventType = entity.EventTypeMessageRead
	default:
		return nil, nil // Ignore other receipt types
	}

	payload := map[string]interface{}{
		"message_ids": receipt.MessageIDs,
		"from":        receipt.MessageSource.Sender.String(),
		"timestamp":   receipt.Timestamp,
	}

	return entity.NewEventWithPayload(
		generateEventID(),
		eventType,
		sessionID,
		payload,
	)
}
