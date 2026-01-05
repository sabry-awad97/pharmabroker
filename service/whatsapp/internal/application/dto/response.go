package dto

import (
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
)

// APIResponse is the standard response wrapper for all API responses
type APIResponse[T any] struct {
	Success bool   `json:"success"`
	Data    T      `json:"data,omitempty"`
	Error   *Error `json:"error,omitempty"`
}

// Error represents a structured error response
type Error struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Details map[string]string `json:"details,omitempty"`
}

// NewSuccessResponse creates a successful API response
func NewSuccessResponse[T any](data T) APIResponse[T] {
	return APIResponse[T]{
		Success: true,
		Data:    data,
	}
}

// NewErrorResponse creates an error API response
func NewErrorResponse[T any](code, message string, details map[string]string) APIResponse[T] {
	return APIResponse[T]{
		Success: false,
		Error: &Error{
			Code:    code,
			Message: message,
			Details: details,
		},
	}
}

// NewErrorResponseFromError creates an error API response from an Error struct
func NewErrorResponseFromError[T any](err *Error) APIResponse[T] {
	return APIResponse[T]{
		Success: false,
		Error:   err,
	}
}

// SessionResponse represents a session in API responses
type SessionResponse struct {
	ID        string `json:"id"`
	JID       string `json:"jid,omitempty"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// NewSessionResponse creates a SessionResponse from a domain Session entity
func NewSessionResponse(session *entity.Session) SessionResponse {
	return SessionResponse{
		ID:        session.ID,
		JID:       session.JID,
		Name:      session.Name,
		Status:    session.Status.String(),
		CreatedAt: session.CreatedAt.Format(time.RFC3339),
		UpdatedAt: session.UpdatedAt.Format(time.RFC3339),
	}
}

// NewSessionListResponse creates a list of SessionResponse from domain Session entities
func NewSessionListResponse(sessions []*entity.Session) []SessionResponse {
	result := make([]SessionResponse, len(sessions))
	for i, session := range sessions {
		result[i] = NewSessionResponse(session)
	}
	return result
}
