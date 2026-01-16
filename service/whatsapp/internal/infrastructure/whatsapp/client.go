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
	messageParser  *MessageParser
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
		config:        config,
		container:     container,
		clients:       make(map[string]*whatsmeow.Client),
		sessionToJID:  make(map[string]string),
		handlers:      make([]repository.EventHandler, 0),
		logger:        logger,
		messageParser: NewMessageParser(),
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
		c.handleEvent(sessionID, client, evt)
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
	phoneNumber = strings.TrimPrefix(phoneNumber, "+")
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
		c.handleEvent(sessionID, client, evt)
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
			c.handleEvent(sessionID, client, evt)
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
func (c *WhatsmeowClient) handleEvent(sessionID string, client *whatsmeow.Client, evt interface{}) {
	var event *entity.Event
	var err error

	switch v := evt.(type) {
	case *events.Message:
		event, err = c.handleMessageEvent(sessionID, client, v)
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
	case *events.HistorySync:
		// Handle history sync to extract pushnames and emit message events
		c.handleHistorySyncEvent(sessionID, client, v)
		return // Don't emit domain event for history sync itself
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
// Also saves the sender's pushname to the contact store for future lookups
func (c *WhatsmeowClient) handleMessageEvent(sessionID string, client *whatsmeow.Client, msg *events.Message) (*entity.Event, error) {
	// Save pushname to contact store if available
	if msg.Info.PushName != "" && client != nil && client.Store != nil && client.Store.Contacts != nil {
		// Update contact with pushname (use background context since this is async)
		ctx := context.Background()
		_, _, err := client.Store.Contacts.PutPushName(ctx, msg.Info.Sender, msg.Info.PushName)
		if err != nil {
			c.logger.Warnf("Failed to save pushname for %s: %v", msg.Info.Sender.String(), err)
		}
	}

	// Use the message parser to create a full ParsedMessage
	parsedMsg, err := c.messageParser.ParseRealtimeMessage(sessionID, msg)
	if err != nil {
		c.logger.Warnf("Failed to parse message: %v", err)
		return nil, err
	}

	// Resolve LID to phone number JID if needed
	if msg.Info.Sender.Server == "lid" && client != nil && client.Store != nil && client.Store.LIDs != nil {
		ctx := context.Background()
		pnJID, err := client.Store.LIDs.GetPNForLID(ctx, msg.Info.Sender)
		if err == nil && !pnJID.IsEmpty() {
			parsedMsg.SenderJID = pnJID.String()
			c.logger.Debugf("Resolved LID %s to PN %s", msg.Info.Sender.String(), pnJID.String())
		}
	}

	// Emit the full parsed message as the event payload
	return entity.NewEventWithPayload(
		generateEventID(),
		entity.EventTypeMessageReceived,
		sessionID,
		parsedMsg,
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

// handleHistorySyncEvent processes history sync events to extract and save pushnames
// This is called during initial connection when WhatsApp syncs message history
// It also emits message events for each message in the history
func (c *WhatsmeowClient) handleHistorySyncEvent(sessionID string, client *whatsmeow.Client, evt *events.HistorySync) {
	if client == nil || client.Store == nil {
		return
	}

	ctx := context.Background()
	savedCount := 0
	messageCount := 0

	// Get handlers for emitting events
	c.mu.RLock()
	handlers := make([]repository.EventHandler, len(c.handlers))
	copy(handlers, c.handlers)
	c.mu.RUnlock()

	// Process conversations from history sync
	if evt.Data != nil && evt.Data.Conversations != nil {
		for _, conv := range evt.Data.Conversations {
			// Extract pushname from conversation metadata
			if conv.Name != nil && *conv.Name != "" && conv.ID != nil {
				// Parse JID from conversation ID
				jid, err := types.ParseJID(*conv.ID)
				if err == nil && !jid.IsEmpty() && client.Store.Contacts != nil {
					_, _, err := client.Store.Contacts.PutPushName(ctx, jid, *conv.Name)
					if err == nil {
						savedCount++
					}
				}
			}

			// Get chat JID for this conversation
			chatJID := ""
			if conv.ID != nil {
				chatJID = *conv.ID
			}

			// Process messages in the conversation
			if conv.Messages != nil {
				for _, histMsg := range conv.Messages {
					if histMsg.Message == nil || histMsg.Message.Message == nil {
						continue
					}

					// Get sender JID and pushname from message
					var senderJID types.JID
					var pushName string

					if histMsg.Message.Key != nil && histMsg.Message.Key.RemoteJID != nil {
						jid, err := types.ParseJID(*histMsg.Message.Key.RemoteJID)
						if err == nil {
							senderJID = jid
						}
					}

					if histMsg.Message.PushName != nil && *histMsg.Message.PushName != "" {
						pushName = *histMsg.Message.PushName
					}

					// Save pushname if we have both JID and pushname
					if !senderJID.IsEmpty() && pushName != "" && senderJID.Server == types.DefaultUserServer && client.Store.Contacts != nil {
						_, _, err := client.Store.Contacts.PutPushName(ctx, senderJID, pushName)
						if err == nil {
							savedCount++
						}
					}

					// Build MessageInfo from history message
					var msgInfo *types.MessageInfo
					if histMsg.Message.Key != nil {
						msgInfo = &types.MessageInfo{
							ID:        types.MessageID(histMsg.Message.Key.GetID()),
							Timestamp: time.Unix(int64(histMsg.Message.GetMessageTimestamp()), 0),
							MessageSource: types.MessageSource{
								Sender:   senderJID,
								IsFromMe: histMsg.Message.Key.GetFromMe(),
							},
							PushName: pushName,
						}
					}

					// Parse the history message
					parsedMsg, err := c.messageParser.ParseHistoryMessage(sessionID, chatJID, histMsg.Message.Message, msgInfo)
					if err != nil {
						c.logger.Warnf("Failed to parse history message: %v", err)
						continue
					}

					// Resolve LID to phone number JID if needed
					if !senderJID.IsEmpty() && senderJID.Server == "lid" && client.Store != nil && client.Store.LIDs != nil {
						pnJID, err := client.Store.LIDs.GetPNForLID(ctx, senderJID)
						if err == nil && !pnJID.IsEmpty() {
							parsedMsg.SenderJID = pnJID.String()
						}
					}

					// Only emit events for group messages (as per requirements)
					if !parsedMsg.IsGroupMessage() {
						continue
					}

					// Create and emit the event
					event, err := entity.NewEventWithPayload(
						generateEventID(),
						entity.EventTypeMessageReceived,
						sessionID,
						parsedMsg,
					)
					if err != nil {
						c.logger.Warnf("Failed to create history message event: %v", err)
						continue
					}

					// Dispatch to all handlers
					for _, handler := range handlers {
						handler(event)
					}
					messageCount++
				}
			}
		}
	}

	if savedCount > 0 {
		c.logger.Infof("History sync: saved %d pushnames to contact store", savedCount)
	}
	if messageCount > 0 {
		c.logger.Infof("History sync: emitted %d message events", messageCount)
	}
}

// GetJoinedGroups fetches all groups the session is a member of from WhatsApp
func (c *WhatsmeowClient) GetJoinedGroups(ctx context.Context, sessionID string) ([]*entity.Group, error) {
	c.mu.RLock()
	client, exists := c.clients[sessionID]
	c.mu.RUnlock()

	if !exists {
		return nil, errors.ErrSessionNotFound
	}

	if !client.IsConnected() {
		return nil, errors.ErrDisconnected
	}

	// Fetch joined groups from WhatsApp
	waGroups, err := client.GetJoinedGroups(ctx)
	if err != nil {
		return nil, errors.ErrInternal.WithCause(err).WithMessage("failed to fetch groups from WhatsApp")
	}

	groups := make([]*entity.Group, 0, len(waGroups))
	now := time.Now()

	for _, waGroup := range waGroups {
		// Fetch chat settings (archived/muted) from whatsmeow store
		isArchived := false
		isMuted := false
		var mutedUntil *time.Time

		if client.Store != nil && client.Store.ChatSettings != nil {
			chatSettings, err := client.Store.ChatSettings.GetChatSettings(ctx, waGroup.JID)
			if err == nil {
				isArchived = chatSettings.Archived
				isMuted = chatSettings.MutedUntil != time.Time{}
				if isMuted {
					mutedUntil = &chatSettings.MutedUntil
				}
			}
		}

		group := &entity.Group{
			JID:         waGroup.JID.String(),
			Name:        waGroup.Name,
			SessionID:   sessionID,
			MemberCount: len(waGroup.Participants),
			IsAnnounce:  waGroup.IsAnnounce,
			IsLocked:    waGroup.IsLocked,
			IsArchived:  isArchived,
			IsMuted:     isMuted,
			MutedUntil:  mutedUntil,
			CreatedAt:   now,
			UpdatedAt:   now,
		}

		// Set optional fields
		if waGroup.Topic != "" {
			group.Description = &waGroup.Topic
		}

		// Resolve owner JID from LID if needed
		if !waGroup.OwnerJID.IsEmpty() {
			ownerJID := c.resolveJID(ctx, client, waGroup.OwnerJID)
			group.OwnerJID = &ownerJID
		}

		if !waGroup.GroupCreated.IsZero() {
			group.GroupCreatedAt = &waGroup.GroupCreated
		}

		// Convert participants
		participants := make([]entity.Participant, 0, len(waGroup.Participants))
		for _, waParticipant := range waGroup.Participants {
			role := convertParticipantRole(waParticipant)

			// Resolve participant JID from LID if needed
			resolvedJID := c.resolveJID(ctx, client, waParticipant.JID)

			participant := entity.Participant{
				JID:       resolvedJID,
				Role:      role,
				JoinedAt:  now,
				UpdatedAt: now,
			}

			// Try to get display name from multiple sources
			displayName := c.getParticipantDisplayName(ctx, client, waParticipant)
			if displayName != "" {
				participant.DisplayName = &displayName
			}

			participants = append(participants, participant)
		}
		group.Participants = participants

		groups = append(groups, group)
	}

	return groups, nil
}

// resolveJID resolves a JID, converting LID to phone number if needed
func (c *WhatsmeowClient) resolveJID(ctx context.Context, client *whatsmeow.Client, jid types.JID) string {
	// If it's a LID (Linked ID), resolve it to a phone number
	if jid.Server == types.DefaultUserServer || jid.Server == "lid" {
		// Try to resolve LID to phone number
		if client.Store != nil && client.Store.LIDs != nil {
			pn, err := client.Store.LIDs.GetPNForLID(ctx, jid)
			if err == nil && !pn.IsEmpty() {
				return pn.String()
			}
		}
	}

	// Return the original JID string if resolution fails or not needed
	return jid.String()
}

// convertParticipantRole converts whatsmeow participant to domain role
func convertParticipantRole(p types.GroupParticipant) entity.ParticipantRole {
	if p.IsSuperAdmin {
		return entity.ParticipantRoleSuperAdmin
	}
	if p.IsAdmin {
		return entity.ParticipantRoleAdmin
	}
	return entity.ParticipantRoleMember
}

// getParticipantDisplayName tries to get the display name from multiple sources:
// 1. GroupParticipant.DisplayName (from group metadata)
// 2. Contact store (pushname from previous interactions)
// 3. Returns empty string if not found
func (c *WhatsmeowClient) getParticipantDisplayName(ctx context.Context, client *whatsmeow.Client, p types.GroupParticipant) string {
	// First, check if DisplayName is set in the group participant data
	if p.DisplayName != "" {
		return p.DisplayName
	}

	// Try to get pushname from the contact store
	if client.Store != nil && client.Store.Contacts != nil {
		contact, err := client.Store.Contacts.GetContact(ctx, p.JID)
		if err == nil && contact.PushName != "" {
			return contact.PushName
		}
		// Also check FullName or BusinessName as fallbacks
		if err == nil && contact.FullName != "" {
			return contact.FullName
		}
		if err == nil && contact.BusinessName != "" {
			return contact.BusinessName
		}
	}

	return ""
}
