package entity

import (
	"encoding/json"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// MediaUploadResult represents the result of uploading media to WhatsApp servers
type MediaUploadResult struct {
	// URL is the WhatsApp media URL
	URL string `json:"url"`

	// DirectPath is the direct path to the media on WhatsApp servers
	DirectPath string `json:"direct_path"`

	// MediaKey is the encryption key for the media
	MediaKey []byte `json:"media_key"`

	// FileHash is the SHA256 hash of the file
	FileHash []byte `json:"file_hash"`

	// FileEncHash is the SHA256 hash of the encrypted file
	FileEncHash []byte `json:"file_enc_hash"`

	// FileLength is the size of the file in bytes
	FileLength uint64 `json:"file_length"`

	// MimeType is the MIME type of the uploaded media
	MimeType string `json:"mime_type"`

	// MediaType is the type of media (image, document, audio, video)
	MediaType valueobject.MediaType `json:"media_type"`

	// UploadedAt is the timestamp when the media was uploaded
	UploadedAt time.Time `json:"uploaded_at"`
}

// NewMediaUploadResult creates a new MediaUploadResult
func NewMediaUploadResult(
	url, directPath string,
	mediaKey, fileHash, fileEncHash []byte,
	fileLength uint64,
	mimeType string,
	mediaType valueobject.MediaType,
) *MediaUploadResult {
	return &MediaUploadResult{
		URL:         url,
		DirectPath:  directPath,
		MediaKey:    mediaKey,
		FileHash:    fileHash,
		FileEncHash: fileEncHash,
		FileLength:  fileLength,
		MimeType:    mimeType,
		MediaType:   mediaType,
		UploadedAt:  time.Now(),
	}
}

// IsValid checks if the upload result contains all required fields
func (m *MediaUploadResult) IsValid() bool {
	return m.URL != "" &&
		m.DirectPath != "" &&
		len(m.MediaKey) > 0 &&
		len(m.FileHash) > 0 &&
		m.FileLength > 0 &&
		m.MimeType != "" &&
		m.MediaType.IsValid()
}

// GetFileSizeKB returns the file size in kilobytes
func (m *MediaUploadResult) GetFileSizeKB() float64 {
	return float64(m.FileLength) / 1024
}

// GetFileSizeMB returns the file size in megabytes
func (m *MediaUploadResult) GetFileSizeMB() float64 {
	return float64(m.FileLength) / (1024 * 1024)
}

// MarshalJSON implements json.Marshaler
func (m *MediaUploadResult) MarshalJSON() ([]byte, error) {
	type Alias MediaUploadResult
	return json.Marshal(&struct {
		*Alias
		UploadedAt string `json:"uploaded_at"`
	}{
		Alias:      (*Alias)(m),
		UploadedAt: m.UploadedAt.Format(time.RFC3339),
	})
}

// MediaDownloadInfo contains information needed to download media
type MediaDownloadInfo struct {
	// URL is the source URL to download from
	URL string `json:"url"`

	// Filename is the optional filename for the media
	Filename string `json:"filename,omitempty"`

	// ExpectedMimeType is the expected MIME type (optional, for validation)
	ExpectedMimeType string `json:"expected_mime_type,omitempty"`

	// MaxSize is the maximum allowed file size in bytes (0 means use default)
	MaxSize int64 `json:"max_size,omitempty"`
}

// NewMediaDownloadInfo creates a new MediaDownloadInfo
func NewMediaDownloadInfo(url string) *MediaDownloadInfo {
	return &MediaDownloadInfo{
		URL: url,
	}
}

// WithFilename sets the filename
func (m *MediaDownloadInfo) WithFilename(filename string) *MediaDownloadInfo {
	m.Filename = filename
	return m
}

// WithExpectedMimeType sets the expected MIME type
func (m *MediaDownloadInfo) WithExpectedMimeType(mimeType string) *MediaDownloadInfo {
	m.ExpectedMimeType = mimeType
	return m
}

// WithMaxSize sets the maximum file size
func (m *MediaDownloadInfo) WithMaxSize(maxSize int64) *MediaDownloadInfo {
	m.MaxSize = maxSize
	return m
}

// IsValid checks if the download info is valid
func (m *MediaDownloadInfo) IsValid() bool {
	return m.URL != ""
}
