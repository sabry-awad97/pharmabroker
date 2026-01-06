package whatsapp

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"go.mau.fi/whatsmeow"
	waCompanionReg "go.mau.fi/whatsmeow/proto/waCompanionReg"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"

	_ "modernc.org/sqlite" // SQLite driver for whatsmeow store
)

// ClientConfig holds configuration for the WhatsApp client
type ClientConfig struct {
	DBPath           string
	QRTimeout        time.Duration
	ReconnectDelay   time.Duration
	MaxReconnects    int
	MessageRateLimit int
	// Circuit breaker configuration
	CircuitBreakerEnabled bool
	CircuitBreakerConfig  CircuitBreakerConfig
}

// DefaultClientConfig returns default configuration
func DefaultClientConfig() ClientConfig {
	return ClientConfig{
		DBPath:                "/data/whatsapp.db",
		QRTimeout:             2 * time.Minute,
		ReconnectDelay:        5 * time.Second,
		MaxReconnects:         10,
		MessageRateLimit:      30,
		CircuitBreakerEnabled: true,
		CircuitBreakerConfig:  DefaultCircuitBreakerConfig(),
	}
}

// WhatsmeowClient implements WhatsAppClient using whatsmeow
type WhatsmeowClient struct {
	config         ClientConfig
	container      *sqlstore.Container
	clients        map[string]*whatsmeow.Client
	sessionToJID   map[string]string // Maps session UUID to WhatsApp JID user part
	mu             sync.RWMutex
	handlers       []repository.EventHandler
	logger         waLog.Logger
	circuitBreaker *CircuitBreaker
	mediaUploader  *WhatsmeowMediaUploader
}

// NewWhatsmeowClient creates a new WhatsApp client
func NewWhatsmeowClient(ctx context.Context, config ClientConfig) (*WhatsmeowClient, error) {
	// Create a logger
	logger := waLog.Stdout("WhatsApp", "INFO", true)

	// Set device properties for the linked device name shown in WhatsApp
	store.DeviceProps.Os = proto.String("PharmaBroker")
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_DESKTOP.Enum()
	store.DeviceProps.RequireFullSync = proto.Bool(true) // Sync group chats and history

	// Create the SQL store container with foreign keys enabled (required by whatsmeow)
	// Using modernc.org/sqlite pragma syntax: _pragma=foreign_keys(1)
	dsn := config.DBPath + "?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"
	container, err := sqlstore.New(ctx, "sqlite", dsn, logger)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to create whatsmeow store")
	}

	client := &WhatsmeowClient{
		config:       config,
		container:    container,
		clients:      make(map[string]*whatsmeow.Client),
		sessionToJID: make(map[string]string),
		handlers:     make([]repository.EventHandler, 0),
		logger:       logger,
	}

	// Initialize circuit breaker if enabled
	if config.CircuitBreakerEnabled {
		client.circuitBreaker = NewCircuitBreaker(config.CircuitBreakerConfig)
	}

	return client, nil
}

// Connect establishes a connection for the given session
func (c *WhatsmeowClient) Connect(ctx context.Context, sessionID string) error {
	// Use circuit breaker if enabled
	if c.circuitBreaker != nil {
		_, err := c.circuitBreaker.Execute(ctx, func() (any, error) {
			return nil, c.connectInternal(ctx, sessionID)
		})
		return err
	}
	return c.connectInternal(ctx, sessionID)
}

// connectInternal performs the actual connection logic
func (c *WhatsmeowClient) connectInternal(ctx context.Context, sessionID string) error {
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

	// Store JID mapping if available
	if client.Store.ID != nil {
		c.sessionToJID[sessionID] = client.Store.ID.User
		c.logger.Infof("connectInternal: stored JID mapping: sessionID=%s, jidUser=%s", sessionID, client.Store.ID.User)
	}

	return nil
}

// connectWithRetry implements exponential backoff retry for connections
func (c *WhatsmeowClient) connectWithRetry(ctx context.Context, client *whatsmeow.Client) error {
	retryPolicy := NewRetryPolicy(RetryConfig{
		MaxAttempts:  c.config.MaxReconnects,
		InitialDelay: c.config.ReconnectDelay,
		MaxDelay:     time.Duration(c.config.MaxReconnects) * time.Minute,
		Multiplier:   2.0,
		JitterFactor: 0.1,
	})

	err := retryPolicy.Execute(ctx, func() error {
		return client.Connect()
	})

	if err != nil {
		return errors.ErrConnectionFailed.WithCause(err).WithMessage(
			fmt.Sprintf("failed to connect after %d attempts", c.config.MaxReconnects+1))
	}
	return nil
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
	// Use circuit breaker if enabled
	if c.circuitBreaker != nil {
		_, err := c.circuitBreaker.Execute(ctx, func() (any, error) {
			return nil, c.sendMessageInternal(ctx, msg)
		})
		return err
	}
	return c.sendMessageInternal(ctx, msg)
}

// sendMessageInternal performs the actual message sending logic
func (c *WhatsmeowClient) sendMessageInternal(ctx context.Context, msg *entity.Message) error {
	c.mu.RLock()
	client, exists := c.clients[msg.SessionID]
	mediaUploader := c.mediaUploader
	c.mu.RUnlock()

	c.logger.Infof("sendMessageInternal: sessionID=%s, exists=%v, clientsCount=%d", msg.SessionID, exists, len(c.clients))

	// Log all client keys for debugging
	c.mu.RLock()
	for k := range c.clients {
		c.logger.Infof("sendMessageInternal: available client key=%s", k)
	}
	c.mu.RUnlock()

	if !exists {
		c.logger.Warnf("sendMessageInternal: session not found: %s", msg.SessionID)
		return errors.ErrSessionNotFound
	}

	if !client.IsConnected() {
		c.logger.Warnf("sendMessageInternal: session not connected: %s", msg.SessionID)
		return errors.ErrDisconnected
	}

	c.logger.Infof("sendMessageInternal: client is connected, sending to %s", msg.To)

	// Parse recipient JID - strip leading + from phone number
	phoneNumber := string(msg.To)
	if strings.HasPrefix(phoneNumber, "+") {
		phoneNumber = phoneNumber[1:]
	}
	recipientJID, err := types.ParseJID(phoneNumber + "@s.whatsapp.net")
	if err != nil {
		return errors.ErrInvalidPhoneNumber.WithCause(err)
	}

	// Build message based on type
	var waMsg *waE2E.Message

	switch msg.Type {
	case entity.MessageTypeImage:
		if mediaUploader == nil {
			return errors.ErrMediaUploadFailed.WithMessage("media uploader not available")
		}
		if msg.Content.ImageURL == nil || *msg.Content.ImageURL == "" {
			return errors.ErrEmptyContent.WithMessage("image URL is required")
		}
		uploadResult, err := mediaUploader.UploadImage(ctx, msg.SessionID, *msg.Content.ImageURL)
		if err != nil {
			return errors.ErrMediaUploadFailed.WithCause(err)
		}
		caption := ""
		if msg.Content.Caption != nil {
			caption = *msg.Content.Caption
		}
		waMsg = BuildImageMessage(uploadResult, caption)

	case entity.MessageTypeDocument:
		if mediaUploader == nil {
			return errors.ErrMediaUploadFailed.WithMessage("media uploader not available")
		}
		if msg.Content.DocURL == nil || *msg.Content.DocURL == "" {
			return errors.ErrEmptyContent.WithMessage("document URL is required")
		}
		filename := ""
		if msg.Content.Caption != nil {
			filename = *msg.Content.Caption // Use caption as filename for documents
		}
		uploadResult, err := mediaUploader.UploadDocument(ctx, msg.SessionID, *msg.Content.DocURL, filename)
		if err != nil {
			return errors.ErrMediaUploadFailed.WithCause(err)
		}
		caption := ""
		if msg.Content.Caption != nil {
			caption = *msg.Content.Caption
		}
		waMsg = BuildDocumentMessage(uploadResult, filename, caption)

	case entity.MessageTypeAudio:
		if mediaUploader == nil {
			return errors.ErrMediaUploadFailed.WithMessage("media uploader not available")
		}
		if msg.Content.AudioURL == nil || *msg.Content.AudioURL == "" {
			return errors.ErrEmptyContent.WithMessage("audio URL is required")
		}
		uploadResult, err := mediaUploader.UploadAudio(ctx, msg.SessionID, *msg.Content.AudioURL)
		if err != nil {
			return errors.ErrMediaUploadFailed.WithCause(err)
		}
		waMsg = BuildAudioMessage(uploadResult)

	case entity.MessageTypeVideo:
		if mediaUploader == nil {
			return errors.ErrMediaUploadFailed.WithMessage("media uploader not available")
		}
		if msg.Content.VideoURL == nil || *msg.Content.VideoURL == "" {
			return errors.ErrEmptyContent.WithMessage("video URL is required")
		}
		uploadResult, err := mediaUploader.UploadVideo(ctx, msg.SessionID, *msg.Content.VideoURL)
		if err != nil {
			return errors.ErrMediaUploadFailed.WithCause(err)
		}
		caption := ""
		if msg.Content.Caption != nil {
			caption = *msg.Content.Caption
		}
		waMsg = BuildVideoMessage(uploadResult, caption)

	default:
		// Text message
		waMsg, err = BuildTextMessage(msg)
		if err != nil {
			return err
		}
	}

	// Send message with retry
	_, err = c.sendWithRetry(ctx, client, recipientJID, waMsg)
	if err != nil {
		return errors.ErrMessageSendFailed.WithCause(err)
	}

	return nil
}

// sendWithRetry sends a message with exponential backoff retry
func (c *WhatsmeowClient) sendWithRetry(ctx context.Context, client *whatsmeow.Client, to types.JID, msg *waE2E.Message) (whatsmeow.SendResponse, error) {
	retryPolicy := NewRetryPolicy(RetryConfig{
		MaxAttempts:  3,
		InitialDelay: c.config.ReconnectDelay,
		MaxDelay:     30 * time.Second,
		Multiplier:   2.0,
		JitterFactor: 0.1,
	})

	result, err := retryPolicy.ExecuteWithResult(ctx, func() (any, error) {
		return client.SendMessage(ctx, to, msg)
	})

	if err != nil {
		return whatsmeow.SendResponse{}, err
	}
	return result.(whatsmeow.SendResponse), nil
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
					qrBase64, err := EncodeQRToBase64(evt.Code)
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
					// Store client and JID mapping
					c.mu.Lock()
					c.clients[sessionID] = client
					if client.Store.ID != nil {
						c.sessionToJID[sessionID] = client.Store.ID.User
						c.logger.Infof("GetQRChannel: stored JID mapping: sessionID=%s, jidUser=%s", sessionID, client.Store.ID.User)
					}
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

// SetSessionJIDMapping sets the JID mapping for a session (used for reconnection)
func (c *WhatsmeowClient) SetSessionJIDMapping(sessionID, jid string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	// Extract user part from JID (e.g., "201021347532" from "201021347532:123@s.whatsapp.net")
	jidUser := jid
	if idx := strings.Index(jid, ":"); idx > 0 {
		jidUser = jid[:idx]
	} else if idx := strings.Index(jid, "@"); idx > 0 {
		jidUser = jid[:idx]
	}

	c.sessionToJID[sessionID] = jidUser
	c.logger.Infof("SetSessionJIDMapping: sessionID=%s, jidUser=%s", sessionID, jidUser)
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

// GetStoredSessions returns all session IDs that have stored credentials in whatsmeow's database
// These sessions can be auto-reconnected without QR scan
func (c *WhatsmeowClient) GetStoredSessions(ctx context.Context) ([]string, error) {
	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	sessionIDs := make([]string, 0, len(devices))
	for _, device := range devices {
		if device.ID != nil {
			sessionIDs = append(sessionIDs, device.ID.User)
		}
	}
	return sessionIDs, nil
}

// AutoReconnect attempts to reconnect all sessions that have stored credentials
// Returns a map of session ID to error (nil if successful)
func (c *WhatsmeowClient) AutoReconnect(ctx context.Context) map[string]error {
	results := make(map[string]error)

	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		return results
	}

	for _, device := range devices {
		if device.ID == nil {
			continue // Skip devices without stored credentials
		}

		sessionID := device.ID.User

		// Create client for this device
		client := whatsmeow.NewClient(device, c.logger)

		// Register event handler
		client.AddEventHandler(func(evt interface{}) {
			c.handleEvent(sessionID, evt)
		})

		// Try to connect
		err := client.Connect()
		if err != nil {
			results[sessionID] = err
			continue
		}

		// Store client
		c.mu.Lock()
		c.clients[sessionID] = client
		c.mu.Unlock()

		results[sessionID] = nil
	}

	return results
}

// GetCircuitBreakerState returns the current state of the circuit breaker
// Returns empty string if circuit breaker is not enabled
func (c *WhatsmeowClient) GetCircuitBreakerState() string {
	if c.circuitBreaker == nil {
		return ""
	}
	return c.circuitBreaker.State().String()
}

// IsCircuitBreakerOpen returns true if the circuit breaker is open
func (c *WhatsmeowClient) IsCircuitBreakerOpen() bool {
	if c.circuitBreaker == nil {
		return false
	}
	return c.circuitBreaker.IsOpen()
}

// SetMediaUploader sets the media uploader for handling media messages
func (c *WhatsmeowClient) SetMediaUploader(uploader *WhatsmeowMediaUploader) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.mediaUploader = uploader
}

// getOrCreateDevice gets or creates a device store for the session
func (c *WhatsmeowClient) getOrCreateDevice(ctx context.Context, sessionID string) (*store.Device, error) {
	// Try to get existing device
	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err)
	}

	// First, check if we have a JID mapping for this session
	if jidUser, ok := c.sessionToJID[sessionID]; ok {
		for _, device := range devices {
			if device.ID != nil && device.ID.User == jidUser {
				c.logger.Infof("getOrCreateDevice: found device by JID mapping: sessionID=%s, jidUser=%s", sessionID, jidUser)
				return device, nil
			}
		}
	}

	// Look for device with matching session ID in JID (legacy check)
	for _, device := range devices {
		if device.ID != nil && device.ID.User == sessionID {
			return device, nil
		}
	}

	// Create new device
	c.logger.Infof("getOrCreateDevice: creating new device for sessionID=%s", sessionID)
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
