package websocket

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// PublisherConfig holds configuration for the WebSocket publisher
type PublisherConfig struct {
	URL            string
	APIKey         string // API key for authentication with Node.js API
	PingInterval   time.Duration
	PongTimeout    time.Duration
	ReconnectDelay time.Duration
	MaxReconnects  int // 0 = unlimited
	QueueSize      int
}

// DefaultPublisherConfig returns default configuration
func DefaultPublisherConfig() PublisherConfig {
	return PublisherConfig{
		URL:            "ws://localhost:3000/ws/whatsapp",
		PingInterval:   30 * time.Second,
		PongTimeout:    10 * time.Second,
		ReconnectDelay: 5 * time.Second,
		MaxReconnects:  0, // unlimited
		QueueSize:      1000,
	}
}

// GorillaEventPublisher implements EventPublisher using Gorilla WebSocket
type GorillaEventPublisher struct {
	config        PublisherConfig
	conn          *websocket.Conn
	mu            sync.RWMutex
	queue         chan *entity.Event
	done          chan struct{}
	connected     bool
	authenticated bool
	wg            sync.WaitGroup
}

// NewGorillaEventPublisher creates a new WebSocket event publisher
func NewGorillaEventPublisher(config PublisherConfig) *GorillaEventPublisher {
	return &GorillaEventPublisher{
		config: config,
		queue:  make(chan *entity.Event, config.QueueSize),
		done:   make(chan struct{}),
	}
}

// Connect establishes the WebSocket connection to the API server
func (p *GorillaEventPublisher) Connect(ctx context.Context) error {
	p.mu.Lock()
	if p.connected {
		p.mu.Unlock()
		return nil
	}
	p.mu.Unlock()

	err := p.connectWithRetry(ctx)
	if err != nil {
		return err
	}

	// Start background workers
	p.wg.Add(2)
	go p.writeLoop()
	go p.pingLoop()

	return nil
}

// connectWithRetry implements exponential backoff retry for connections
func (p *GorillaEventPublisher) connectWithRetry(ctx context.Context) error {
	var lastErr error
	delay := p.config.ReconnectDelay
	attempts := 0

	for {
		select {
		case <-ctx.Done():
			return errors.ErrConnectionFailed.WithCause(ctx.Err())
		default:
		}

		conn, _, err := websocket.DefaultDialer.DialContext(ctx, p.config.URL, nil)
		if err == nil {
			p.mu.Lock()
			p.conn = conn
			p.connected = true
			p.mu.Unlock()

			// Set up pong handler
			conn.SetPongHandler(func(string) error {
				return conn.SetReadDeadline(time.Now().Add(p.config.PongTimeout + p.config.PingInterval))
			})

			// Send authentication message
			if err := p.sendAuth(); err != nil {
				p.mu.Lock()
				_ = conn.Close()
				p.conn = nil
				p.connected = false
				p.mu.Unlock()
				lastErr = err
				attempts++
				if p.config.MaxReconnects > 0 && attempts >= p.config.MaxReconnects {
					return errors.ErrConnectionFailed.WithCause(lastErr)
				}
				select {
				case <-ctx.Done():
					return errors.ErrConnectionFailed.WithCause(ctx.Err())
				case <-time.After(delay):
					delay = calculateBackoff(delay, 10*time.Minute)
				}
				continue
			}

			return nil
		}

		lastErr = err
		attempts++

		// Check max reconnects (0 = unlimited)
		if p.config.MaxReconnects > 0 && attempts >= p.config.MaxReconnects {
			return errors.ErrConnectionFailed.WithCause(lastErr)
		}

		// Wait with exponential backoff
		select {
		case <-ctx.Done():
			return errors.ErrConnectionFailed.WithCause(ctx.Err())
		case <-time.After(delay):
			delay = calculateBackoff(delay, 10*time.Minute)
		}
	}
}

// Disconnect closes the WebSocket connection
func (p *GorillaEventPublisher) Disconnect(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.connected {
		return nil
	}

	// Signal workers to stop
	close(p.done)

	// Close connection
	if p.conn != nil {
		_ = p.conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		_ = p.conn.Close()
		p.conn = nil
	}

	p.connected = false

	// Wait for workers to finish
	p.wg.Wait()

	return nil
}

// Publish sends an event to the API server
func (p *GorillaEventPublisher) Publish(ctx context.Context, event *entity.Event) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case p.queue <- event:
		return nil
	default:
		// Queue is full, drop oldest event and add new one
		select {
		case <-p.queue:
			// Dropped oldest event
		default:
		}
		p.queue <- event
		return nil
	}
}

// IsConnected checks if the publisher is connected to the API server
func (p *GorillaEventPublisher) IsConnected() bool {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.connected
}

// QueueSize returns the number of events waiting to be sent
func (p *GorillaEventPublisher) QueueSize() int {
	return len(p.queue)
}

// writeLoop handles sending events from the queue
func (p *GorillaEventPublisher) writeLoop() {
	defer p.wg.Done()

	for {
		select {
		case <-p.done:
			// Flush remaining events before exiting
			p.flushQueue()
			return

		case event := <-p.queue:
			if err := p.sendEvent(event); err != nil {
				// Connection lost, try to reconnect
				p.handleDisconnect()
				// Re-queue the event
				select {
				case p.queue <- event:
				default:
					// Queue full, drop event
				}
			}
		}
	}
}

// pingLoop sends periodic ping messages for connection health monitoring
func (p *GorillaEventPublisher) pingLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.config.PingInterval)
	defer ticker.Stop()

	for {
		select {
		case <-p.done:
			return

		case <-ticker.C:
			p.mu.RLock()
			conn := p.conn
			connected := p.connected
			p.mu.RUnlock()

			if !connected || conn == nil {
				continue
			}

			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(p.config.PongTimeout)); err != nil {
				p.handleDisconnect()
			}
		}
	}
}

// sendAuth sends authentication message and waits for response
func (p *GorillaEventPublisher) sendAuth() error {
	p.mu.RLock()
	conn := p.conn
	p.mu.RUnlock()

	if conn == nil {
		return errors.ErrDisconnected
	}

	// Send auth message
	authMsg := map[string]string{
		"type":    "auth",
		"api_key": p.config.APIKey,
	}
	data, err := json.Marshal(authMsg)
	if err != nil {
		return err
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		return err
	}

	// Wait for auth response with timeout
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, message, err := conn.ReadMessage()
	if err != nil {
		return errors.ErrConnectionFailed.WithMessage("failed to read auth response")
	}

	var response struct {
		Type    string `json:"type"`
		Success bool   `json:"success"`
		Message string `json:"message,omitempty"`
	}
	if err := json.Unmarshal(message, &response); err != nil {
		return errors.ErrConnectionFailed.WithMessage("invalid auth response format")
	}

	if response.Type != "auth_response" || !response.Success {
		return errors.ErrConnectionFailed.WithMessage("authentication failed: " + response.Message)
	}

	p.mu.Lock()
	p.authenticated = true
	p.mu.Unlock()

	// Clear read deadline
	conn.SetReadDeadline(time.Time{})

	return nil
}

// sendEvent sends a single event over the WebSocket
func (p *GorillaEventPublisher) sendEvent(event *entity.Event) error {
	p.mu.RLock()
	conn := p.conn
	connected := p.connected
	p.mu.RUnlock()

	if !connected || conn == nil {
		return errors.ErrDisconnected
	}

	data, err := json.Marshal(event)
	if err != nil {
		return err
	}

	return conn.WriteMessage(websocket.TextMessage, data)
}

// flushQueue attempts to send all remaining events in the queue
func (p *GorillaEventPublisher) flushQueue() {
	for {
		select {
		case event := <-p.queue:
			_ = p.sendEvent(event)
		default:
			return
		}
	}
}

// handleDisconnect handles connection loss and attempts to reconnect
func (p *GorillaEventPublisher) handleDisconnect() {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.connected {
		return
	}

	// Close existing connection
	if p.conn != nil {
		_ = p.conn.Close()
		p.conn = nil
	}
	p.connected = false

	// Try to reconnect in background
	go p.reconnect()
}

// reconnect attempts to re-establish the connection
func (p *GorillaEventPublisher) reconnect() {
	delay := p.config.ReconnectDelay
	attempts := 0

	for {
		select {
		case <-p.done:
			return
		default:
		}

		p.mu.Lock()
		if p.connected {
			p.mu.Unlock()
			return
		}

		conn, _, err := websocket.DefaultDialer.Dial(p.config.URL, nil)
		if err == nil {
			p.conn = conn
			p.connected = true

			// Set up pong handler
			conn.SetPongHandler(func(string) error {
				return conn.SetReadDeadline(time.Now().Add(p.config.PongTimeout + p.config.PingInterval))
			})

			p.mu.Unlock()

			// Send authentication message after reconnect
			if err := p.sendAuth(); err != nil {
				p.handleDisconnect()
				attempts++
				if p.config.MaxReconnects > 0 && attempts >= p.config.MaxReconnects {
					return
				}
				select {
				case <-p.done:
					return
				case <-time.After(delay):
					delay = calculateBackoff(delay, 10*time.Minute)
				}
				continue
			}
			return
		}
		p.mu.Unlock()

		attempts++

		// Check max reconnects (0 = unlimited)
		if p.config.MaxReconnects > 0 && attempts >= p.config.MaxReconnects {
			return
		}

		// Wait with exponential backoff
		select {
		case <-p.done:
			return
		case <-time.After(delay):
			delay = calculateBackoff(delay, 10*time.Minute)
		}
	}
}

// GetQueuedEvents returns a copy of all queued events (for testing)
func (p *GorillaEventPublisher) GetQueuedEvents() []*entity.Event {
	events := make([]*entity.Event, 0, len(p.queue))

	// Drain and re-add events
	for {
		select {
		case event := <-p.queue:
			events = append(events, event)
		default:
			// Re-add events to queue
			for _, event := range events {
				select {
				case p.queue <- event:
				default:
				}
			}
			return events
		}
	}
}

// calculateBackoff calculates the next backoff delay with exponential growth
func calculateBackoff(currentDelay, maxDelay time.Duration) time.Duration {
	nextDelay := currentDelay * 2
	if nextDelay > maxDelay {
		return maxDelay
	}
	return nextDelay
}
