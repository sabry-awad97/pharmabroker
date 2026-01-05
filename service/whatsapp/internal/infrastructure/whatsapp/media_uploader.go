package whatsapp

import (
	"context"
	"sync"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
	"go.mau.fi/whatsmeow"
)

// WhatsmeowMediaUploader implements MediaUploader using whatsmeow
type WhatsmeowMediaUploader struct {
	client      *WhatsmeowClient
	downloader  *HTTPMediaDownloader
	constraints *valueobject.MediaConstraints
	mu          sync.RWMutex
}

// NewWhatsmeowMediaUploader creates a new media uploader
func NewWhatsmeowMediaUploader(
	client *WhatsmeowClient,
	downloader *HTTPMediaDownloader,
	constraints *valueobject.MediaConstraints,
) *WhatsmeowMediaUploader {
	if constraints == nil {
		constraints = valueobject.DefaultMediaConstraints()
	}
	if downloader == nil {
		downloader = NewHTTPMediaDownloader(DefaultDownloaderConfig(), constraints)
	}

	return &WhatsmeowMediaUploader{
		client:      client,
		downloader:  downloader,
		constraints: constraints,
	}
}

// UploadImage uploads an image from a URL to WhatsApp servers
func (u *WhatsmeowMediaUploader) UploadImage(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	info := entity.NewMediaDownloadInfo(url)
	return u.uploadMedia(ctx, sessionID, info, valueobject.MediaTypeImage, whatsmeow.MediaImage)
}

// UploadDocument uploads a document from a URL to WhatsApp servers
func (u *WhatsmeowMediaUploader) UploadDocument(ctx context.Context, sessionID string, url string, filename string) (*entity.MediaUploadResult, error) {
	info := entity.NewMediaDownloadInfo(url).WithFilename(filename)
	return u.uploadMedia(ctx, sessionID, info, valueobject.MediaTypeDocument, whatsmeow.MediaDocument)
}

// UploadAudio uploads an audio file from a URL to WhatsApp servers
func (u *WhatsmeowMediaUploader) UploadAudio(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	info := entity.NewMediaDownloadInfo(url)
	return u.uploadMedia(ctx, sessionID, info, valueobject.MediaTypeAudio, whatsmeow.MediaAudio)
}

// UploadVideo uploads a video from a URL to WhatsApp servers
func (u *WhatsmeowMediaUploader) UploadVideo(ctx context.Context, sessionID string, url string) (*entity.MediaUploadResult, error) {
	info := entity.NewMediaDownloadInfo(url)
	return u.uploadMedia(ctx, sessionID, info, valueobject.MediaTypeVideo, whatsmeow.MediaVideo)
}

// Upload is a generic upload method that determines the media type from the MIME type
func (u *WhatsmeowMediaUploader) Upload(ctx context.Context, sessionID string, info *entity.MediaDownloadInfo) (*entity.MediaUploadResult, error) {
	if info == nil || !info.IsValid() {
		return nil, errors.ErrInvalidInput.WithMessage("invalid download info")
	}

	// Download the media first to detect MIME type
	media, err := u.downloader.Download(ctx, info)
	if err != nil {
		return nil, err
	}

	// Detect media type from MIME type
	mediaType, err := u.constraints.DetectMediaType(media.MimeType)
	if err != nil {
		return nil, err
	}

	// Map to whatsmeow media type
	waMediaType := u.mapToWhatsmeowMediaType(mediaType)

	// Upload to WhatsApp
	return u.uploadData(ctx, sessionID, media.Data, media.MimeType, mediaType, waMediaType)
}

// GetConstraints returns the media constraints used for validation
func (u *WhatsmeowMediaUploader) GetConstraints() *valueobject.MediaConstraints {
	return u.constraints
}

// uploadMedia downloads and uploads media to WhatsApp servers
func (u *WhatsmeowMediaUploader) uploadMedia(
	ctx context.Context,
	sessionID string,
	info *entity.MediaDownloadInfo,
	mediaType valueobject.MediaType,
	waMediaType whatsmeow.MediaType,
) (*entity.MediaUploadResult, error) {
	// Download and validate the media
	media, err := u.downloader.ValidateAndDownload(ctx, info, mediaType)
	if err != nil {
		return nil, err
	}

	// Upload to WhatsApp
	return u.uploadData(ctx, sessionID, media.Data, media.MimeType, mediaType, waMediaType)
}

// uploadData uploads raw data to WhatsApp servers
func (u *WhatsmeowMediaUploader) uploadData(
	ctx context.Context,
	sessionID string,
	data []byte,
	mimeType string,
	mediaType valueobject.MediaType,
	waMediaType whatsmeow.MediaType,
) (*entity.MediaUploadResult, error) {
	// Get the whatsmeow client for this session
	waClient, err := u.getWhatsmeowClient(sessionID)
	if err != nil {
		return nil, err
	}

	// Upload to WhatsApp servers
	uploadResp, err := waClient.Upload(ctx, data, waMediaType)
	if err != nil {
		return nil, errors.ErrMediaUploadFailed.WithCause(err)
	}

	// Create the result
	result := entity.NewMediaUploadResult(
		uploadResp.URL,
		uploadResp.DirectPath,
		uploadResp.MediaKey,
		uploadResp.FileEncSHA256,
		uploadResp.FileSHA256,
		uint64(len(data)),
		mimeType,
		mediaType,
	)

	return result, nil
}

// getWhatsmeowClient gets the whatsmeow client for a session
func (u *WhatsmeowMediaUploader) getWhatsmeowClient(sessionID string) (*whatsmeow.Client, error) {
	u.client.mu.RLock()
	defer u.client.mu.RUnlock()

	client, exists := u.client.clients[sessionID]
	if !exists {
		return nil, errors.ErrSessionNotFound
	}

	if !client.IsConnected() {
		return nil, errors.ErrDisconnected
	}

	return client, nil
}

// mapToWhatsmeowMediaType maps domain media type to whatsmeow media type
func (u *WhatsmeowMediaUploader) mapToWhatsmeowMediaType(mediaType valueobject.MediaType) whatsmeow.MediaType {
	switch mediaType {
	case valueobject.MediaTypeImage:
		return whatsmeow.MediaImage
	case valueobject.MediaTypeDocument:
		return whatsmeow.MediaDocument
	case valueobject.MediaTypeAudio:
		return whatsmeow.MediaAudio
	case valueobject.MediaTypeVideo:
		return whatsmeow.MediaVideo
	default:
		return whatsmeow.MediaDocument // Default to document
	}
}
