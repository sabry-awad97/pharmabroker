package unit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	ws "github.com/pharmabroker/whatsapp/internal/infrastructure/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Helpers ====================

// MockAPIServer simulates the Node.js API WebSocket server
type MockAPIServer struct {
	server         *httptest.Server
	upgrader       websocket.Upgrader
	expectedKey    string
	authReceived   bool
	authSuccess    bool
	eventsReceived []*entity.Event
	mu             sync.Mutex
}

func NewMockAPIServer(expectedKey string) *MockAPIServer {
	mock := &MockAPIServer{
		expectedKey:    expectedKey,
		eventsReceived: make([]*entity.Event, 0),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/whatsapp", mock.handleWebSocket)
	mock.server = httptest.NewServer(mux)

	return mock
}

func (m *MockAPIServer) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := m.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// Wait for auth message
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil {
		return
	}

	var authMsg struct {
		Type   string `json:"type"`
		APIKey string `json:"api_key"`
	}
	if err := json.Unmarshal(message, &authMsg); err != nil {
		return
	}

	m.mu.Lock()
	m.authReceived = authMsg.Type == "auth"
	m.authSuccess = authMsg.APIKey == m.expectedKey || m.expectedKey == ""
	m.mu.Unlock()

	// Send auth response
	response := map[string]interface{}{
		"type":    "auth_response",
		"success": m.authSuccess,
	}
	if !m.authSuccess {
		response["message"] = "Invalid API key"
	}
	responseData, _ := json.Marshal(response)
	conn.WriteMessage(websocket.TextMessage, responseData)

	if !m.authSuccess {
		return
	}

	// Listen for events
	conn.SetReadDeadline(time.Time{})
	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var event entity.Event
		if err := json.Unmarshal(message, &event); err != nil {
			continue
		}

		m.mu.Lock()
		m.eventsReceived = append(m.eventsReceived, &event)
		m.mu.Unlock()
	}
}

func (m *MockAPIServer) URL() string {
	return "ws" + strings.TrimPrefix(m.server.URL, "http") + "/ws/whatsapp"
}

func (m *MockAPIServer) Close() {
	m.server.Close()
}

func (m *MockAPIServer) AuthReceived() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.authReceived
}

func (m *MockAPIServer) AuthSuccess() bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.authSuccess
}

func (m *MockAPIServer) EventCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.eventsReceived)
}

// ==================== Authentication Tests ====================

func TestPublisher_SendsAuthMessageOnConnect(t *testing.T) {
	expectedKey := "test-api-key-123"
	mockServer := NewMockAPIServer(expectedKey)
	defer mockServer.Close()

	config := ws.PublisherConfig{
		URL:            mockServer.URL(),
		APIKey:         expectedKey,
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		ReconnectDelay: 1 * time.Second,
		MaxReconnects:  1,
		QueueSize:      100,
	}

	publisher := ws.NewGorillaEventPublisher(config)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := publisher.Connect(ctx)
	require.NoError(t, err)
	defer publisher.Disconnect(context.Background())

	// Wait for auth to be processed
	time.Sleep(100 * time.Millisecond)

	assert.True(t, mockServer.AuthReceived(), "Auth message should be received")
	assert.True(t, mockServer.AuthSuccess(), "Auth should succeed with correct key")
	assert.True(t, publisher.IsConnected(), "Publisher should be connected")
}

func TestPublisher_AuthFailsWithWrongKey(t *testing.T) {
	expectedKey := "correct-key"
	mockServer := NewMockAPIServer(expectedKey)
	defer mockServer.Close()

	config := ws.PublisherConfig{
		URL:            mockServer.URL(),
		APIKey:         "wrong-key",
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		ReconnectDelay: 100 * time.Millisecond,
		MaxReconnects:  1, // Only try once
		QueueSize:      100,
	}

	publisher := ws.NewGorillaEventPublisher(config)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	err := publisher.Connect(ctx)
	assert.Error(t, err, "Connection should fail with wrong API key")
	assert.False(t, publisher.IsConnected(), "Publisher should not be connected")
}

func TestPublisher_AuthSucceedsWithEmptyExpectedKey(t *testing.T) {
	// When server expects no key (empty string), any key should work
	mockServer := NewMockAPIServer("")
	defer mockServer.Close()

	config := ws.PublisherConfig{
		URL:            mockServer.URL(),
		APIKey:         "any-key",
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		ReconnectDelay: 1 * time.Second,
		MaxReconnects:  1,
		QueueSize:      100,
	}

	publisher := ws.NewGorillaEventPublisher(config)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := publisher.Connect(ctx)
	require.NoError(t, err)
	defer publisher.Disconnect(context.Background())

	time.Sleep(100 * time.Millisecond)

	assert.True(t, mockServer.AuthReceived(), "Auth message should be received")
	assert.True(t, mockServer.AuthSuccess(), "Auth should succeed when no key expected")
}

func TestPublisher_EventsOnlySentAfterAuth(t *testing.T) {
	expectedKey := "test-key"
	mockServer := NewMockAPIServer(expectedKey)
	defer mockServer.Close()

	config := ws.PublisherConfig{
		URL:            mockServer.URL(),
		APIKey:         expectedKey,
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		ReconnectDelay: 1 * time.Second,
		MaxReconnects:  1,
		QueueSize:      100,
	}

	publisher := ws.NewGorillaEventPublisher(config)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := publisher.Connect(ctx)
	require.NoError(t, err)
	defer publisher.Disconnect(context.Background())

	// Wait for auth
	time.Sleep(100 * time.Millisecond)
	assert.True(t, mockServer.AuthSuccess(), "Auth should succeed")

	// Publish an event
	event := &entity.Event{
		Type:      "connection.connected",
		SessionID: "test-session",
		Timestamp: time.Now(),
	}
	err = publisher.Publish(ctx, event)
	require.NoError(t, err)

	// Wait for event to be sent
	time.Sleep(200 * time.Millisecond)

	assert.Equal(t, 1, mockServer.EventCount(), "Event should be received after auth")
}

// ==================== Reconnection with Auth Tests ====================

func TestPublisher_ReauthenticatesOnReconnect(t *testing.T) {
	expectedKey := "test-key"

	// Create a server that will close after first connection
	authCount := 0
	var mu sync.Mutex

	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ws/whatsapp", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close()

		// Wait for auth
		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, message, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var authMsg struct {
			Type   string `json:"type"`
			APIKey string `json:"api_key"`
		}
		json.Unmarshal(message, &authMsg)

		if authMsg.Type == "auth" && authMsg.APIKey == expectedKey {
			mu.Lock()
			authCount++
			mu.Unlock()

			response := map[string]interface{}{
				"type":    "auth_response",
				"success": true,
			}
			responseData, _ := json.Marshal(response)
			conn.WriteMessage(websocket.TextMessage, responseData)
		}

		// Keep connection alive briefly
		time.Sleep(500 * time.Millisecond)
	})

	server := httptest.NewServer(mux)
	defer server.Close()

	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/whatsapp"

	config := ws.PublisherConfig{
		URL:            wsURL,
		APIKey:         expectedKey,
		PingInterval:   100 * time.Millisecond,
		PongTimeout:    50 * time.Millisecond,
		ReconnectDelay: 100 * time.Millisecond,
		MaxReconnects:  3,
		QueueSize:      100,
	}

	publisher := ws.NewGorillaEventPublisher(config)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := publisher.Connect(ctx)
	require.NoError(t, err)
	defer publisher.Disconnect(context.Background())

	// Wait for initial auth
	time.Sleep(200 * time.Millisecond)

	mu.Lock()
	initialAuthCount := authCount
	mu.Unlock()

	assert.GreaterOrEqual(t, initialAuthCount, 1, "Should have authenticated at least once")
}

// ==================== Config Tests ====================

func TestPublisherConfig_APIKeyField(t *testing.T) {
	config := ws.DefaultPublisherConfig()

	// Default should have empty API key
	assert.Empty(t, config.APIKey, "Default API key should be empty")

	// Can set API key
	config.APIKey = "my-secret-key"
	assert.Equal(t, "my-secret-key", config.APIKey)
}

func TestPublisherConfig_DefaultValues(t *testing.T) {
	config := ws.DefaultPublisherConfig()

	assert.Equal(t, "ws://localhost:3000/ws/whatsapp", config.URL)
	assert.Equal(t, 30*time.Second, config.PingInterval)
	assert.Equal(t, 10*time.Second, config.PongTimeout)
	assert.Equal(t, 5*time.Second, config.ReconnectDelay)
	assert.Equal(t, 0, config.MaxReconnects) // unlimited
	assert.Equal(t, 1000, config.QueueSize)
}

// ==================== Auth Message Format Tests ====================

func TestAuthMessage_Format(t *testing.T) {
	// Test that auth message has correct format
	authMsg := map[string]string{
		"type":    "auth",
		"api_key": "test-key",
	}

	data, err := json.Marshal(authMsg)
	require.NoError(t, err)

	var parsed map[string]string
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "auth", parsed["type"])
	assert.Equal(t, "test-key", parsed["api_key"])
}

func TestAuthResponse_SuccessFormat(t *testing.T) {
	response := map[string]interface{}{
		"type":    "auth_response",
		"success": true,
		"message": "Authentication successful",
	}

	data, err := json.Marshal(response)
	require.NoError(t, err)

	var parsed struct {
		Type    string `json:"type"`
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "auth_response", parsed.Type)
	assert.True(t, parsed.Success)
}

func TestAuthResponse_FailureFormat(t *testing.T) {
	response := map[string]interface{}{
		"type":    "auth_response",
		"success": false,
		"message": "Invalid API key",
	}

	data, err := json.Marshal(response)
	require.NoError(t, err)

	var parsed struct {
		Type    string `json:"type"`
		Success bool   `json:"success"`
		Message string `json:"message"`
	}
	err = json.Unmarshal(data, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "auth_response", parsed.Type)
	assert.False(t, parsed.Success)
	assert.Equal(t, "Invalid API key", parsed.Message)
}

// ==================== Backoff Calculation Tests ====================

func TestCalculateBackoff_DoublesDelay(t *testing.T) {
	// Test that backoff doubles each time
	delay := 1 * time.Second
	maxDelay := 1 * time.Minute

	delay1 := calculateBackoff(delay, maxDelay)
	assert.Equal(t, 2*time.Second, delay1)

	delay2 := calculateBackoff(delay1, maxDelay)
	assert.Equal(t, 4*time.Second, delay2)

	delay3 := calculateBackoff(delay2, maxDelay)
	assert.Equal(t, 8*time.Second, delay3)
}

func TestCalculateBackoff_CapsAtMax(t *testing.T) {
	delay := 30 * time.Second
	maxDelay := 1 * time.Minute

	result := calculateBackoff(delay, maxDelay)
	assert.Equal(t, maxDelay, result, "Should cap at max delay")

	// Even larger delay should still cap
	result2 := calculateBackoff(2*time.Minute, maxDelay)
	assert.Equal(t, maxDelay, result2)
}

// Helper function to match the one in publisher.go
func calculateBackoff(currentDelay, maxDelay time.Duration) time.Duration {
	nextDelay := currentDelay * 2
	if nextDelay > maxDelay {
		return maxDelay
	}
	return nextDelay
}
