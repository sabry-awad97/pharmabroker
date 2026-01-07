package websocket

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
)

// EventHubConfig holds configuration for the EventHub
type EventHubConfig struct {
	APIKey       string
	PingInterval time.Duration
	WriteTimeout time.Duration
	AuthTimeout  time.Duration
}

// DefaultEventHubConfig returns default configuration
func DefaultEventHubConfig() EventHubConfig {
	return EventHubConfig{
		APIKey:       "",
		PingInterval: 30 * time.Second,
		WriteTimeout: 10 * time.Second,
		AuthTimeout:  10 * time.Second,
	}
}

// AuthMessage represents an authentication message from a client
type AuthMessage struct {
	Type   string `json:"type"`
	APIKey string `json:"api_key"`
}

// AuthResponse represents an authentication response to a client
type AuthResponse struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// Client represents a connected WebSocket client
type Client struct {
	conn          *websocket.Conn
	hub           *EventHub
	send          chan []byte
	authenticated bool
	mu            sync.RWMutex
}

// NewClient creates a new client
func NewClient(conn *websocket.Conn, hub *EventHub) *Client {
	return &Client{
		conn:          conn,
		hub:           hub,
		send:          make(chan []byte, 256),
		authenticated: false,
	}
}

// IsAuthenticated returns whether the client is authenticated
func (c *Client) IsAuthenticated() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.authenticated
}

// SetAuthenticated sets the client's authentication status
func (c *Client) SetAuthenticated(auth bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.authenticated = auth
}

// Close closes the client connection and channels
func (c *Client) Close() {
	close(c.send)
}

// EventHub manages WebSocket connections for event broadcasting
type EventHub struct {
	// Registered clients
	clients map[*Client]bool

	// Broadcast channel for events
	broadcast chan *entity.Event

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Mutex for thread-safe client access
	mu sync.RWMutex

	// Configuration
	config EventHubConfig

	// Done channel for shutdown
	done chan struct{}
}

// NewEventHub creates a new event hub
func NewEventHub(config EventHubConfig) *EventHub {
	return &EventHub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan *entity.Event, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		config:     config,
		done:       make(chan struct{}),
	}
}

// Run starts the event hub's main loop
func (h *EventHub) Run() {
	for {
		select {
		case <-h.done:
			// Shutdown: close all client connections
			h.mu.Lock()
			for client := range h.clients {
				h.removeClient(client)
			}
			h.mu.Unlock()
			return

		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				h.removeClient(client)
			}
			h.mu.Unlock()

		case event := <-h.broadcast:
			h.broadcastEvent(event)
		}
	}
}

// Stop stops the event hub
func (h *EventHub) Stop() {
	close(h.done)
}

// Register registers a client with the hub
func (h *EventHub) Register(client *Client) {
	h.register <- client
}

// Unregister unregisters a client from the hub
func (h *EventHub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends an event to all connected and authenticated clients
func (h *EventHub) Broadcast(event *entity.Event) {
	select {
	case h.broadcast <- event:
	default:
		// Channel full, drop event (shouldn't happen with proper sizing)
	}
}

// ClientCount returns the number of connected clients
func (h *EventHub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// AuthenticatedClientCount returns the number of authenticated clients
func (h *EventHub) AuthenticatedClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	count := 0
	for client := range h.clients {
		if client.IsAuthenticated() {
			count++
		}
	}
	return count
}

// removeClient removes a client from the hub (must be called with lock held)
func (h *EventHub) removeClient(client *Client) {
	delete(h.clients, client)
	client.Close()
	_ = client.conn.Close()
}

// broadcastEvent sends an event to all authenticated clients
func (h *EventHub) broadcastEvent(event *entity.Event) {
	data, err := json.Marshal(event)
	if err != nil {
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		if !client.IsAuthenticated() {
			continue
		}

		select {
		case client.send <- data:
		default:
			// Client's send buffer is full, skip this event for this client
		}
	}
}

// AuthenticateClient handles client authentication
// Returns true if authentication succeeds, false otherwise
func (h *EventHub) AuthenticateClient(client *Client, apiKey string) bool {
	// If no API key is configured, allow all connections
	if h.config.APIKey == "" {
		client.SetAuthenticated(true)
		return true
	}

	// Validate API key
	if apiKey == h.config.APIKey {
		client.SetAuthenticated(true)
		return true
	}

	return false
}

// SendAuthResponse sends an authentication response to a client
func (h *EventHub) SendAuthResponse(client *Client, success bool, message string) error {
	response := AuthResponse{
		Type:    "auth_response",
		Success: success,
		Message: message,
	}

	data, err := json.Marshal(response)
	if err != nil {
		return err
	}

	_ = client.conn.SetWriteDeadline(time.Now().Add(h.config.WriteTimeout))
	return client.conn.WriteMessage(websocket.TextMessage, data)
}

// CloseWithError closes a client connection with an error code and message
func (h *EventHub) CloseWithError(client *Client, code int, message string) {
	closeMsg := websocket.FormatCloseMessage(code, message)
	_ = client.conn.SetWriteDeadline(time.Now().Add(h.config.WriteTimeout))
	_ = client.conn.WriteMessage(websocket.CloseMessage, closeMsg)
	_ = client.conn.Close()
}

// GetConfig returns the hub configuration
func (h *EventHub) GetConfig() EventHubConfig {
	return h.config
}

// WritePump pumps messages from the hub to the websocket connection
func (c *Client) WritePump() {
	ticker := time.NewTicker(c.hub.config.PingInterval)
	defer func() {
		ticker.Stop()
		c.hub.Unregister(c)
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.config.WriteTimeout))
			if !ok {
				// Hub closed the channel
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(c.hub.config.WriteTimeout))
			if err := c.conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(c.hub.config.WriteTimeout)); err != nil {
				return
			}
		}
	}
}

// ReadPump pumps messages from the websocket connection to the hub
// This is primarily used for handling authentication and keeping the connection alive
func (c *Client) ReadPump() {
	defer func() {
		c.hub.Unregister(c)
		_ = c.conn.Close()
	}()

	// Set up pong handler
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(c.hub.config.PingInterval + c.hub.config.WriteTimeout))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				// Log unexpected close errors if needed
			}
			break
		}

		// Handle authentication message if not yet authenticated
		if !c.IsAuthenticated() {
			var authMsg AuthMessage
			if err := json.Unmarshal(message, &authMsg); err != nil {
				continue
			}

			if authMsg.Type == "auth" {
				if c.hub.AuthenticateClient(c, authMsg.APIKey) {
					_ = c.hub.SendAuthResponse(c, true, "Authentication successful")
				} else {
					_ = c.hub.SendAuthResponse(c, false, "Invalid API key")
					// Close connection with 4001 status code
					c.hub.CloseWithError(c, 4001, "Invalid API key")
					return
				}
			}
		}
	}
}
