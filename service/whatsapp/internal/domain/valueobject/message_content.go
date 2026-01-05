package valueobject

import (
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// ContentType represents the type of message content
type ContentType string

const (
	ContentTypeText     ContentType = "text"
	ContentTypeImage    ContentType = "image"
	ContentTypeDocument ContentType = "document"
)

// IsValid checks if the content type is valid
func (ct ContentType) IsValid() bool {
	switch ct {
	case ContentTypeText, ContentTypeImage, ContentTypeDocument:
		return true
	}
	return false
}

// String returns the string representation of the content type
func (ct ContentType) String() string {
	return string(ct)
}

// MessageContent holds message content with type safety and validation
type MessageContent struct {
	contentType ContentType
	text        *string
	imageURL    *string
	docURL      *string
	caption     *string
}

// NewTextContent creates a MessageContent with text
func NewTextContent(text string) (*MessageContent, error) {
	if text == "" {
		return nil, errors.ErrEmptyContent
	}
	return &MessageContent{
		contentType: ContentTypeText,
		text:        &text,
	}, nil
}

// NewImageContent creates a MessageContent with image URL and optional caption
func NewImageContent(imageURL string, caption *string) (*MessageContent, error) {
	if imageURL == "" {
		return nil, errors.ErrEmptyContent
	}
	return &MessageContent{
		contentType: ContentTypeImage,
		imageURL:    &imageURL,
		caption:     caption,
	}, nil
}

// NewDocumentContent creates a MessageContent with document URL and optional caption
func NewDocumentContent(docURL string, caption *string) (*MessageContent, error) {
	if docURL == "" {
		return nil, errors.ErrEmptyContent
	}
	return &MessageContent{
		contentType: ContentTypeDocument,
		docURL:      &docURL,
		caption:     caption,
	}, nil
}

// Type returns the content type
func (mc *MessageContent) Type() ContentType {
	return mc.contentType
}

// Text returns the text content if this is a text message
func (mc *MessageContent) Text() *string {
	return mc.text
}

// ImageURL returns the image URL if this is an image message
func (mc *MessageContent) ImageURL() *string {
	return mc.imageURL
}

// DocURL returns the document URL if this is a document message
func (mc *MessageContent) DocURL() *string {
	return mc.docURL
}

// Caption returns the caption if present
func (mc *MessageContent) Caption() *string {
	return mc.caption
}

// IsEmpty checks if the content is empty
func (mc *MessageContent) IsEmpty() bool {
	return mc.text == nil && mc.imageURL == nil && mc.docURL == nil
}

// GetValue returns the primary content value based on type
func (mc *MessageContent) GetValue() string {
	switch mc.contentType {
	case ContentTypeText:
		if mc.text != nil {
			return *mc.text
		}
	case ContentTypeImage:
		if mc.imageURL != nil {
			return *mc.imageURL
		}
	case ContentTypeDocument:
		if mc.docURL != nil {
			return *mc.docURL
		}
	}
	return ""
}

// ToMap converts the content to a map for JSON serialization
func (mc *MessageContent) ToMap() map[string]interface{} {
	result := make(map[string]interface{})

	if mc.text != nil {
		result["text"] = *mc.text
	}
	if mc.imageURL != nil {
		result["image_url"] = *mc.imageURL
	}
	if mc.docURL != nil {
		result["doc_url"] = *mc.docURL
	}
	if mc.caption != nil {
		result["caption"] = *mc.caption
	}

	return result
}
