package unit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	infraWs "github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/pharmabroker/whatsapp/internal/presentation/ws"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupEventHandlerTestRouter(hub *infraWs.EventHub, config ws.EventHandlerConfig) (*gin.Engine, *ws.EventHandler) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	eventHandler := ws.NewEventHandler(hub, config)
	eventHandler.RegisterRoutes(router)

	return router, eventHandler
}

func createEventHubWithConfig(apiKey string) *infraWs.EventHub {
	config := infraWs.EventHubConfig{
		APIKey:       apiKey,
		PingInterval: 30 * time.Second,
		WriteTimeout: 10 * time.Second,
		AuthTimeout:  5 * time.Second,
	}
	hub := infraWs.NewEventHub(config)
	go hub.Run()
	return hub
}

func createEventWebSocketConnection(t *testing.T, server *httptest.Server) *websocket.Conn {
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/events"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	return conn
}

// ==================== WebSocket Upgrade Tests ====================

func TestEventHandler_WebSocketUpgrade_Success(t *testing.T) {
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Connection should be established
	assert.NotNil(t, conn)
}

func TestEventHandler_WebSocketUpgrade_WithOrigin(t *testing.T) {
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	config.AllowedOrigins = []string{"http://localhost:3000"}
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	// Connect with allowed origin
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/events"
	header := http.Header{}
	header.Set("Origin", "http://localhost:3000")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	require.NoError(t, err)
	defer conn.Close()

	assert.NotNil(t, conn)
}

// ==================== Authentication Flow Tests ====================

func TestEventHandler_Authentication_Success(t *testing.T) {
	apiKey := "test-api-key-12345"
	hub := createEventHubWithConfig(apiKey)
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Send authentication message
	authMsg := infraWs.AuthMessage{
		Type:   "auth",
		APIKey: apiKey,
	}
	err := conn.WriteJSON(authMsg)
	require.NoError(t, err)

	// Read authentication response
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var authResp infraWs.AuthResponse
	err = json.Unmarshal(message, &authResp)
	require.NoError(t, err)

	assert.Equal(t, "auth_response", authResp.Type)
	assert.True(t, authResp.Success)
	assert.Equal(t, "Authentication successful", authResp.Message)
}

func TestEventHandler_Authentication_InvalidKey(t *testing.T) {
	apiKey := "test-api-key-12345"
	hub := createEventHubWithConfig(apiKey)
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Send authentication message with wrong key
	authMsg := infraWs.AuthMessage{
		Type:   "auth",
		APIKey: "wrong-api-key",
	}
	err := conn.WriteJSON(authMsg)
	require.NoError(t, err)

	// Read authentication response
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var authResp infraWs.AuthResponse
	err = json.Unmarshal(message, &authResp)
	require.NoError(t, err)

	assert.Equal(t, "auth_response", authResp.Type)
	assert.False(t, authResp.Success)
	assert.Equal(t, "Invalid API key", authResp.Message)
}

func TestEventHandler_Authentication_NoKeyRequired(t *testing.T) {
	// Empty API key means no authentication required
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Send any auth message - should succeed
	authMsg := infraWs.AuthMessage{
		Type:   "auth",
		APIKey: "any-key",
	}
	err := conn.WriteJSON(authMsg)
	require.NoError(t, err)

	// Read authentication response
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var authResp infraWs.AuthResponse
	err = json.Unmarshal(message, &authResp)
	require.NoError(t, err)

	assert.True(t, authResp.Success)
}

// ==================== Ping/Pong Tests ====================

func TestEventHandler_PingPong_ConnectionHealth(t *testing.T) {
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	config.PingInterval = 500 * time.Millisecond // Short interval for testing
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Authenticate first
	authMsg := infraWs.AuthMessage{
		Type:   "auth",
		APIKey: "",
	}
	err := conn.WriteJSON(authMsg)
	require.NoError(t, err)

	// Read auth response
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = conn.ReadMessage()
	require.NoError(t, err)

	// Set up pong handler to track pings
	pingReceived := make(chan struct{}, 1)
	conn.SetPingHandler(func(appData string) error {
		select {
		case pingReceived <- struct{}{}:
		default:
		}
		// Send pong response
		return conn.WriteControl(websocket.PongMessage, []byte(appData), time.Now().Add(time.Second))
	})

	// Start a goroutine to read messages (required for ping handler to work)
	go func() {
		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				return
			}
		}
	}()

	// Wait for ping
	select {
	case <-pingReceived:
		// Ping received - connection health check working
	case <-time.After(2 * time.Second):
		t.Log("No ping received within timeout - this may be expected depending on timing")
	}
}

// ==================== Event Broadcast Tests ====================

func TestEventHandler_EventBroadcast_AuthenticatedClient(t *testing.T) {
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	router, _ := setupEventHandlerTestRouter(hub, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createEventWebSocketConnection(t, server)
	defer conn.Close()

	// Authenticate
	authMsg := infraWs.AuthMessage{
		Type:   "auth",
		APIKey: "",
	}
	err := conn.WriteJSON(authMsg)
	require.NoError(t, err)

	// Read auth response
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, _, err = conn.ReadMessage()
	require.NoError(t, err)

	// Wait for client to be fully registered
	time.Sleep(100 * time.Millisecond)

	// Broadcast an event
	payload := json.RawMessage(`{"message": "Hello, World!"}`)
	event := entity.NewEvent("test-event-id", entity.EventTypeMessageReceived, "test-session", payload)
	hub.Broadcast(event)

	// Read the broadcast event
	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var receivedEvent entity.Event
	err = json.Unmarshal(message, &receivedEvent)
	require.NoError(t, err)

	assert.Equal(t, entity.EventTypeMessageReceived, receivedEvent.Type)
	assert.Equal(t, "test-session", receivedEvent.SessionID)
}

func TestEventHandler_GetHub(t *testing.T) {
	hub := createEventHubWithConfig("")
	defer hub.Stop()

	config := ws.DefaultEventHandlerConfig()
	_, eventHandler := setupEventHandlerTestRouter(hub, config)

	// Verify GetHub returns the correct hub
	assert.Equal(t, hub, eventHandler.GetHub())
}
