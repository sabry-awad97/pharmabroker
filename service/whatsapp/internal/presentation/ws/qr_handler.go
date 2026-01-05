package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	httpPkg "github.com/pharmabroker/whatsapp/internal/presentation/http"
)

// QRHandlerConfig holds configuration for the QR WebSocket handler
type QRHandlerConfig struct {
	// AuthTimeout is the maximum time allowed for QR authentication
	AuthTimeout time.Duration
	// WriteTimeout is the timeout for writing messages to the WebSocket
	WriteTimeout time.Duration
	// PingInterval is the interval for sending ping messages
	PingInterval time.Duration
	// AllowedOrigins is the list of allowed origins for WebSocket connections
	// Use "*" to allow all origins (not recommended for production)
	AllowedOrigins []string
}

// DefaultQRHandlerConfig returns the default configuration
func DefaultQRHandlerConfig() QRHandlerConfig {
	return QRHandlerConfig{
		AuthTimeout:    2 * time.Minute,
		WriteTimeout:   10 * time.Second,
		PingInterval:   30 * time.Second,
		AllowedOrigins: []string{"*"}, // Default to allow all (override in production)
	}
}

// QRHandler handles WebSocket connections for QR authentication
type QRHandler struct {
	sessionUC *usecase.SessionUseCase
	upgrader  websocket.Upgrader
	config    QRHandlerConfig

	// Track active connections per session for isolation
	activeConns   map[string]*websocket.Conn
	activeConnsMu sync.RWMutex
}

// NewQRHandler creates a new QR WebSocket handler
func NewQRHandler(sessionUC *usecase.SessionUseCase, config QRHandlerConfig) *QRHandler {
	h := &QRHandler{
		sessionUC:   sessionUC,
		config:      config,
		activeConns: make(map[string]*websocket.Conn),
	}

	h.upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     h.checkOrigin,
	}

	return h
}

// checkOrigin validates the origin of a WebSocket connection request
func (h *QRHandler) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")

	// If no origin header, allow (same-origin request)
	if origin == "" {
		return true
	}

	return httpPkg.IsOriginAllowed(origin, h.config.AllowedOrigins)
}

// QRWebSocketMessage represents a message sent over the QR WebSocket
type QRWebSocketMessage struct {
	Type    string      `json:"type"`    // "qr", "authenticated", "error", "timeout"
	Data    interface{} `json:"data"`    // base64 QR image, JID, or error details
	Message string      `json:"message"` // optional human-readable message
}

// HandleQRAuth handles the WebSocket connection for QR authentication
// WebSocket endpoint: /ws/qr/:session_id
func (h *QRHandler) HandleQRAuth(c *gin.Context) {
	sessionID := c.Param("session_id")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session_id is required"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := h.upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket connection: %v", err)
		return
	}
	defer conn.Close()

	// Register this connection for the session
	if !h.registerConnection(sessionID, conn) {
		h.sendError(conn, "SESSION_BUSY", "Another authentication is already in progress for this session")
		return
	}
	defer h.unregisterConnection(sessionID)

	// Create context with timeout
	ctx, cancel := context.WithTimeout(c.Request.Context(), h.config.AuthTimeout)
	defer cancel()

	// Start QR authentication
	qrChan, err := h.sessionUC.StartQRAuth(ctx, sessionID)
	if err != nil {
		domainErr := errors.GetDomainError(err)
		if domainErr != nil {
			h.sendError(conn, domainErr.Code, domainErr.Message)
		} else {
			h.sendError(conn, "INTERNAL_ERROR", "Failed to start QR authentication")
		}
		return
	}

	// Start ping loop for connection health
	pingDone := make(chan struct{})
	go h.pingLoop(conn, pingDone)
	defer close(pingDone)

	// Process QR events
	h.processQREvents(ctx, conn, qrChan, sessionID)
}

// registerConnection registers a WebSocket connection for a session
// Returns false if a connection already exists for the session
func (h *QRHandler) registerConnection(sessionID string, conn *websocket.Conn) bool {
	h.activeConnsMu.Lock()
	defer h.activeConnsMu.Unlock()

	if _, exists := h.activeConns[sessionID]; exists {
		return false
	}

	h.activeConns[sessionID] = conn
	return true
}

// unregisterConnection removes a WebSocket connection for a session
func (h *QRHandler) unregisterConnection(sessionID string) {
	h.activeConnsMu.Lock()
	defer h.activeConnsMu.Unlock()

	delete(h.activeConns, sessionID)
}

// GetActiveConnectionCount returns the number of active QR authentication connections
func (h *QRHandler) GetActiveConnectionCount() int {
	h.activeConnsMu.RLock()
	defer h.activeConnsMu.RUnlock()
	return len(h.activeConns)
}

// IsSessionActive checks if a session has an active QR authentication connection
func (h *QRHandler) IsSessionActive(sessionID string) bool {
	h.activeConnsMu.RLock()
	defer h.activeConnsMu.RUnlock()
	_, exists := h.activeConns[sessionID]
	return exists
}

// processQREvents processes QR events from the channel and sends them to the WebSocket
func (h *QRHandler) processQREvents(ctx context.Context, conn *websocket.Conn, qrChan <-chan repository.QREvent, sessionID string) {
	for {
		select {
		case <-ctx.Done():
			// Timeout reached
			h.sendTimeout(conn)
			return

		case event, ok := <-qrChan:
			if !ok {
				// Channel closed
				return
			}

			switch event.Type {
			case "qr":
				// Send QR code as base64 image
				if err := h.sendQRCode(conn, event.Data); err != nil {
					log.Printf("Failed to send QR code: %v", err)
					return
				}

			case "authenticated":
				// Authentication successful
				if err := h.sendAuthenticated(conn, event.Data); err != nil {
					log.Printf("Failed to send authenticated event: %v", err)
				}
				// Update session JID
				_ = h.sessionUC.UpdateSessionJID(ctx, sessionID, event.Data)
				return

			case "error":
				// Authentication error
				h.sendError(conn, "AUTH_FAILED", event.Message)
				return

			case "timeout":
				// QR timeout from WhatsApp client
				h.sendTimeout(conn)
				return
			}
		}
	}
}

// pingLoop sends periodic ping messages to keep the connection alive
func (h *QRHandler) pingLoop(conn *websocket.Conn, done <-chan struct{}) {
	ticker := time.NewTicker(h.config.PingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(h.config.WriteTimeout)); err != nil {
				return
			}
		}
	}
}

// sendQRCode sends a QR code message to the WebSocket
func (h *QRHandler) sendQRCode(conn *websocket.Conn, base64Image string) error {
	msg := QRWebSocketMessage{
		Type: "qr",
		Data: base64Image,
	}
	return h.sendMessage(conn, msg)
}

// sendAuthenticated sends an authenticated message to the WebSocket
func (h *QRHandler) sendAuthenticated(conn *websocket.Conn, jid string) error {
	msg := QRWebSocketMessage{
		Type:    "authenticated",
		Data:    map[string]string{"jid": jid},
		Message: "Successfully authenticated",
	}
	return h.sendMessage(conn, msg)
}

// sendError sends an error message to the WebSocket
func (h *QRHandler) sendError(conn *websocket.Conn, code, message string) {
	msg := QRWebSocketMessage{
		Type:    "error",
		Data:    map[string]string{"code": code},
		Message: message,
	}
	_ = h.sendMessage(conn, msg)
}

// sendTimeout sends a timeout message to the WebSocket
func (h *QRHandler) sendTimeout(conn *websocket.Conn) {
	msg := QRWebSocketMessage{
		Type:    "timeout",
		Message: "QR authentication timed out",
	}
	_ = h.sendMessage(conn, msg)
}

// sendMessage sends a message to the WebSocket with proper timeout
func (h *QRHandler) sendMessage(conn *websocket.Conn, msg QRWebSocketMessage) error {
	_ = conn.SetWriteDeadline(time.Now().Add(h.config.WriteTimeout))

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, data)
}

// RegisterRoutes registers the QR WebSocket routes on a Gin router
func (h *QRHandler) RegisterRoutes(router *gin.Engine) {
	router.GET("/ws/qr/:session_id", h.HandleQRAuth)
}

// NewQREvent creates a QR event for testing purposes
func NewQREvent(eventType, data, message string) repository.QREvent {
	return repository.QREvent{
		Type:    eventType,
		Data:    data,
		Message: message,
	}
}

// IsOriginAllowed is a convenience wrapper for WebSocket origin validation
// It delegates to the shared implementation in the http package
func IsOriginAllowed(origin string, allowedOrigins []string) bool {
	return httpPkg.IsOriginAllowed(origin, allowedOrigins)
}
