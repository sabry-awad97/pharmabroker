package entity

import (
	"encoding/json"
	"time"
)

// ParticipantRole represents the role of a participant in a WhatsApp group
type ParticipantRole string

const (
	ParticipantRoleMember     ParticipantRole = "member"
	ParticipantRoleAdmin      ParticipantRole = "admin"
	ParticipantRoleSuperAdmin ParticipantRole = "superadmin"
)

// IsValid checks if the role is a valid ParticipantRole value
func (r ParticipantRole) IsValid() bool {
	switch r {
	case ParticipantRoleMember, ParticipantRoleAdmin, ParticipantRoleSuperAdmin:
		return true
	}
	return false
}

// String returns the string representation of the role
func (r ParticipantRole) String() string {
	return string(r)
}

// Group represents a WhatsApp group
type Group struct {
	ID            string  `json:"id"`
	JID           string  `json:"jid"`
	Name          string  `json:"name"`
	Description   *string `json:"description,omitempty"`
	AvatarURL     *string `json:"avatar_url,omitempty"`
	IsAnnounce    bool    `json:"is_announce"`
	IsLocked      bool    `json:"is_locked"`
	IsEphemeral   bool    `json:"is_ephemeral"`
	EphemeralTime *int    `json:"ephemeral_time,omitempty"`
	OwnerJID      *string `json:"owner_jid,omitempty"`
	SessionID     string  `json:"session_id"`
	// Filter support fields
	IsArchived bool       `json:"is_archived"`
	IsMuted    bool       `json:"is_muted"`
	MutedUntil *time.Time `json:"muted_until,omitempty"`
	// Metadata
	MemberCount    int           `json:"member_count"`
	CreatedAt      time.Time     `json:"created_at"`
	UpdatedAt      time.Time     `json:"updated_at"`
	GroupCreatedAt *time.Time    `json:"group_created_at,omitempty"`
	LastSyncAt     *time.Time    `json:"last_sync_at,omitempty"`
	Participants   []Participant `json:"participants,omitempty"`
}

// NewGroup creates a new Group with the given parameters
func NewGroup(id, jid, name, sessionID string) *Group {
	now := time.Now()
	return &Group{
		ID:          id,
		JID:         jid,
		Name:        name,
		SessionID:   sessionID,
		MemberCount: 0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

// SetDescription sets the group description
func (g *Group) SetDescription(description string) {
	g.Description = &description
	g.UpdatedAt = time.Now()
}

// SetAvatarURL sets the group avatar URL
func (g *Group) SetAvatarURL(avatarURL string) {
	g.AvatarURL = &avatarURL
	g.UpdatedAt = time.Now()
}

// SetOwnerJID sets the group owner JID
func (g *Group) SetOwnerJID(ownerJID string) {
	g.OwnerJID = &ownerJID
	g.UpdatedAt = time.Now()
}

// SetMemberCount sets the member count
func (g *Group) SetMemberCount(count int) {
	g.MemberCount = count
	g.UpdatedAt = time.Now()
}

// SetLastSyncAt sets the last sync timestamp
func (g *Group) SetLastSyncAt(t time.Time) {
	g.LastSyncAt = &t
	g.UpdatedAt = time.Now()
}

// MarshalJSON implements json.Marshaler
func (g *Group) MarshalJSON() ([]byte, error) {
	type Alias Group

	var groupCreatedAt *string
	if g.GroupCreatedAt != nil {
		t := g.GroupCreatedAt.Format(time.RFC3339)
		groupCreatedAt = &t
	}

	var lastSyncAt *string
	if g.LastSyncAt != nil {
		t := g.LastSyncAt.Format(time.RFC3339)
		lastSyncAt = &t
	}

	var mutedUntil *string
	if g.MutedUntil != nil {
		t := g.MutedUntil.Format(time.RFC3339)
		mutedUntil = &t
	}

	return json.Marshal(&struct {
		*Alias
		CreatedAt      string  `json:"created_at"`
		UpdatedAt      string  `json:"updated_at"`
		GroupCreatedAt *string `json:"group_created_at,omitempty"`
		LastSyncAt     *string `json:"last_sync_at,omitempty"`
		MutedUntil     *string `json:"muted_until,omitempty"`
	}{
		Alias:          (*Alias)(g),
		CreatedAt:      g.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      g.UpdatedAt.Format(time.RFC3339),
		GroupCreatedAt: groupCreatedAt,
		LastSyncAt:     lastSyncAt,
		MutedUntil:     mutedUntil,
	})
}

// Participant represents a participant in a WhatsApp group
type Participant struct {
	ID          string          `json:"id"`
	JID         string          `json:"jid"`
	Role        ParticipantRole `json:"role"`
	DisplayName *string         `json:"display_name,omitempty"`
	AvatarURL   *string         `json:"avatar_url,omitempty"`
	GroupID     string          `json:"group_id"`
	JoinedAt    time.Time       `json:"joined_at"`
	AddedBy     *string         `json:"added_by,omitempty"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

// NewParticipant creates a new Participant with the given parameters
func NewParticipant(id, jid, groupID string, role ParticipantRole) *Participant {
	now := time.Now()
	return &Participant{
		ID:        id,
		JID:       jid,
		Role:      role,
		GroupID:   groupID,
		JoinedAt:  now,
		UpdatedAt: now,
	}
}

// SetDisplayName sets the participant display name
func (p *Participant) SetDisplayName(displayName string) {
	p.DisplayName = &displayName
	p.UpdatedAt = time.Now()
}

// SetAvatarURL sets the participant avatar URL
func (p *Participant) SetAvatarURL(avatarURL string) {
	p.AvatarURL = &avatarURL
	p.UpdatedAt = time.Now()
}

// SetAddedBy sets who added this participant
func (p *Participant) SetAddedBy(addedBy string) {
	p.AddedBy = &addedBy
	p.UpdatedAt = time.Now()
}

// IsAdmin returns true if the participant is an admin or superadmin
func (p *Participant) IsAdmin() bool {
	return p.Role == ParticipantRoleAdmin || p.Role == ParticipantRoleSuperAdmin
}

// MarshalJSON implements json.Marshaler
func (p *Participant) MarshalJSON() ([]byte, error) {
	type Alias Participant
	return json.Marshal(&struct {
		*Alias
		JoinedAt  string `json:"joined_at"`
		UpdatedAt string `json:"updated_at"`
	}{
		Alias:     (*Alias)(p),
		JoinedAt:  p.JoinedAt.Format(time.RFC3339),
		UpdatedAt: p.UpdatedAt.Format(time.RFC3339),
	})
}
