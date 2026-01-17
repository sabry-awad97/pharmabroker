package mocks

import (
	"context"
	"sync"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// SessionRepositoryMock is a shared mock implementation of SessionRepository
type SessionRepositoryMock struct {
	mu       sync.RWMutex
	Sessions map[string]*entity.Session // Public for test access
	CreateFn func(ctx context.Context, session *entity.Session) error
	GetFn    func(ctx context.Context, id string) (*entity.Session, error)
	UpdateFn func(ctx context.Context, session *entity.Session) error
	DeleteFn func(ctx context.Context, id string) error
}

// NewSessionRepositoryMock creates a new SessionRepositoryMock
func NewSessionRepositoryMock() *SessionRepositoryMock {
	return &SessionRepositoryMock{
		Sessions: make(map[string]*entity.Session),
	}
}

func (m *SessionRepositoryMock) Create(ctx context.Context, session *entity.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.CreateFn != nil {
		return m.CreateFn(ctx, session)
	}
	m.Sessions[session.ID] = session
	return nil
}

func (m *SessionRepositoryMock) GetByID(ctx context.Context, id string) (*entity.Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.GetFn != nil {
		return m.GetFn(ctx, id)
	}
	if session, ok := m.Sessions[id]; ok {
		return session, nil
	}
	return nil, errors.ErrSessionNotFound
}

func (m *SessionRepositoryMock) Update(ctx context.Context, session *entity.Session) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.UpdateFn != nil {
		return m.UpdateFn(ctx, session)
	}
	m.Sessions[session.ID] = session
	return nil
}

func (m *SessionRepositoryMock) Delete(ctx context.Context, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.DeleteFn != nil {
		return m.DeleteFn(ctx, id)
	}
	if _, ok := m.Sessions[id]; !ok {
		return errors.ErrSessionNotFound
	}
	delete(m.Sessions, id)
	return nil
}

func (m *SessionRepositoryMock) UpdateStatus(ctx context.Context, id string, status entity.Status) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.Sessions[id]; ok {
		s.SetStatus(status)
		return nil
	}
	return errors.ErrSessionNotFound
}

// GetSessions returns all sessions (for testing)
func (m *SessionRepositoryMock) GetSessions() map[string]*entity.Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make(map[string]*entity.Session, len(m.Sessions))
	for k, v := range m.Sessions {
		result[k] = v
	}
	return result
}
