package unit

import (
	"testing"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== MediaType Tests ====================

func TestMediaType_IsValid(t *testing.T) {
	tests := []struct {
		name     string
		mt       valueobject.MediaType
		expected bool
	}{
		{"image is valid", valueobject.MediaTypeImage, true},
		{"document is valid", valueobject.MediaTypeDocument, true},
		{"audio is valid", valueobject.MediaTypeAudio, true},
		{"video is valid", valueobject.MediaTypeVideo, true},
		{"empty is invalid", valueobject.MediaType(""), false},
		{"unknown is invalid", valueobject.MediaType("unknown"), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.mt.IsValid())
		})
	}
}

func TestMediaType_String(t *testing.T) {
	assert.Equal(t, "image", valueobject.MediaTypeImage.String())
	assert.Equal(t, "document", valueobject.MediaTypeDocument.String())
	assert.Equal(t, "audio", valueobject.MediaTypeAudio.String())
	assert.Equal(t, "video", valueobject.MediaTypeVideo.String())
}

// ==================== MediaConstraints Tests ====================

func TestDefaultMediaConstraints(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	assert.Equal(t, valueobject.MaxImageSize, mc.MaxImageSize)
	assert.Equal(t, valueobject.MaxDocumentSize, mc.MaxDocumentSize)
	assert.Equal(t, valueobject.MaxAudioSize, mc.MaxAudioSize)
	assert.Equal(t, valueobject.MaxVideoSize, mc.MaxVideoSize)
	assert.NotEmpty(t, mc.AllowedImageTypes)
	assert.NotEmpty(t, mc.AllowedDocumentTypes)
	assert.NotEmpty(t, mc.AllowedAudioTypes)
	assert.NotEmpty(t, mc.AllowedVideoTypes)
}

func TestNewMediaConstraints(t *testing.T) {
	mc := valueobject.NewMediaConstraints(
		1024, 2048, 512, 4096,
		[]string{"image/png"},
		[]string{"application/pdf"},
		[]string{"audio/mp3"},
		[]string{"video/mp4"},
	)

	assert.Equal(t, int64(1024), mc.MaxImageSize)
	assert.Equal(t, int64(2048), mc.MaxDocumentSize)
	assert.Equal(t, int64(512), mc.MaxAudioSize)
	assert.Equal(t, int64(4096), mc.MaxVideoSize)
	assert.Equal(t, []string{"image/png"}, mc.AllowedImageTypes)
}

func TestMediaConstraints_GetMaxSize(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	tests := []struct {
		name     string
		mt       valueobject.MediaType
		expected int64
	}{
		{"image", valueobject.MediaTypeImage, valueobject.MaxImageSize},
		{"document", valueobject.MediaTypeDocument, valueobject.MaxDocumentSize},
		{"audio", valueobject.MediaTypeAudio, valueobject.MaxAudioSize},
		{"video", valueobject.MediaTypeVideo, valueobject.MaxVideoSize},
		{"unknown", valueobject.MediaType("unknown"), 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, mc.GetMaxSize(tt.mt))
		})
	}
}

func TestMediaConstraints_GetAllowedTypes(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	assert.Equal(t, valueobject.AllowedImageTypes, mc.GetAllowedTypes(valueobject.MediaTypeImage))
	assert.Equal(t, valueobject.AllowedDocumentTypes, mc.GetAllowedTypes(valueobject.MediaTypeDocument))
	assert.Equal(t, valueobject.AllowedAudioTypes, mc.GetAllowedTypes(valueobject.MediaTypeAudio))
	assert.Equal(t, valueobject.AllowedVideoTypes, mc.GetAllowedTypes(valueobject.MediaTypeVideo))
	assert.Nil(t, mc.GetAllowedTypes(valueobject.MediaType("unknown")))
}

func TestMediaConstraints_ValidateSize(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	tests := []struct {
		name        string
		mediaType   valueobject.MediaType
		size        int64
		expectedErr error
	}{
		{"valid image size", valueobject.MediaTypeImage, 1024, nil},
		{"max image size", valueobject.MediaTypeImage, valueobject.MaxImageSize, nil},
		{"image too large", valueobject.MediaTypeImage, valueobject.MaxImageSize + 1, errors.ErrMediaTooLarge},
		{"zero size", valueobject.MediaTypeImage, 0, errors.ErrInvalidMediaSize},
		{"negative size", valueobject.MediaTypeImage, -1, errors.ErrInvalidMediaSize},
		{"unknown media type", valueobject.MediaType("unknown"), 1024, errors.ErrUnsupportedMediaType},
		{"valid document size", valueobject.MediaTypeDocument, valueobject.MaxDocumentSize, nil},
		{"document too large", valueobject.MediaTypeDocument, valueobject.MaxDocumentSize + 1, errors.ErrMediaTooLarge},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mc.ValidateSize(tt.mediaType, tt.size)
			if tt.expectedErr != nil {
				assert.ErrorIs(t, err, tt.expectedErr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMediaConstraints_ValidateMimeType(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	tests := []struct {
		name        string
		mediaType   valueobject.MediaType
		mimeType    string
		expectedErr error
	}{
		{"valid jpeg", valueobject.MediaTypeImage, "image/jpeg", nil},
		{"valid png", valueobject.MediaTypeImage, "image/png", nil},
		{"valid webp", valueobject.MediaTypeImage, "image/webp", nil},
		{"case insensitive", valueobject.MediaTypeImage, "IMAGE/JPEG", nil},
		{"with whitespace", valueobject.MediaTypeImage, " image/jpeg ", nil},
		{"invalid image type", valueobject.MediaTypeImage, "image/gif", errors.ErrUnsupportedMimeType},
		{"empty mime type", valueobject.MediaTypeImage, "", errors.ErrInvalidMimeType},
		{"valid pdf", valueobject.MediaTypeDocument, "application/pdf", nil},
		{"valid mp3", valueobject.MediaTypeAudio, "audio/mpeg", nil},
		{"valid mp4", valueobject.MediaTypeVideo, "video/mp4", nil},
		{"unknown media type", valueobject.MediaType("unknown"), "image/jpeg", errors.ErrUnsupportedMediaType},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mc.ValidateMimeType(tt.mediaType, tt.mimeType)
			if tt.expectedErr != nil {
				assert.ErrorIs(t, err, tt.expectedErr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMediaConstraints_Validate(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	tests := []struct {
		name        string
		mediaType   valueobject.MediaType
		size        int64
		mimeType    string
		expectedErr error
	}{
		{"valid image", valueobject.MediaTypeImage, 1024, "image/jpeg", nil},
		{"invalid media type", valueobject.MediaType("unknown"), 1024, "image/jpeg", errors.ErrUnsupportedMediaType},
		{"invalid size", valueobject.MediaTypeImage, 0, "image/jpeg", errors.ErrInvalidMediaSize},
		{"invalid mime type", valueobject.MediaTypeImage, 1024, "image/gif", errors.ErrUnsupportedMimeType},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := mc.Validate(tt.mediaType, tt.size, tt.mimeType)
			if tt.expectedErr != nil {
				assert.ErrorIs(t, err, tt.expectedErr)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestMediaConstraints_IsTypeCheckers(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	// Image types
	assert.True(t, mc.IsImageType("image/jpeg"))
	assert.True(t, mc.IsImageType("image/png"))
	assert.False(t, mc.IsImageType("image/gif"))
	assert.False(t, mc.IsImageType("application/pdf"))

	// Document types
	assert.True(t, mc.IsDocumentType("application/pdf"))
	assert.False(t, mc.IsDocumentType("image/jpeg"))

	// Audio types
	assert.True(t, mc.IsAudioType("audio/mpeg"))
	assert.False(t, mc.IsAudioType("video/mp4"))

	// Video types
	assert.True(t, mc.IsVideoType("video/mp4"))
	assert.False(t, mc.IsVideoType("audio/mpeg"))
}

func TestMediaConstraints_DetectMediaType(t *testing.T) {
	mc := valueobject.DefaultMediaConstraints()

	tests := []struct {
		name         string
		mimeType     string
		expectedType valueobject.MediaType
		expectError  bool
	}{
		{"detect image", "image/jpeg", valueobject.MediaTypeImage, false},
		{"detect document", "application/pdf", valueobject.MediaTypeDocument, false},
		{"detect audio", "audio/mpeg", valueobject.MediaTypeAudio, false},
		{"detect video", "video/mp4", valueobject.MediaTypeVideo, false},
		{"unknown type", "application/octet-stream", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mt, err := mc.DetectMediaType(tt.mimeType)
			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectedType, mt)
			}
		})
	}
}

// ==================== MediaUploadResult Tests ====================

func TestNewMediaUploadResult(t *testing.T) {
	result := entity.NewMediaUploadResult(
		"https://example.com/media",
		"/direct/path",
		[]byte("mediakey"),
		[]byte("filehash"),
		[]byte("fileenchash"),
		1024,
		"image/jpeg",
		valueobject.MediaTypeImage,
	)

	assert.Equal(t, "https://example.com/media", result.URL)
	assert.Equal(t, "/direct/path", result.DirectPath)
	assert.Equal(t, []byte("mediakey"), result.MediaKey)
	assert.Equal(t, []byte("filehash"), result.FileHash)
	assert.Equal(t, []byte("fileenchash"), result.FileEncHash)
	assert.Equal(t, uint64(1024), result.FileLength)
	assert.Equal(t, "image/jpeg", result.MimeType)
	assert.Equal(t, valueobject.MediaTypeImage, result.MediaType)
	assert.WithinDuration(t, time.Now(), result.UploadedAt, time.Second)
}

func TestMediaUploadResult_IsValid(t *testing.T) {
	tests := []struct {
		name     string
		result   *entity.MediaUploadResult
		expected bool
	}{
		{
			"valid result",
			entity.NewMediaUploadResult(
				"https://example.com/media",
				"/direct/path",
				[]byte("mediakey"),
				[]byte("filehash"),
				[]byte("fileenchash"),
				1024,
				"image/jpeg",
				valueobject.MediaTypeImage,
			),
			true,
		},
		{
			"empty URL",
			&entity.MediaUploadResult{
				DirectPath: "/path",
				MediaKey:   []byte("key"),
				FileHash:   []byte("hash"),
				FileLength: 1024,
				MimeType:   "image/jpeg",
				MediaType:  valueobject.MediaTypeImage,
			},
			false,
		},
		{
			"empty direct path",
			&entity.MediaUploadResult{
				URL:        "https://example.com",
				MediaKey:   []byte("key"),
				FileHash:   []byte("hash"),
				FileLength: 1024,
				MimeType:   "image/jpeg",
				MediaType:  valueobject.MediaTypeImage,
			},
			false,
		},
		{
			"empty media key",
			&entity.MediaUploadResult{
				URL:        "https://example.com",
				DirectPath: "/path",
				FileHash:   []byte("hash"),
				FileLength: 1024,
				MimeType:   "image/jpeg",
				MediaType:  valueobject.MediaTypeImage,
			},
			false,
		},
		{
			"zero file length",
			&entity.MediaUploadResult{
				URL:        "https://example.com",
				DirectPath: "/path",
				MediaKey:   []byte("key"),
				FileHash:   []byte("hash"),
				FileLength: 0,
				MimeType:   "image/jpeg",
				MediaType:  valueobject.MediaTypeImage,
			},
			false,
		},
		{
			"invalid media type",
			&entity.MediaUploadResult{
				URL:        "https://example.com",
				DirectPath: "/path",
				MediaKey:   []byte("key"),
				FileHash:   []byte("hash"),
				FileLength: 1024,
				MimeType:   "image/jpeg",
				MediaType:  valueobject.MediaType("invalid"),
			},
			false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.result.IsValid())
		})
	}
}

func TestMediaUploadResult_GetFileSize(t *testing.T) {
	result := entity.NewMediaUploadResult(
		"https://example.com/media",
		"/direct/path",
		[]byte("mediakey"),
		[]byte("filehash"),
		[]byte("fileenchash"),
		1024*1024, // 1MB
		"image/jpeg",
		valueobject.MediaTypeImage,
	)

	assert.Equal(t, float64(1024), result.GetFileSizeKB())
	assert.Equal(t, float64(1), result.GetFileSizeMB())
}

func TestMediaUploadResult_MarshalJSON(t *testing.T) {
	result := entity.NewMediaUploadResult(
		"https://example.com/media",
		"/direct/path",
		[]byte("mediakey"),
		[]byte("filehash"),
		[]byte("fileenchash"),
		1024,
		"image/jpeg",
		valueobject.MediaTypeImage,
	)

	data, err := result.MarshalJSON()
	require.NoError(t, err)
	assert.Contains(t, string(data), "https://example.com/media")
	assert.Contains(t, string(data), "uploaded_at")
}

// ==================== MediaDownloadInfo Tests ====================

func TestNewMediaDownloadInfo(t *testing.T) {
	info := entity.NewMediaDownloadInfo("https://example.com/image.jpg")

	assert.Equal(t, "https://example.com/image.jpg", info.URL)
	assert.Empty(t, info.Filename)
	assert.Empty(t, info.ExpectedMimeType)
	assert.Zero(t, info.MaxSize)
}

func TestMediaDownloadInfo_WithMethods(t *testing.T) {
	info := entity.NewMediaDownloadInfo("https://example.com/image.jpg").
		WithFilename("image.jpg").
		WithExpectedMimeType("image/jpeg").
		WithMaxSize(1024)

	assert.Equal(t, "https://example.com/image.jpg", info.URL)
	assert.Equal(t, "image.jpg", info.Filename)
	assert.Equal(t, "image/jpeg", info.ExpectedMimeType)
	assert.Equal(t, int64(1024), info.MaxSize)
}

func TestMediaDownloadInfo_IsValid(t *testing.T) {
	tests := []struct {
		name     string
		info     *entity.MediaDownloadInfo
		expected bool
	}{
		{"valid URL", entity.NewMediaDownloadInfo("https://example.com/image.jpg"), true},
		{"empty URL", entity.NewMediaDownloadInfo(""), false},
		{"empty struct", &entity.MediaDownloadInfo{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.info.IsValid())
		})
	}
}
