package mocks

import (
	"context"
	"sync"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
)

// EventPublisherMock is a shared mock implementation of EventPublisher
type EventPublisherMock struct {
	mu             sync.RWMutex
	IsConnectedVal bool
	Events         []*entity.Event
	PublishFn      func(ctx context.Context, event *entity.Event) error
}

// NewEventPublisherMock creates a new EventPublisherMock
func NewEventPublisherMock() *EventPublisherMock {
	return &EventPublisherMock{
		IsConnectedVal: true,
		Events:         make([]*entity.Event, 0),
	}
}

func (m *EventPublisherMock) Publish(ctx context.Context, event *entity.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.PublishFn != nil {
		return m.PublishFn(ctx, event)
	}
	m.Events = append(m.Events, event)
	return nil
}

func (m *EventPublisherMock) Connect(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsConnectedVal = true
	return nil
}

func (m *EventPublisherMock) Disconnect(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.IsConnectedVal = false
	return nil
}

func (m *EventPublisherMock) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.IsConnectedVal
}

func (m *EventPublisherMock) QueueSize() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.Events)
}

// GetEvents returns a copy of all events (thread-safe)
func (m *EventPublisherMock) GetEvents() []*entity.Event {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]*entity.Event, len(m.Events))
	copy(result, m.Events)
	return result
}
