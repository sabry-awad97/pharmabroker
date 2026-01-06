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

// GroupResponse represents a WhatsApp group in API responses
type GroupResponse struct {
	JID            string                `json:"jid"`
	Name           string                `json:"name"`
	Description    *string               `json:"description,omitempty"`
	AvatarURL      *string               `json:"avatar_url,omitempty"`
	IsAnnounce     bool                  `json:"is_announce"`
	IsLocked       bool                  `json:"is_locked"`
	IsEphemeral    bool                  `json:"is_ephemeral"`
	EphemeralTime  *int                  `json:"ephemeral_time,omitempty"`
	OwnerJID       *string               `json:"owner_jid,omitempty"`
	MemberCount    int                   `json:"member_count"`
	GroupCreatedAt *string               `json:"group_created_at,omitempty"`
	Participants   []ParticipantResponse `json:"participants,omitempty"`
}

// ParticipantResponse represents a WhatsApp group participant in API responses
type ParticipantResponse struct {
	JID         string  `json:"jid"`
	Role        string  `json:"role"`
	DisplayName *string `json:"display_name,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
}

// NewGroupResponse creates a GroupResponse from a domain Group entity
func NewGroupResponse(group *entity.Group) GroupResponse {
	response := GroupResponse{
		JID:         group.JID,
		Name:        group.Name,
		Description: group.Description,
		AvatarURL:   group.AvatarURL,
		IsAnnounce:  group.IsAnnounce,
		IsLocked:    group.IsLocked,
		IsEphemeral: group.IsEphemeral,
		OwnerJID:    group.OwnerJID,
		MemberCount: group.MemberCount,
	}

	if group.EphemeralTime != nil {
		response.EphemeralTime = group.EphemeralTime
	}

	if group.GroupCreatedAt != nil {
		t := group.GroupCreatedAt.Format(time.RFC3339)
		response.GroupCreatedAt = &t
	}

	// Convert participants
	if len(group.Participants) > 0 {
		response.Participants = make([]ParticipantResponse, len(group.Participants))
		for i, p := range group.Participants {
			response.Participants[i] = NewParticipantResponse(&p)
		}
	}

	return response
}

// NewParticipantResponse creates a ParticipantResponse from a domain Participant entity
func NewParticipantResponse(participant *entity.Participant) ParticipantResponse {
	return ParticipantResponse{
		JID:         participant.JID,
		Role:        participant.Role.String(),
		DisplayName: participant.DisplayName,
		AvatarURL:   participant.AvatarURL,
	}
}

// NewGroupListResponse creates a list of GroupResponse from domain Group entities
func NewGroupListResponse(groups []*entity.Group) []GroupResponse {
	result := make([]GroupResponse, len(groups))
	for i, group := range groups {
		result[i] = NewGroupResponse(group)
	}
	return result
}
