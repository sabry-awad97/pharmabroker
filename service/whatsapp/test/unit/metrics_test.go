package unit

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/metrics"
	httpPkg "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/testutil"
	"github.com/stretchr/testify/assert"
)

func TestNewMetrics(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{
		Enabled:   true,
		Path:      "/metrics",
		Namespace: "test_whatsapp",
	}

	m := metrics.NewMetrics(cfg)

	assert.NotNil(t, m)
	assert.NotNil(t, m.HTTPRequestsTotal)
	assert.NotNil(t, m.HTTPRequestDuration)
	assert.NotNil(t, m.HTTPRequestsInFlight)
	assert.NotNil(t, m.MessagesTotal)
	assert.NotNil(t, m.MessageSendDuration)
	assert.NotNil(t, m.MessageQueueSize)
	assert.NotNil(t, m.SessionsTotal)
	assert.NotNil(t, m.SessionsActive)
	assert.NotNil(t, m.SessionConnections)
	assert.NotNil(t, m.WhatsAppConnected)
	assert.NotNil(t, m.WhatsAppErrors)
	assert.NotNil(t, m.EventsPublished)
	assert.NotNil(t, m.EventQueueSize)
}

func TestMetrics_RecordHTTPRequest(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_http"}
	m := metrics.NewMetrics(cfg)

	m.RecordHTTPRequest("GET", "/api/sessions", "200", 0.5)

	count := testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/api/sessions", "200"))
	assert.Equal(t, float64(1), count)
}

func TestMetrics_RecordMessageSent(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_msg"}
	m := metrics.NewMetrics(cfg)

	m.RecordMessageSent("text", "sent", 1.5)

	count := testutil.ToFloat64(m.MessagesTotal.WithLabelValues("text", "sent", "outgoing"))
	assert.Equal(t, float64(1), count)
}

func TestMetrics_RecordMessageReceived(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_msg_recv"}
	m := metrics.NewMetrics(cfg)

	m.RecordMessageReceived("image")

	count := testutil.ToFloat64(m.MessagesTotal.WithLabelValues("image", "received", "incoming"))
	assert.Equal(t, float64(1), count)
}

func TestMetrics_RecordSessionOperation(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_session"}
	m := metrics.NewMetrics(cfg)

	m.RecordSessionOperation("create")
	m.RecordSessionOperation("create")
	m.RecordSessionOperation("delete")

	createCount := testutil.ToFloat64(m.SessionsTotal.WithLabelValues("create"))
	deleteCount := testutil.ToFloat64(m.SessionsTotal.WithLabelValues("delete"))

	assert.Equal(t, float64(2), createCount)
	assert.Equal(t, float64(1), deleteCount)
}

func TestMetrics_SetActiveSessions(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_active"}
	m := metrics.NewMetrics(cfg)

	m.SetActiveSessions(5)
	assert.Equal(t, float64(5), testutil.ToFloat64(m.SessionsActive))

	m.SetActiveSessions(3)
	assert.Equal(t, float64(3), testutil.ToFloat64(m.SessionsActive))
}

func TestMetrics_SetMessageQueueSize(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_queue"}
	m := metrics.NewMetrics(cfg)

	m.SetMessageQueueSize(100)
	assert.Equal(t, float64(100), testutil.ToFloat64(m.MessageQueueSize))
}

func TestMetrics_SetWhatsAppConnected(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_wa"}
	m := metrics.NewMetrics(cfg)

	m.SetWhatsAppConnected(true)
	assert.Equal(t, float64(1), testutil.ToFloat64(m.WhatsAppConnected))

	m.SetWhatsAppConnected(false)
	assert.Equal(t, float64(0), testutil.ToFloat64(m.WhatsAppConnected))
}

func TestMetrics_RecordWhatsAppError(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_wa_err"}
	m := metrics.NewMetrics(cfg)

	m.RecordWhatsAppError("connection")
	m.RecordWhatsAppError("connection")
	m.RecordWhatsAppError("send")

	connCount := testutil.ToFloat64(m.WhatsAppErrors.WithLabelValues("connection"))
	sendCount := testutil.ToFloat64(m.WhatsAppErrors.WithLabelValues("send"))

	assert.Equal(t, float64(2), connCount)
	assert.Equal(t, float64(1), sendCount)
}

func TestMetrics_RecordEventPublished(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_event"}
	m := metrics.NewMetrics(cfg)

	m.RecordEventPublished("message.sent")
	m.RecordEventPublished("message.sent")
	m.RecordEventPublished("session.connected")

	msgCount := testutil.ToFloat64(m.EventsPublished.WithLabelValues("message.sent"))
	sessCount := testutil.ToFloat64(m.EventsPublished.WithLabelValues("session.connected"))

	assert.Equal(t, float64(2), msgCount)
	assert.Equal(t, float64(1), sessCount)
}

func TestMetrics_InFlightRequests(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_inflight"}
	m := metrics.NewMetrics(cfg)

	m.IncrementInFlight()
	m.IncrementInFlight()
	assert.Equal(t, float64(2), testutil.ToFloat64(m.HTTPRequestsInFlight))

	m.DecrementInFlight()
	assert.Equal(t, float64(1), testutil.ToFloat64(m.HTTPRequestsInFlight))
}

func TestMetricsMiddleware(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_middleware"}
	m := metrics.NewMetrics(cfg)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(httpPkg.MetricsMiddleware(m))
	router.GET("/test", func(c *gin.Context) {
		c.String(200, "OK")
	})

	req := httptest.NewRequest("GET", "/test", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	count := testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/test", "200"))
	assert.Equal(t, float64(1), count)
}

func TestMetricsMiddleware_SkipsMetricsEndpoint(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_skip"}
	m := metrics.NewMetrics(cfg)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(httpPkg.MetricsMiddleware(m))
	router.GET("/metrics", func(c *gin.Context) {
		c.String(200, "metrics")
	})

	req := httptest.NewRequest("GET", "/metrics", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	count := testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/metrics", "200"))
	assert.Equal(t, float64(0), count)
}

func TestMetricsMiddleware_NormalizesPath(t *testing.T) {
	prometheus.DefaultRegisterer = prometheus.NewRegistry()

	cfg := metrics.Config{Namespace: "test_normalize"}
	m := metrics.NewMetrics(cfg)

	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(httpPkg.MetricsMiddleware(m))
	router.GET("/api/sessions/:id", func(c *gin.Context) {
		c.String(200, "OK")
	})

	req := httptest.NewRequest("GET", "/api/sessions/550e8400-e29b-41d4-a716-446655440000", nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)

	count := testutil.ToFloat64(m.HTTPRequestsTotal.WithLabelValues("GET", "/api/sessions/:id", "200"))
	assert.Equal(t, float64(1), count)
}

func TestDefaultConfig(t *testing.T) {
	cfg := metrics.DefaultConfig()

	assert.True(t, cfg.Enabled)
	assert.Equal(t, "/metrics", cfg.Path)
	assert.Equal(t, "whatsapp", cfg.Namespace)
}

func TestMetricsConfig_InConfig(t *testing.T) {
	cfg := &config.Config{
		Metrics: config.MetricsConfig{
			Enabled:   true,
			Path:      "/custom-metrics",
			Namespace: "custom",
		},
	}

	assert.True(t, cfg.Metrics.Enabled)
	assert.Equal(t, "/custom-metrics", cfg.Metrics.Path)
	assert.Equal(t, "custom", cfg.Metrics.Namespace)
}
