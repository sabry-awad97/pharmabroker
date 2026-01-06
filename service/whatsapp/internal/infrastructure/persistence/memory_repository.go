package persistence

import (
	"context"
	"sync"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// InMemorySessionRepository implements SessionRepository with in-memory storage
// Used for runtime session state tracking. State is lost on restart but
// whatsmeow's SQLite store preserves authentication, allowing auto-reconnect.
type InMemorySessionRepository struct {
	sessions map[string]*entity.Session
	mu       sync.RWMutex
}

// NewInMemorySessionRepository creates a new in-memory session repository
func NewInMemorySessionRepository() *InMemorySessionRepository {
	return &InMemorySessionRepository{
		sessions: make(map[string]*entity.Session),
	}
}

// Create creates a new session in the repository
func (r *InMemorySessionRepository) Create(ctx context.Context, session *entity.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.sessions[session.ID]; exists {
		return errors.ErrSessionExists
	}

	// Store a copy to prevent external mutation
	sessionCopy := *session
	r.sessions[session.ID] = &sessionCopy
	return nil
}

// GetByID retrieves a session by its ID
func (r *InMemorySessionRepository) GetByID(ctx context.Context, id string) (*entity.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	session, exists := r.sessions[id]
	if !exists {
		return nil, errors.ErrSessionNotFound
	}

	// Return a copy to prevent external mutation
	sessionCopy := *session
	return &sessionCopy, nil
}

// Update updates an existing session
func (r *InMemorySessionRepository) Update(ctx context.Context, session *entity.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.sessions[session.ID]; !exists {
		return errors.ErrSessionNotFound
	}

	// Store a copy to prevent external mutation
	sessionCopy := *session
	r.sessions[session.ID] = &sessionCopy
	return nil
}

// Delete removes a session by its ID
func (r *InMemorySessionRepository) Delete(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.sessions[id]; !exists {
		return errors.ErrSessionNotFound
	}

	delete(r.sessions, id)
	return nil
}

// UpdateStatus updates only the status of a session
func (r *InMemorySessionRepository) UpdateStatus(ctx context.Context, id string, status entity.Status) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	session, exists := r.sessions[id]
	if !exists {
		return errors.ErrSessionNotFound
	}

	session.SetStatus(status)
	return nil
}

// GetAll retrieves all sessions (for testing/debugging)
func (r *InMemorySessionRepository) GetAll(ctx context.Context) ([]*entity.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	sessions := make([]*entity.Session, 0, len(r.sessions))
	for _, session := range r.sessions {
		sessionCopy := *session
		sessions = append(sessions, &sessionCopy)
	}
	return sessions, nil
}

// Clear removes all sessions (for testing)
func (r *InMemorySessionRepository) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions = make(map[string]*entity.Session)
}
