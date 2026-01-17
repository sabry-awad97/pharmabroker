package unit

import (
	"context"
	"database/sql"
	"testing"

	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/health"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func TestSQLiteHealthChecker_Healthy(t *testing.T) {
	// Create in-memory SQLite database
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	checker := health.NewSQLiteHealthChecker(db)
	status := checker.Check(context.Background())

	assert.True(t, status.Healthy)
	assert.Equal(t, "sqlite", status.Name)
	assert.Contains(t, status.Message, "healthy")
	assert.NotNil(t, status.Details)
	assert.Contains(t, status.Details, "latency_ms")
}

func TestSQLiteHealthChecker_NilDB(t *testing.T) {
	checker := health.NewSQLiteHealthChecker(nil)
	status := checker.Check(context.Background())

	assert.False(t, status.Healthy)
	assert.Equal(t, "sqlite", status.Name)
	assert.Contains(t, status.Message, "nil")
}

func TestSQLiteHealthChecker_Name(t *testing.T) {
	checker := health.NewSQLiteHealthChecker(nil)
	assert.Equal(t, "sqlite", checker.Name())
}

// MockWhatsAppClient implements repository.WhatsAppClient for testing
type MockWhatsAppClient struct {
	connected bool
}

func (m *MockWhatsAppClient) Connect(ctx context.Context, sessionID string) error    { return nil }
func (m *MockWhatsAppClient) Disconnect(ctx context.Context, sessionID string) error { return nil }
func (m *MockWhatsAppClient) SendMessage(ctx context.Context, msg *entity.Message) error {
	return nil
}
func (m *MockWhatsAppClient) GetQRChannel(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	return nil, nil
}
func (m *MockWhatsAppClient) RegisterEventHandler(handler repository.EventHandler) {}
func (m *MockWhatsAppClient) IsConnected(sessionID string) bool                    { return m.connected }
func (m *MockWhatsAppClient) GetSessionJID(sessionID string) (string, error)       { return "", nil }
func (m *MockWhatsAppClient) SetSessionJIDMapping(sessionID, jid string)           {}
func (m *MockWhatsAppClient) SetHistorySyncConfig(sessionID string, enabled, fullSync bool, since string) {
}
func (m *MockWhatsAppClient) GetHistorySyncConfig(sessionID string) (enabled, fullSync bool, since string) {
	return false, false, ""
}

func TestWhatsAppClientHealthChecker_Healthy(t *testing.T) {
	client := &MockWhatsAppClient{connected: true}
	checker := health.NewWhatsAppClientHealthChecker(client)
	status := checker.Check(context.Background())

	assert.True(t, status.Healthy)
	assert.Equal(t, "whatsapp_client", status.Name)
	assert.Contains(t, status.Message, "initialized")
}

func TestWhatsAppClientHealthChecker_NilClient(t *testing.T) {
	checker := health.NewWhatsAppClientHealthChecker(nil)
	status := checker.Check(context.Background())

	assert.False(t, status.Healthy)
	assert.Equal(t, "whatsapp_client", status.Name)
	assert.Contains(t, status.Message, "nil")
}

func TestWhatsAppClientHealthChecker_Name(t *testing.T) {
	checker := health.NewWhatsAppClientHealthChecker(nil)
	assert.Equal(t, "whatsapp_client", checker.Name())
}

// MockEventPublisher implements repository.EventPublisher for testing
type MockEventPublisher struct {
	connected bool
	queueSize int
}

func (m *MockEventPublisher) Publish(ctx context.Context, event *entity.Event) error { return nil }
func (m *MockEventPublisher) Connect(ctx context.Context) error                      { return nil }
func (m *MockEventPublisher) Disconnect(ctx context.Context) error                   { return nil }
func (m *MockEventPublisher) IsConnected() bool                                      { return m.connected }
func (m *MockEventPublisher) QueueSize() int                                         { return m.queueSize }

func TestEventPublisherHealthChecker_Connected(t *testing.T) {
	publisher := &MockEventPublisher{connected: true, queueSize: 5}
	checker := health.NewEventPublisherHealthChecker(publisher)
	status := checker.Check(context.Background())

	assert.True(t, status.Healthy)
	assert.Equal(t, "event_publisher", status.Name)
	assert.Contains(t, status.Message, "connected")
	assert.Equal(t, true, status.Details["connected"])
	assert.Equal(t, 5, status.Details["queue_size"])
}

func TestEventPublisherHealthChecker_Disconnected(t *testing.T) {
	publisher := &MockEventPublisher{connected: false, queueSize: 0}
	checker := health.NewEventPublisherHealthChecker(publisher)
	status := checker.Check(context.Background())

	assert.False(t, status.Healthy)
	assert.Equal(t, "event_publisher", status.Name)
	assert.Contains(t, status.Message, "not connected")
}

func TestEventPublisherHealthChecker_NilPublisher(t *testing.T) {
	checker := health.NewEventPublisherHealthChecker(nil)
	status := checker.Check(context.Background())

	assert.False(t, status.Healthy)
	assert.Equal(t, "event_publisher", status.Name)
	assert.Contains(t, status.Message, "nil")
}

func TestEventPublisherHealthChecker_Name(t *testing.T) {
	checker := health.NewEventPublisherHealthChecker(nil)
	assert.Equal(t, "event_publisher", checker.Name())
}

func TestCompositeHealthChecker_AllHealthy(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sqliteChecker := health.NewSQLiteHealthChecker(db)
	clientChecker := health.NewWhatsAppClientHealthChecker(&MockWhatsAppClient{connected: true})
	publisherChecker := health.NewEventPublisherHealthChecker(&MockEventPublisher{connected: true})

	composite := health.NewCompositeHealthChecker(sqliteChecker, clientChecker, publisherChecker)
	response := composite.CheckAll(context.Background())

	assert.True(t, response.Ready)
	assert.Len(t, response.Components, 3)
}

func TestCompositeHealthChecker_OneUnhealthy(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sqliteChecker := health.NewSQLiteHealthChecker(db)
	clientChecker := health.NewWhatsAppClientHealthChecker(&MockWhatsAppClient{connected: true})
	publisherChecker := health.NewEventPublisherHealthChecker(&MockEventPublisher{connected: false}) // Unhealthy

	composite := health.NewCompositeHealthChecker(sqliteChecker, clientChecker, publisherChecker)
	response := composite.CheckAll(context.Background())

	assert.False(t, response.Ready)
	assert.Len(t, response.Components, 3)
}

func TestHealthUseCase_CheckReadiness(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	require.NoError(t, err)
	defer db.Close()

	sqliteChecker := health.NewSQLiteHealthChecker(db)
	clientChecker := health.NewWhatsAppClientHealthChecker(&MockWhatsAppClient{connected: true})

	uc := usecase.NewHealthUseCase(sqliteChecker, clientChecker)
	response := uc.CheckReadiness(context.Background())

	assert.True(t, response.Ready)
	assert.Len(t, response.Components, 2)
}

func TestHealthUseCase_CheckLiveness(t *testing.T) {
	uc := usecase.NewHealthUseCase()
	response := uc.CheckLiveness(context.Background())

	assert.True(t, response.Alive)
	assert.Contains(t, response.Message, "alive")
}

func TestHealthUseCase_GetHealthDetails(t *testing.T) {
	uc := usecase.NewHealthUseCase()
	details := uc.GetHealthDetails(context.Background())

	assert.Contains(t, details, "uptime_seconds")
	assert.Contains(t, details, "goroutines")
	assert.Contains(t, details, "memory_alloc_mb")
	assert.Contains(t, details, "go_version")
}

func TestHealthUseCase_Uptime(t *testing.T) {
	uc := usecase.NewHealthUseCase()
	uptime := uc.Uptime()

	assert.True(t, uptime >= 0)
}
