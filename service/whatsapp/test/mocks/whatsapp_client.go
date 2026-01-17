package mocks

import (
	"context"
	"sync"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// WhatsAppClientMock is a shared mock implementation of WhatsAppClient
type WhatsAppClientMock struct {
	mu                sync.RWMutex
	Connected         map[string]bool
	ConnectFn         func(ctx context.Context, sessionID string) error
	DisconnectFn      func(ctx context.Context, sessionID string) error
	SendFn            func(ctx context.Context, msg *entity.Message) error
	QRChan            chan repository.QREvent
	JIDMappings       map[string]string
	historySyncConfig map[string]struct {
		enabled, fullSync bool
		since             string
	}
}

// NewWhatsAppClientMock creates a new WhatsAppClientMock
func NewWhatsAppClientMock() *WhatsAppClientMock {
	return &WhatsAppClientMock{
		Connected:   make(map[string]bool),
		QRChan:      make(chan repository.QREvent, 10),
		JIDMappings: make(map[string]string),
		historySyncConfig: make(map[string]struct {
			enabled, fullSync bool
			since             string
		}),
	}
}

func (m *WhatsAppClientMock) Connect(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.ConnectFn != nil {
		return m.ConnectFn(ctx, sessionID)
	}
	m.Connected[sessionID] = true
	return nil
}

func (m *WhatsAppClientMock) Disconnect(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.DisconnectFn != nil {
		return m.DisconnectFn(ctx, sessionID)
	}
	delete(m.Connected, sessionID)
	return nil
}

func (m *WhatsAppClientMock) SendMessage(ctx context.Context, msg *entity.Message) error {
	if m.SendFn != nil {
		return m.SendFn(ctx, msg)
	}
	return nil
}

func (m *WhatsAppClientMock) GetQRChannel(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	return m.QRChan, nil
}

func (m *WhatsAppClientMock) RegisterEventHandler(handler repository.EventHandler) {}

func (m *WhatsAppClientMock) IsConnected(sessionID string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.Connected[sessionID]
}

func (m *WhatsAppClientMock) GetSessionJID(sessionID string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.Connected[sessionID] {
		if jid, ok := m.JIDMappings[sessionID]; ok {
			return jid, nil
		}
		return sessionID + "@s.whatsapp.net", nil
	}
	return "", errors.ErrSessionNotFound
}

func (m *WhatsAppClientMock) SetSessionJIDMapping(sessionID, jid string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.JIDMappings[sessionID] = jid
}

func (m *WhatsAppClientMock) SetHistorySyncConfig(sessionID string, enabled, fullSync bool, since string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.historySyncConfig[sessionID] = struct {
		enabled, fullSync bool
		since             string
	}{
		enabled:  enabled,
		fullSync: fullSync,
		since:    since,
	}
}

func (m *WhatsAppClientMock) GetHistorySyncConfig(sessionID string) (enabled, fullSync bool, since string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	config, exists := m.historySyncConfig[sessionID]
	if !exists {
		return false, false, ""
	}
	return config.enabled, config.fullSync, config.since
}
