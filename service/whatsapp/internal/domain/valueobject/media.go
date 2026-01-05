package valueobject

import (
	"strings"

	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// MediaType represents the type of media content
type MediaType string

const (
	MediaTypeImage    MediaType = "image"
	MediaTypeDocument MediaType = "document"
	MediaTypeAudio    MediaType = "audio"
	MediaTypeVideo    MediaType = "video"
)

// IsValid checks if the media type is valid
func (mt MediaType) IsValid() bool {
	switch mt {
	case MediaTypeImage, MediaTypeDocument, MediaTypeAudio, MediaTypeVideo:
		return true
	}
	return false
}

// String returns the string representation of the media type
func (mt MediaType) String() string {
	return string(mt)
}

// Size constants for media files (in bytes)
const (
	MaxImageSize    int64 = 16 * 1024 * 1024  // 16MB
	MaxDocumentSize int64 = 100 * 1024 * 1024 // 100MB
	MaxAudioSize    int64 = 16 * 1024 * 1024  // 16MB
	MaxVideoSize    int64 = 16 * 1024 * 1024  // 16MB
)

// Allowed MIME types for each media type
var (
	AllowedImageTypes = []string{
		"image/jpeg",
		"image/png",
		"image/webp",
	}

	AllowedDocumentTypes = []string{
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	}

	AllowedAudioTypes = []string{
		"audio/mpeg",
		"audio/ogg",
		"audio/aac",
		"audio/mp3",
	}

	AllowedVideoTypes = []string{
		"video/mp4",
		"video/3gpp",
	}
)

// MediaConstraints holds validation constraints for media uploads
type MediaConstraints struct {
	MaxImageSize         int64
	MaxDocumentSize      int64
	MaxAudioSize         int64
	MaxVideoSize         int64
	AllowedImageTypes    []string
	AllowedDocumentTypes []string
	AllowedAudioTypes    []string
	AllowedVideoTypes    []string
}

// DefaultMediaConstraints returns the default media constraints based on WhatsApp limits
func DefaultMediaConstraints() *MediaConstraints {
	return &MediaConstraints{
		MaxImageSize:         MaxImageSize,
		MaxDocumentSize:      MaxDocumentSize,
		MaxAudioSize:         MaxAudioSize,
		MaxVideoSize:         MaxVideoSize,
		AllowedImageTypes:    AllowedImageTypes,
		AllowedDocumentTypes: AllowedDocumentTypes,
		AllowedAudioTypes:    AllowedAudioTypes,
		AllowedVideoTypes:    AllowedVideoTypes,
	}
}

// NewMediaConstraints creates a new MediaConstraints with custom values
func NewMediaConstraints(
	maxImageSize, maxDocumentSize, maxAudioSize, maxVideoSize int64,
	allowedImageTypes, allowedDocumentTypes, allowedAudioTypes, allowedVideoTypes []string,
) *MediaConstraints {
	return &MediaConstraints{
		MaxImageSize:         maxImageSize,
		MaxDocumentSize:      maxDocumentSize,
		MaxAudioSize:         maxAudioSize,
		MaxVideoSize:         maxVideoSize,
		AllowedImageTypes:    allowedImageTypes,
		AllowedDocumentTypes: allowedDocumentTypes,
		AllowedAudioTypes:    allowedAudioTypes,
		AllowedVideoTypes:    allowedVideoTypes,
	}
}

// GetMaxSize returns the maximum allowed size for a given media type
func (mc *MediaConstraints) GetMaxSize(mediaType MediaType) int64 {
	switch mediaType {
	case MediaTypeImage:
		return mc.MaxImageSize
	case MediaTypeDocument:
		return mc.MaxDocumentSize
	case MediaTypeAudio:
		return mc.MaxAudioSize
	case MediaTypeVideo:
		return mc.MaxVideoSize
	default:
		return 0
	}
}

// GetAllowedTypes returns the allowed MIME types for a given media type
func (mc *MediaConstraints) GetAllowedTypes(mediaType MediaType) []string {
	switch mediaType {
	case MediaTypeImage:
		return mc.AllowedImageTypes
	case MediaTypeDocument:
		return mc.AllowedDocumentTypes
	case MediaTypeAudio:
		return mc.AllowedAudioTypes
	case MediaTypeVideo:
		return mc.AllowedVideoTypes
	default:
		return nil
	}
}

// ValidateSize checks if the file size is within the allowed limit for the media type
func (mc *MediaConstraints) ValidateSize(mediaType MediaType, size int64) error {
	if size <= 0 {
		return errors.ErrInvalidMediaSize
	}

	maxSize := mc.GetMaxSize(mediaType)
	if maxSize == 0 {
		return errors.ErrUnsupportedMediaType
	}

	if size > maxSize {
		return errors.ErrMediaTooLarge
	}

	return nil
}

// ValidateMimeType checks if the MIME type is allowed for the media type
func (mc *MediaConstraints) ValidateMimeType(mediaType MediaType, mimeType string) error {
	if mimeType == "" {
		return errors.ErrInvalidMimeType
	}

	allowedTypes := mc.GetAllowedTypes(mediaType)
	if allowedTypes == nil {
		return errors.ErrUnsupportedMediaType
	}

	normalizedMime := strings.ToLower(strings.TrimSpace(mimeType))
	for _, allowed := range allowedTypes {
		if strings.ToLower(allowed) == normalizedMime {
			return nil
		}
	}

	return errors.ErrUnsupportedMimeType
}

// Validate performs full validation of media against constraints
func (mc *MediaConstraints) Validate(mediaType MediaType, size int64, mimeType string) error {
	if !mediaType.IsValid() {
		return errors.ErrUnsupportedMediaType
	}

	if err := mc.ValidateSize(mediaType, size); err != nil {
		return err
	}

	if err := mc.ValidateMimeType(mediaType, mimeType); err != nil {
		return err
	}

	return nil
}

// IsImageType checks if the MIME type is an allowed image type
func (mc *MediaConstraints) IsImageType(mimeType string) bool {
	return mc.ValidateMimeType(MediaTypeImage, mimeType) == nil
}

// IsDocumentType checks if the MIME type is an allowed document type
func (mc *MediaConstraints) IsDocumentType(mimeType string) bool {
	return mc.ValidateMimeType(MediaTypeDocument, mimeType) == nil
}

// IsAudioType checks if the MIME type is an allowed audio type
func (mc *MediaConstraints) IsAudioType(mimeType string) bool {
	return mc.ValidateMimeType(MediaTypeAudio, mimeType) == nil
}

// IsVideoType checks if the MIME type is an allowed video type
func (mc *MediaConstraints) IsVideoType(mimeType string) bool {
	return mc.ValidateMimeType(MediaTypeVideo, mimeType) == nil
}

// DetectMediaType attempts to determine the media type from a MIME type
func (mc *MediaConstraints) DetectMediaType(mimeType string) (MediaType, error) {
	if mc.IsImageType(mimeType) {
		return MediaTypeImage, nil
	}
	if mc.IsDocumentType(mimeType) {
		return MediaTypeDocument, nil
	}
	if mc.IsAudioType(mimeType) {
		return MediaTypeAudio, nil
	}
	if mc.IsVideoType(mimeType) {
		return MediaTypeVideo, nil
	}
	return "", errors.ErrUnsupportedMimeType
}
