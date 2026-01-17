package integration

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
	"github.com/pharmabroker/whatsapp/test/mocks"
)

// ==================== Re-export Shared Mocks ====================

// Re-export shared mocks for backward compatibility
type SessionRepositoryMock = mocks.SessionRepositoryMock
type WhatsAppClientMock = mocks.WhatsAppClientMock
type EventPublisherMock = mocks.EventPublisherMock

var (
	NewSessionRepositoryMock = mocks.NewSessionRepositoryMock
	NewWhatsAppClientMock    = mocks.NewWhatsAppClientMock
	NewEventPublisherMock    = mocks.NewEventPublisherMock
)

// ==================== Media Uploader Mock ====================

// MediaUploaderMock is a mock implementation of MediaUploader
type MediaUploaderMock struct {
	UploadImageFn    func(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)
	UploadDocumentFn func(ctx context.Context, sessionID string, url string, filename string) (*entity.MediaUploadResult, error)
	UploadAudioFn    func(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)
	UploadVideoFn    func(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error)
	UploadFn         func(ctx context.Context, sessionID string, info *entity.MediaDownloadInfo) (*entity.MediaUploadResult, error)
	Constraints      *valueobject.MediaConstraints
}

func NewMediaUploaderMock() *MediaUploaderMock {
	return &MediaUploaderMock{
		Constraints: valueobject.DefaultMediaConstraints(),
	}
}

func (m *MediaUploaderMock) UploadImage(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	if m.UploadImageFn != nil {
		return m.UploadImageFn(ctx, sessionID, url)
	}
	return &entity.MediaUploadResult{
		URL:        "https://whatsapp.net/media/image123",
		MimeType:   "image/jpeg",
		FileLength: 1024,
	}, nil
}

func (m *MediaUploaderMock) UploadDocument(ctx context.Context, sessionID string, url string, filename string) (*entity.MediaUploadResult, error) {
	if m.UploadDocumentFn != nil {
		return m.UploadDocumentFn(ctx, sessionID, url, filename)
	}
	return &entity.MediaUploadResult{
		URL:        "https://whatsapp.net/media/doc123",
		MimeType:   "application/pdf",
		FileLength: 2048,
	}, nil
}

func (m *MediaUploaderMock) UploadAudio(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	if m.UploadAudioFn != nil {
		return m.UploadAudioFn(ctx, sessionID, url)
	}
	return &entity.MediaUploadResult{
		URL:        "https://whatsapp.net/media/audio123",
		MimeType:   "audio/mpeg",
		FileLength: 4096,
	}, nil
}

func (m *MediaUploaderMock) UploadVideo(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	if m.UploadVideoFn != nil {
		return m.UploadVideoFn(ctx, sessionID, url)
	}
	return &entity.MediaUploadResult{
		URL:        "https://whatsapp.net/media/video123",
		MimeType:   "video/mp4",
		FileLength: 8192,
	}, nil
}

func (m *MediaUploaderMock) Upload(ctx context.Context, sessionID string, info *entity.MediaDownloadInfo) (*entity.MediaUploadResult, error) {
	if m.UploadFn != nil {
		return m.UploadFn(ctx, sessionID, info)
	}
	return &entity.MediaUploadResult{
		URL:        "https://whatsapp.net/media/generic123",
		MimeType:   "application/octet-stream",
		FileLength: 1024,
	}, nil
}

func (m *MediaUploaderMock) GetConstraints() *valueobject.MediaConstraints {
	return m.Constraints
}
