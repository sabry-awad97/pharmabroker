package integration

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/presentation/ws"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupWebSocketTestRouter(sessionUC *usecase.SessionUseCase, config ws.QRHandlerConfig) (*gin.Engine, *ws.QRHandler) {
	gin.SetMode(gin.TestMode)
	router := gin.New()

	qrHandler := ws.NewQRHandler(sessionUC, config)
	qrHandler.RegisterRoutes(router)

	return router, qrHandler
}

func createWebSocketConnection(t *testing.T, server *httptest.Server, sessionID string) *websocket.Conn {
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/qr/" + sessionID
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	require.NoError(t, err)
	return conn
}

// ==================== WebSocket QR Flow Tests ====================

func TestWebSocket_QRFlow_Success(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Create a session
	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createWebSocketConnection(t, server, "test-session")
	defer conn.Close()

	// Simulate QR code event from WhatsApp client
	go func() {
		time.Sleep(100 * time.Millisecond)
		waClient.QRChan <- repository.QREvent{
			Type: "qr",
			Data: "base64-qr-image-data",
		}
	}()

	// Read QR message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var qrMsg ws.QRWebSocketMessage
	err = json.Unmarshal(message, &qrMsg)
	require.NoError(t, err)

	assert.Equal(t, "qr", qrMsg.Type)
	assert.Equal(t, "base64-qr-image-data", qrMsg.Data)
}

func TestWebSocket_QRFlow_Authentication(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Create a session
	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createWebSocketConnection(t, server, "test-session")
	defer conn.Close()

	// Simulate authentication success
	go func() {
		time.Sleep(100 * time.Millisecond)
		waClient.QRChan <- repository.QREvent{
			Type: "authenticated",
			Data: "1234567890@s.whatsapp.net",
		}
	}()

	// Read authenticated message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var authMsg ws.QRWebSocketMessage
	err = json.Unmarshal(message, &authMsg)
	require.NoError(t, err)

	assert.Equal(t, "authenticated", authMsg.Type)
	assert.Equal(t, "Successfully authenticated", authMsg.Message)
}

func TestWebSocket_QRFlow_SessionNotFound(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// No session created
	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createWebSocketConnection(t, server, "non-existent-session")
	defer conn.Close()

	// Read error message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var errMsg ws.QRWebSocketMessage
	err = json.Unmarshal(message, &errMsg)
	require.NoError(t, err)

	assert.Equal(t, "error", errMsg.Type)
}

func TestWebSocket_QRFlow_DuplicateConnection(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Create a session
	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, qrHandler := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	// First connection
	conn1 := createWebSocketConnection(t, server, "test-session")
	defer conn1.Close()

	// Wait for first connection to be registered
	time.Sleep(100 * time.Millisecond)

	// Verify first connection is active
	assert.True(t, qrHandler.IsSessionActive("test-session"))

	// Second connection should get error
	conn2 := createWebSocketConnection(t, server, "test-session")
	defer conn2.Close()

	// Read error message from second connection
	conn2.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn2.ReadMessage()
	require.NoError(t, err)

	var errMsg ws.QRWebSocketMessage
	err = json.Unmarshal(message, &errMsg)
	require.NoError(t, err)

	assert.Equal(t, "error", errMsg.Type)
	assert.Contains(t, errMsg.Message, "already in progress")
}

func TestWebSocket_QRFlow_ErrorEvent(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Create a session
	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 5 * time.Second
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	conn := createWebSocketConnection(t, server, "test-session")
	defer conn.Close()

	// Simulate error event
	go func() {
		time.Sleep(100 * time.Millisecond)
		waClient.QRChan <- repository.QREvent{
			Type:    "error",
			Message: "Authentication failed",
		}
	}()

	// Read error message
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, message, err := conn.ReadMessage()
	require.NoError(t, err)

	var errMsg ws.QRWebSocketMessage
	err = json.Unmarshal(message, &errMsg)
	require.NoError(t, err)

	assert.Equal(t, "error", errMsg.Type)
}

func TestWebSocket_OriginValidation_Allowed(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AllowedOrigins = []string{"http://localhost:3000", "https://example.com"}
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	// Connect with allowed origin
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/qr/test-session"
	header := http.Header{}
	header.Set("Origin", "http://localhost:3000")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	require.NoError(t, err)
	defer conn.Close()
}

func TestWebSocket_OriginValidation_Wildcard(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	session := entity.NewSession("test-session", "Test Session")
	repo.sessions["test-session"] = session

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AllowedOrigins = []string{"*"} // Allow all
	router, _ := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	// Connect with any origin
	wsURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/qr/test-session"
	header := http.Header{}
	header.Set("Origin", "http://any-origin.com")

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, header)
	require.NoError(t, err)
	defer conn.Close()
}

func TestWebSocket_ActiveConnectionCount(t *testing.T) {
	repo := NewSessionRepositoryMock()
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	// Create multiple sessions
	repo.sessions["session-1"] = entity.NewSession("session-1", "Session 1")
	repo.sessions["session-2"] = entity.NewSession("session-2", "Session 2")

	sessionUC := usecase.NewSessionUseCase(repo, waClient, publisher)

	config := ws.DefaultQRHandlerConfig()
	config.AuthTimeout = 10 * time.Second
	router, qrHandler := setupWebSocketTestRouter(sessionUC, config)

	server := httptest.NewServer(router)
	defer server.Close()

	// Initially no connections
	assert.Equal(t, 0, qrHandler.GetActiveConnectionCount())

	// Connect first session
	conn1 := createWebSocketConnection(t, server, "session-1")
	defer conn1.Close()
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 1, qrHandler.GetActiveConnectionCount())

	// Connect second session
	conn2 := createWebSocketConnection(t, server, "session-2")
	defer conn2.Close()
	time.Sleep(100 * time.Millisecond)
	assert.Equal(t, 2, qrHandler.GetActiveConnectionCount())
}
