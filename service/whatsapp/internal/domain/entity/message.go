package entity

import (
	"encoding/json"
	"time"
)

// MessageType represents the type of WhatsApp message
type MessageType string

const (
	MessageTypeText     MessageType = "text"
	MessageTypeImage    MessageType = "image"
	MessageTypeDocument MessageType = "document"
	MessageTypeAudio    MessageType = "audio"
	MessageTypeVideo    MessageType = "video"
	MessageTypeSticker  MessageType = "sticker"
)

// IsValid checks if the message type is valid
func (mt MessageType) IsValid() bool {
	switch mt {
	case MessageTypeText, MessageTypeImage, MessageTypeDocument, MessageTypeAudio, MessageTypeVideo, MessageTypeSticker:
		return true
	}
	return false
}

// String returns the string representation of the message type
func (mt MessageType) String() string {
	return string(mt)
}

// MessageStatus represents the delivery status of a message
type MessageStatus string

const (
	MessageStatusPending   MessageStatus = "pending"
	MessageStatusSent      MessageStatus = "sent"
	MessageStatusDelivered MessageStatus = "delivered"
	MessageStatusRead      MessageStatus = "read"
	MessageStatusFailed    MessageStatus = "failed"
)

// IsValid checks if the message status is valid
func (ms MessageStatus) IsValid() bool {
	switch ms {
	case MessageStatusPending, MessageStatusSent, MessageStatusDelivered, MessageStatusRead, MessageStatusFailed:
		return true
	}
	return false
}

// String returns the string representation of the message status
func (ms MessageStatus) String() string {
	return string(ms)
}

// MessageContent holds message content with type safety
type MessageContent struct {
	Text     *string `json:"text,omitempty"`
	ImageURL *string `json:"image_url,omitempty"`
	DocURL   *string `json:"doc_url,omitempty"`
	Caption  *string `json:"caption,omitempty"`
}

// NewTextContent creates a MessageContent with text
func NewTextContent(text string) MessageContent {
	return MessageContent{Text: &text}
}

// NewImageContent creates a MessageContent with image URL and optional caption
func NewImageContent(imageURL string, caption *string) MessageContent {
	return MessageContent{ImageURL: &imageURL, Caption: caption}
}

// NewDocumentContent creates a MessageContent with document URL and optional caption
func NewDocumentContent(docURL string, caption *string) MessageContent {
	return MessageContent{DocURL: &docURL, Caption: caption}
}

// IsEmpty checks if the content is empty
func (mc MessageContent) IsEmpty() bool {
	return mc.Text == nil && mc.ImageURL == nil && mc.DocURL == nil
}

// GetContentType returns the type of content based on what's populated
func (mc MessageContent) GetContentType() MessageType {
	if mc.Text != nil {
		return MessageTypeText
	}
	if mc.ImageURL != nil {
		return MessageTypeImage
	}
	if mc.DocURL != nil {
		return MessageTypeDocument
	}
	return MessageTypeText // default
}

// Message represents a WhatsApp message
type Message struct {
	ID        string         `json:"id"`
	SessionID string         `json:"session_id"`
	From      string         `json:"from"`
	To        string         `json:"to"`
	Content   MessageContent `json:"content"`
	Type      MessageType    `json:"type"`
	Status    MessageStatus  `json:"status"`
	Timestamp time.Time      `json:"timestamp"`
}

// NewMessage creates a new Message
func NewMessage(id, sessionID, from, to string, content MessageContent, msgType MessageType) *Message {
	return &Message{
		ID:        id,
		SessionID: sessionID,
		From:      from,
		To:        to,
		Content:   content,
		Type:      msgType,
		Status:    MessageStatusPending,
		Timestamp: time.Now(),
	}
}

// SetStatus updates the message status
func (m *Message) SetStatus(status MessageStatus) {
	m.Status = status
}

// IsSent returns true if the message has been sent
func (m *Message) IsSent() bool {
	return m.Status == MessageStatusSent || m.Status == MessageStatusDelivered || m.Status == MessageStatusRead
}

// MarshalJSON implements json.Marshaler
func (m *Message) MarshalJSON() ([]byte, error) {
	type Alias Message
	return json.Marshal(&struct {
		*Alias
		Timestamp string `json:"timestamp"`
	}{
		Alias:     (*Alias)(m),
		Timestamp: m.Timestamp.Format(time.RFC3339),
	})
}
