package ws

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	infraWs "github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	httpPkg "github.com/pharmabroker/whatsapp/internal/presentation/http"
)

// EventHandlerConfig holds configuration for the Event WebSocket handler
type EventHandlerConfig struct {
	// PingInterval is the interval for sending ping messages
	PingInterval time.Duration
	// WriteTimeout is the timeout for writing messages to the WebSocket
	WriteTimeout time.Duration
	// AuthTimeout is the maximum time allowed for authentication
	AuthTimeout time.Duration
	// AllowedOrigins is the list of allowed origins for WebSocket connections
	AllowedOrigins []string
}

// DefaultEventHandlerConfig returns the default configuration
func DefaultEventHandlerConfig() EventHandlerConfig {
	return EventHandlerConfig{
		PingInterval:   30 * time.Second,
		WriteTimeout:   10 * time.Second,
		AuthTimeout:    10 * time.Second,
		AllowedOrigins: []string{"*"},
	}
}

// EventHandler handles WebSocket connections for event streaming
type EventHandler struct {
	hub      *infraWs.EventHub
	upgrader websocket.Upgrader
	config   EventHandlerConfig
}

// NewEventHandler creates a new Event WebSocket handler
func NewEventHandler(hub *infraWs.EventHub, config EventHandlerConfig) *EventHandler {
	h := &EventHandler{
		hub:    hub,
		config: config,
	}

	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     h.checkOrigin,
	}

	return h
}

// checkOrigin validates the origin of a WebSocket connection request
func (h *EventHandler) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// If no origin header, allow (same-origin request)
	if origin == "" {
		return true
	}

	return httpPkg.IsOriginAllowed(origin, h.config.AllowedOrigins)
}

// HandleEvents handles the WebSocket connection for event streaming
// WebSocket endpoint: /ws/events
func (h *EventHandler) HandleEvents(c *gin.Context) {
	// Upgrade HTTP connection to WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket connection: %v", err)
		return
	}

	// Create a new client
	client := infraWs.NewClient(conn, h.hub)

	// Register the client with the hub
	h.hub.Register(client)

	// Set up authentication timeout
	authTimer := time.NewTimer(h.config.AuthTimeout)
	defer authTimer.Stop()

	// Start a goroutine to handle authentication timeout
	go func() {
		<-authTimer.C
		if !client.IsAuthenticated() {
			// Close connection with 4001 status code for auth timeout
			h.hub.CloseWithError(client, 4001, "Authentication timeout")
			h.hub.Unregister(client)
		}
	}()

	// Set up pong handler for connection health
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(h.config.PingInterval + h.config.WriteTimeout))
		return nil
	})

	// Start the write pump in a goroutine
	go client.WritePump()

	// Run the read pump (blocks until connection closes)
	client.ReadPump()
}

// RegisterRoutes registers the event WebSocket routes on a Gin router
func (h *EventHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/ws/events", h.HandleEvents)
}

// GetHub returns the event hub (useful for testing and integration)
func (h *EventHandler) GetHub() *infraWs.EventHub {
	return h.hub
}
