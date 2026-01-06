package persistence

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	_ "modernc.org/sqlite"
)

// SQLiteSessionRepository implements SessionRepository with SQLite
// DEPRECATED: Session management is now handled by Node.js API with PostgreSQL.
// This repository is kept for backward compatibility and WhatsApp client state tracking.
// TODO: Remove in next major version - migrate to using Node.js API as source of truth.
type SQLiteSessionRepository struct {
	db *sql.DB
	mu sync.RWMutex // Mutex for write operations to handle SQLite's single-writer limitation
}

// NewSQLiteSessionRepository creates a new SQLite session repository
func NewSQLiteSessionRepository(dsn string) (*SQLiteSessionRepository, error) {
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to open database")
	}

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to ping database")
	}

	repo := &SQLiteSessionRepository{db: db}

	// Initialize schema
	if err := repo.initSchema(); err != nil {
		return nil, err
	}

	return repo, nil
}

// initSchema creates the sessions table if it doesn't exist
func (r *SQLiteSessionRepository) initSchema() error {
	query := `
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			jid TEXT,
			name TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_sessions_jid ON sessions(jid);
		CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
	`

	_, err := r.db.Exec(query)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to initialize schema")
	}

	return nil
}

// Create creates a new session in the repository
func (r *SQLiteSessionRepository) Create(ctx context.Context, session *entity.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	query := `
		INSERT INTO sessions (id, jid, name, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`

	_, err := r.db.ExecContext(ctx, query,
		session.ID,
		session.JID,
		session.Name,
		string(session.Status),
		session.CreatedAt.Format(time.RFC3339),
		session.UpdatedAt.Format(time.RFC3339),
	)

	if err != nil {
		// Check for duplicate key error
		if isDuplicateKeyError(err) {
			return errors.ErrSessionExists.WithCause(err)
		}
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to create session")
	}

	return nil
}

// GetByID retrieves a session by its ID
func (r *SQLiteSessionRepository) GetByID(ctx context.Context, id string) (*entity.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	query := `
		SELECT id, jid, name, status, created_at, updated_at
		FROM sessions
		WHERE id = ?
	`

	row := r.db.QueryRowContext(ctx, query, id)
	return r.scanSession(row)
}

// GetByJID retrieves a session by its WhatsApp JID
func (r *SQLiteSessionRepository) GetByJID(ctx context.Context, jid string) (*entity.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	query := `
		SELECT id, jid, name, status, created_at, updated_at
		FROM sessions
		WHERE jid = ?
	`

	row := r.db.QueryRowContext(ctx, query, jid)
	return r.scanSession(row)
}

// GetAll retrieves all sessions
func (r *SQLiteSessionRepository) GetAll(ctx context.Context) ([]*entity.Session, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	query := `
		SELECT id, jid, name, status, created_at, updated_at
		FROM sessions
		ORDER BY created_at DESC
	`

	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to query sessions")
	}
	defer rows.Close()

	var sessions []*entity.Session
	for rows.Next() {
		session, err := r.scanSessionFromRows(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}

	if err := rows.Err(); err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("error iterating sessions")
	}

	return sessions, nil
}

// Update updates an existing session
func (r *SQLiteSessionRepository) Update(ctx context.Context, session *entity.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	query := `
		UPDATE sessions
		SET jid = ?, name = ?, status = ?, updated_at = ?
		WHERE id = ?
	`

	result, err := r.db.ExecContext(ctx, query,
		session.JID,
		session.Name,
		string(session.Status),
		session.UpdatedAt.Format(time.RFC3339),
		session.ID,
	)

	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to update session")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to get rows affected")
	}

	if rowsAffected == 0 {
		return errors.ErrSessionNotFound
	}

	return nil
}

// UpdateStatus updates only the status of a session
func (r *SQLiteSessionRepository) UpdateStatus(ctx context.Context, id string, status entity.Status) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	query := `
		UPDATE sessions
		SET status = ?, updated_at = ?
		WHERE id = ?
	`

	result, err := r.db.ExecContext(ctx, query,
		string(status),
		time.Now().Format(time.RFC3339),
		id,
	)

	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to update session status")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to get rows affected")
	}

	if rowsAffected == 0 {
		return errors.ErrSessionNotFound
	}

	return nil
}

// Delete removes a session by its ID
func (r *SQLiteSessionRepository) Delete(ctx context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	query := `DELETE FROM sessions WHERE id = ?`

	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to delete session")
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return errors.ErrDatabaseError.WithCause(err).WithMessage("failed to get rows affected")
	}

	if rowsAffected == 0 {
		return errors.ErrSessionNotFound
	}

	return nil
}

// Close closes the database connection
func (r *SQLiteSessionRepository) Close() error {
	return r.db.Close()
}

// scanSession scans a single row into a Session
func (r *SQLiteSessionRepository) scanSession(row *sql.Row) (*entity.Session, error) {
	var session entity.Session
	var status string
	var createdAt, updatedAt string

	err := row.Scan(
		&session.ID,
		&session.JID,
		&session.Name,
		&status,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.ErrSessionNotFound
		}
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to scan session")
	}

	session.Status = entity.Status(status)

	// Parse timestamps
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		session.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339, updatedAt); err == nil {
		session.UpdatedAt = t
	}

	return &session, nil
}

// scanSessionFromRows scans a row from rows into a Session
func (r *SQLiteSessionRepository) scanSessionFromRows(rows *sql.Rows) (*entity.Session, error) {
	var session entity.Session
	var status string
	var createdAt, updatedAt string

	err := rows.Scan(
		&session.ID,
		&session.JID,
		&session.Name,
		&status,
		&createdAt,
		&updatedAt,
	)

	if err != nil {
		return nil, errors.ErrDatabaseError.WithCause(err).WithMessage("failed to scan session")
	}

	session.Status = entity.Status(status)

	// Parse timestamps
	if t, err := time.Parse(time.RFC3339, createdAt); err == nil {
		session.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339, updatedAt); err == nil {
		session.UpdatedAt = t
	}

	return &session, nil
}

// isDuplicateKeyError checks if the error is a duplicate key error
func isDuplicateKeyError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return containsString(errStr, "UNIQUE constraint failed") ||
		containsString(errStr, "duplicate key") ||
		containsString(errStr, "PRIMARY KEY constraint failed")
}

// containsString checks if s contains substr
func containsString(s, substr string) bool {
	return len(s) >= len(substr) && findSubstr(s, substr)
}

func findSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// DB returns the underlying database connection (for testing)
func (r *SQLiteSessionRepository) DB() *sql.DB {
	return r.db
}

// NewSQLiteSessionRepositoryWithDB creates a repository with an existing DB connection (for testing)
func NewSQLiteSessionRepositoryWithDB(db *sql.DB) (*SQLiteSessionRepository, error) {
	repo := &SQLiteSessionRepository{db: db}
	if err := repo.initSchema(); err != nil {
		return nil, err
	}
	return repo, nil
}

// CreateDSN creates a DSN string with WAL mode enabled
func CreateDSN(path string, busyTimeout int) string {
	return fmt.Sprintf("%s?_journal_mode=WAL&_busy_timeout=%d", path, busyTimeout)
}
