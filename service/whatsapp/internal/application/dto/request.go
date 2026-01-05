package dto

// CreateSessionRequest represents a request to create a new WhatsApp session
type CreateSessionRequest struct {
	Name string `json:"name" validate:"required,min=1,max=100"`
}

// SendMessageRequest represents a request to send a WhatsApp message
type SendMessageRequest struct {
	SessionID string                  `json:"session_id" validate:"required,uuid"`
	To        string                  `json:"to" validate:"required,e164"`
	Type      string                  `json:"type" validate:"required,oneof=text image document audio video"`
	Content   SendMessageContentInput `json:"content" validate:"required"`
}

// SendMessageContentInput represents the content of a message to send
type SendMessageContentInput struct {
	Text     *string `json:"text,omitempty" validate:"required_if=Type text,omitempty,max=4096"`
	ImageURL *string `json:"image_url,omitempty" validate:"required_if=Type image,omitempty,url"`
	DocURL   *string `json:"doc_url,omitempty" validate:"required_if=Type document,omitempty,url"`
	AudioURL *string `json:"audio_url,omitempty" validate:"required_if=Type audio,omitempty,url"`
	VideoURL *string `json:"video_url,omitempty" validate:"required_if=Type video,omitempty,url"`
	Caption  *string `json:"caption,omitempty" validate:"omitempty,max=1024"`
	Filename *string `json:"filename,omitempty" validate:"omitempty,max=255"`
}

// GetSessionRequest represents a request to get a session by ID
type GetSessionRequest struct {
	ID string `json:"id" validate:"required,uuid"`
}

// DeleteSessionRequest represents a request to delete a session
type DeleteSessionRequest struct {
	ID string `json:"id" validate:"required,uuid"`
}

// StartQRAuthRequest represents a request to start QR authentication
type StartQRAuthRequest struct {
	SessionID string `json:"session_id" validate:"required,uuid"`
}

// Validate validates the SendMessageRequest based on message type
func (r *SendMessageRequest) Validate() error {
	// Additional validation logic beyond struct tags
	switch r.Type {
	case "text":
		if r.Content.Text == nil || *r.Content.Text == "" {
			return ErrTextRequired
		}
	case "image":
		if r.Content.ImageURL == nil || *r.Content.ImageURL == "" {
			return ErrImageURLRequired
		}
	case "document":
		if r.Content.DocURL == nil || *r.Content.DocURL == "" {
			return ErrDocURLRequired
		}
	case "audio":
		if r.Content.AudioURL == nil || *r.Content.AudioURL == "" {
			return ErrAudioURLRequired
		}
	case "video":
		if r.Content.VideoURL == nil || *r.Content.VideoURL == "" {
			return ErrVideoURLRequired
		}
	}
	return nil
}
