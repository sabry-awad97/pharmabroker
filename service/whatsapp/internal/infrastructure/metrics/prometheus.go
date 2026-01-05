package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Metrics holds all Prometheus metrics for the WhatsApp service
type Metrics struct {
	// HTTP metrics
	HTTPRequestsTotal    *prometheus.CounterVec
	HTTPRequestDuration  *prometheus.HistogramVec
	HTTPRequestsInFlight prometheus.Gauge

	// Message metrics
	MessagesTotal       *prometheus.CounterVec
	MessageSendDuration *prometheus.HistogramVec
	MessageQueueSize    prometheus.Gauge

	// Session metrics
	SessionsTotal      *prometheus.CounterVec
	SessionsActive     prometheus.Gauge
	SessionConnections *prometheus.CounterVec

	// WhatsApp client metrics
	WhatsAppConnected prometheus.Gauge
	WhatsAppErrors    *prometheus.CounterVec

	// Event publisher metrics
	EventsPublished *prometheus.CounterVec
	EventQueueSize  prometheus.Gauge
}

// Config holds configuration for metrics
type Config struct {
	Enabled   bool   `mapstructure:"enabled"`
	Path      string `mapstructure:"path"`      // Metrics endpoint path (default: /metrics)
	Namespace string `mapstructure:"namespace"` // Prometheus namespace (default: whatsapp)
}

// DefaultConfig returns the default metrics configuration
func DefaultConfig() Config {
	return Config{
		Enabled:   true,
		Path:      "/metrics",
		Namespace: "whatsapp",
	}
}

// NewMetrics creates a new Metrics instance with all metrics registered
func NewMetrics(cfg Config) *Metrics {
	namespace := cfg.Namespace
	if namespace == "" {
		namespace = "whatsapp"
	}

	return &Metrics{
		// HTTP metrics
		HTTPRequestsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "http_requests_total",
				Help:      "Total number of HTTP requests",
			},
			[]string{"method", "path", "status"},
		),
		HTTPRequestDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: namespace,
				Name:      "http_request_duration_seconds",
				Help:      "HTTP request duration in seconds",
				Buckets:   prometheus.DefBuckets,
			},
			[]string{"method", "path"},
		),
		HTTPRequestsInFlight: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "http_requests_in_flight",
				Help:      "Number of HTTP requests currently being processed",
			},
		),

		// Message metrics
		MessagesTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "messages_total",
				Help:      "Total number of messages processed",
			},
			[]string{"type", "status", "direction"},
		),
		MessageSendDuration: promauto.NewHistogramVec(
			prometheus.HistogramOpts{
				Namespace: namespace,
				Name:      "message_send_duration_seconds",
				Help:      "Message send duration in seconds",
				Buckets:   []float64{0.1, 0.25, 0.5, 1, 2.5, 5, 10},
			},
			[]string{"type"},
		),
		MessageQueueSize: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "message_queue_size",
				Help:      "Current number of messages in the queue",
			},
		),

		// Session metrics
		SessionsTotal: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "sessions_total",
				Help:      "Total number of session operations",
			},
			[]string{"operation"},
		),
		SessionsActive: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "sessions_active",
				Help:      "Number of active sessions",
			},
		),
		SessionConnections: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "session_connections_total",
				Help:      "Total number of session connection events",
			},
			[]string{"status"},
		),

		// WhatsApp client metrics
		WhatsAppConnected: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "whatsapp_connected",
				Help:      "Whether the WhatsApp client is connected (1) or not (0)",
			},
		),
		WhatsAppErrors: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "whatsapp_errors_total",
				Help:      "Total number of WhatsApp client errors",
			},
			[]string{"type"},
		),

		// Event publisher metrics
		EventsPublished: promauto.NewCounterVec(
			prometheus.CounterOpts{
				Namespace: namespace,
				Name:      "events_published_total",
				Help:      "Total number of events published",
			},
			[]string{"type"},
		),
		EventQueueSize: promauto.NewGauge(
			prometheus.GaugeOpts{
				Namespace: namespace,
				Name:      "event_queue_size",
				Help:      "Current number of events in the publish queue",
			},
		),
	}
}

// RecordHTTPRequest records an HTTP request metric
func (m *Metrics) RecordHTTPRequest(method, path, status string, duration float64) {
	m.HTTPRequestsTotal.WithLabelValues(method, path, status).Inc()
	m.HTTPRequestDuration.WithLabelValues(method, path).Observe(duration)
}

// RecordMessageSent records a sent message metric
func (m *Metrics) RecordMessageSent(msgType, status string, duration float64) {
	m.MessagesTotal.WithLabelValues(msgType, status, "outgoing").Inc()
	m.MessageSendDuration.WithLabelValues(msgType).Observe(duration)
}

// RecordMessageReceived records a received message metric
func (m *Metrics) RecordMessageReceived(msgType string) {
	m.MessagesTotal.WithLabelValues(msgType, "received", "incoming").Inc()
}

// RecordSessionOperation records a session operation metric
func (m *Metrics) RecordSessionOperation(operation string) {
	m.SessionsTotal.WithLabelValues(operation).Inc()
}

// RecordSessionConnection records a session connection event
func (m *Metrics) RecordSessionConnection(status string) {
	m.SessionConnections.WithLabelValues(status).Inc()
}

// SetActiveSessions sets the number of active sessions
func (m *Metrics) SetActiveSessions(count float64) {
	m.SessionsActive.Set(count)
}

// SetMessageQueueSize sets the current message queue size
func (m *Metrics) SetMessageQueueSize(size float64) {
	m.MessageQueueSize.Set(size)
}

// SetWhatsAppConnected sets the WhatsApp connection status
func (m *Metrics) SetWhatsAppConnected(connected bool) {
	if connected {
		m.WhatsAppConnected.Set(1)
	} else {
		m.WhatsAppConnected.Set(0)
	}
}

// RecordWhatsAppError records a WhatsApp client error
func (m *Metrics) RecordWhatsAppError(errorType string) {
	m.WhatsAppErrors.WithLabelValues(errorType).Inc()
}

// RecordEventPublished records a published event
func (m *Metrics) RecordEventPublished(eventType string) {
	m.EventsPublished.WithLabelValues(eventType).Inc()
}

// SetEventQueueSize sets the current event queue size
func (m *Metrics) SetEventQueueSize(size float64) {
	m.EventQueueSize.Set(size)
}

// IncrementInFlight increments the in-flight request counter
func (m *Metrics) IncrementInFlight() {
	m.HTTPRequestsInFlight.Inc()
}

// DecrementInFlight decrements the in-flight request counter
func (m *Metrics) DecrementInFlight() {
	m.HTTPRequestsInFlight.Dec()
}
