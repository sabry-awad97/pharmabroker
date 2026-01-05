package repository

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// MediaUploader defines operations for uploading media to WhatsApp servers
type MediaUploader interface {
	// UploadImage uploads an image from a URL to WhatsApp servers
	// Returns the upload result containing the WhatsApp media URL and encryption keys
	UploadImage(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)

	// UploadDocument uploads a document from a URL to WhatsApp servers
	// The filename parameter is used as the display name for the document
	UploadDocument(ctx context.Context, sessionID string, url string, filename string) (*entity.MediaUploadResult, error)

	// UploadAudio uploads an audio file from a URL to WhatsApp servers
	UploadAudio(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)

	// UploadVideo uploads a video from a URL to WhatsApp servers
	UploadVideo(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)

	// Upload is a generic upload method that determines the media type from the MIME type
	Upload(ctx context.Context, sessionID string, info *entity.MediaDownloadInfo) (*entity.MediaUploadResult, error)

	// GetConstraints returns the media constraints used for validation
	GetConstraints() *valueobject.MediaConstraints
}

// MediaDownloader defines operations for downloading media from URLs
type MediaDownloader interface {
	// Download downloads media from a URL and returns the content with metadata
	Download(ctx context.Context, info *entity.MediaDownloadInfo) (*DownloadedMedia, error)

	// DetectMimeType detects the MIME type of the downloaded content
	DetectMimeType(data []byte) string
}

// DownloadedMedia represents media that has been downloaded from a URL
type DownloadedMedia struct {
	// Data is the raw media content
	Data []byte

	// MimeType is the detected or provided MIME type
	MimeType string

	// Size is the size of the media in bytes
	Size int64

	// Filename is the filename extracted from the URL or Content-Disposition header
	Filename string
}

// NewDownloadedMedia creates a new DownloadedMedia instance
func NewDownloadedMedia(data []byte, mimeType string, filename string) *DownloadedMedia {
	return &DownloadedMedia{
		Data:     data,
		MimeType: mimeType,
		Size:     int64(len(data)),
		Filename: filename,
	}
}

// IsValid checks if the downloaded media is valid
func (d *DownloadedMedia) IsValid() bool {
	return len(d.Data) > 0 && d.MimeType != ""
}
