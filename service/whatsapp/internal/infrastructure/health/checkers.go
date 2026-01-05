// Package health provides health checking implementations for various components.
package health

import (
	"context"
	"database/sql"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// SQLiteHealthChecker checks the health of the SQLite database connection.
type SQLiteHealthChecker struct {
	db      *sql.DB
	timeout time.Duration
}

// NewSQLiteHealthChecker creates a new SQLite health checker.
func NewSQLiteHealthChecker(db *sql.DB) *SQLiteHealthChecker {
	return &SQLiteHealthChecker{
		db:      db,
		timeout: 5 * time.Second,
	}
}

// NewSQLiteHealthCheckerWithTimeout creates a new SQLite health checker with custom timeout.
func NewSQLiteHealthCheckerWithTimeout(db *sql.DB, timeout time.Duration) *SQLiteHealthChecker {
	return &SQLiteHealthChecker{
		db:      db,
		timeout: timeout,
	}
}

// Check performs a health check on the SQLite database.
func (c *SQLiteHealthChecker) Check(ctx context.Context) repository.HealthStatus {
	status := repository.HealthStatus{
		Name:    c.Name(),
		Details: make(map[string]interface{}),
	}

	if c.db == nil {
		status.Healthy = false
		status.Message = "database connection is nil"
		return status
	}

	// Create a context with timeout
	checkCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	// Ping the database
	start := time.Now()
	err := c.db.PingContext(checkCtx)
	latency := time.Since(start)

	status.Details["latency_ms"] = latency.Milliseconds()

	if err != nil {
		status.Healthy = false
		status.Message = "database ping failed: " + err.Error()
		return status
	}

	// Get database stats
	stats := c.db.Stats()
	status.Details["open_connections"] = stats.OpenConnections
	status.Details["in_use"] = stats.InUse
	status.Details["idle"] = stats.Idle

	status.Healthy = true
	status.Message = "database is healthy"

	return status
}

// Name returns the name of this health checker.
func (c *SQLiteHealthChecker) Name() string {
	return "sqlite"
}

// WhatsAppClientHealthChecker checks the health of the WhatsApp client.
type WhatsAppClientHealthChecker struct {
	client repository.WhatsAppClient
}

// NewWhatsAppClientHealthChecker creates a new WhatsApp client health checker.
func NewWhatsAppClientHealthChecker(client repository.WhatsAppClient) *WhatsAppClientHealthChecker {
	return &WhatsAppClientHealthChecker{
		client: client,
	}
}

// Check performs a health check on the WhatsApp client.
func (c *WhatsAppClientHealthChecker) Check(ctx context.Context) repository.HealthStatus {
	status := repository.HealthStatus{
		Name:    c.Name(),
		Details: make(map[string]interface{}),
	}

	if c.client == nil {
		status.Healthy = false
		status.Message = "WhatsApp client is nil"
		return status
	}

	// The client is considered healthy if it's initialized
	// Individual session connections are checked separately
	status.Healthy = true
	status.Message = "WhatsApp client is initialized"

	return status
}

// Name returns the name of this health checker.
func (c *WhatsAppClientHealthChecker) Name() string {
	return "whatsapp_client"
}

// EventPublisherHealthChecker checks the health of the event publisher.
type EventPublisherHealthChecker struct {
	publisher repository.EventPublisher
}

// NewEventPublisherHealthChecker creates a new event publisher health checker.
func NewEventPublisherHealthChecker(publisher repository.EventPublisher) *EventPublisherHealthChecker {
	return &EventPublisherHealthChecker{
		publisher: publisher,
	}
}

// Check performs a health check on the event publisher.
func (c *EventPublisherHealthChecker) Check(ctx context.Context) repository.HealthStatus {
	status := repository.HealthStatus{
		Name:    c.Name(),
		Details: make(map[string]interface{}),
	}

	if c.publisher == nil {
		status.Healthy = false
		status.Message = "event publisher is nil"
		return status
	}

	// Check if connected
	isConnected := c.publisher.IsConnected()
	status.Details["connected"] = isConnected
	status.Details["queue_size"] = c.publisher.QueueSize()

	if !isConnected {
		status.Healthy = false
		status.Message = "event publisher is not connected"
		return status
	}

	status.Healthy = true
	status.Message = "event publisher is connected"

	return status
}

// Name returns the name of this health checker.
func (c *EventPublisherHealthChecker) Name() string {
	return "event_publisher"
}

// CompositeHealthChecker aggregates multiple health checkers.
type CompositeHealthChecker struct {
	checkers []repository.HealthChecker
}

// NewCompositeHealthChecker creates a new composite health checker.
func NewCompositeHealthChecker(checkers ...repository.HealthChecker) *CompositeHealthChecker {
	return &CompositeHealthChecker{
		checkers: checkers,
	}
}

// AddChecker adds a health checker to the composite.
func (c *CompositeHealthChecker) AddChecker(checker repository.HealthChecker) {
	c.checkers = append(c.checkers, checker)
}

// CheckAll performs health checks on all registered checkers.
func (c *CompositeHealthChecker) CheckAll(ctx context.Context) repository.ReadinessResponse {
	response := repository.ReadinessResponse{
		Ready:      true,
		Components: make([]repository.HealthStatus, 0, len(c.checkers)),
	}

	for _, checker := range c.checkers {
		status := checker.Check(ctx)
		response.Components = append(response.Components, status)

		if !status.Healthy {
			response.Ready = false
		}
	}

	return response
}

// Check performs a health check (implements HealthChecker interface).
func (c *CompositeHealthChecker) Check(ctx context.Context) repository.HealthStatus {
	response := c.CheckAll(ctx)

	status := repository.HealthStatus{
		Name:    c.Name(),
		Healthy: response.Ready,
		Details: make(map[string]interface{}),
	}

	if response.Ready {
		status.Message = "all components are healthy"
	} else {
		status.Message = "one or more components are unhealthy"
	}

	// Add component statuses to details
	componentStatuses := make(map[string]bool)
	for _, comp := range response.Components {
		componentStatuses[comp.Name] = comp.Healthy
	}
	status.Details["components"] = componentStatuses

	return status
}

// Name returns the name of this health checker.
func (c *CompositeHealthChecker) Name() string {
	return "composite"
}
