package whatsapp

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// DownloaderConfig holds configuration for the media downloader
type DownloaderConfig struct {
	// Timeout is the maximum time to wait for a download
	Timeout time.Duration

	// MaxSize is the maximum file size to download (0 means use default constraints)
	MaxSize int64

	// UserAgent is the User-Agent header to use for requests
	UserAgent string
}

// DefaultDownloaderConfig returns default downloader configuration
func DefaultDownloaderConfig() DownloaderConfig {
	return DownloaderConfig{
		Timeout:   30 * time.Second,
		MaxSize:   valueobject.MaxDocumentSize, // Use largest allowed size as default
		UserAgent: "WhatsApp-Media-Downloader/1.0",
	}
}

// HTTPMediaDownloader implements MediaDownloader using HTTP
type HTTPMediaDownloader struct {
	config      DownloaderConfig
	client      *http.Client
	constraints *valueobject.MediaConstraints
}

// NewHTTPMediaDownloader creates a new HTTP media downloader
func NewHTTPMediaDownloader(config DownloaderConfig, constraints *valueobject.MediaConstraints) *HTTPMediaDownloader {
	if constraints == nil {
		constraints = valueobject.DefaultMediaConstraints()
	}

	return &HTTPMediaDownloader{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
		constraints: constraints,
	}
}

// Download downloads media from a URL and returns the content with metadata
func (d *HTTPMediaDownloader) Download(ctx context.Context, info *entity.MediaDownloadInfo) (*repository.DownloadedMedia, error) {
	if info == nil || !info.IsValid() {
		return nil, errors.ErrInvalidInput.WithMessage("invalid download info")
	}

	// Validate URL
	parsedURL, err := url.Parse(info.URL)
	if err != nil {
		return nil, errors.ErrMediaDownloadFailed.WithCause(err).WithMessage("invalid URL")
	}

	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return nil, errors.ErrMediaDownloadFailed.WithMessage("only HTTP and HTTPS URLs are supported")
	}

	// Create request with context
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, info.URL, nil)
	if err != nil {
		return nil, errors.ErrMediaDownloadFailed.WithCause(err)
	}

	req.Header.Set("User-Agent", d.config.UserAgent)

	// Execute request
	resp, err := d.client.Do(req)
	if err != nil {
		return nil, errors.ErrMediaDownloadFailed.WithCause(err)
	}
	defer resp.Body.Close()

	// Check status code
	if resp.StatusCode != http.StatusOK {
		return nil, errors.ErrMediaDownloadFailed.WithMessage(
			fmt.Sprintf("unexpected status code: %d", resp.StatusCode))
	}

	// Determine max size to read
	maxSize := d.config.MaxSize
	if info.MaxSize > 0 {
		maxSize = info.MaxSize
	}

	// Check Content-Length if available
	if resp.ContentLength > 0 && resp.ContentLength > maxSize {
		return nil, errors.ErrMediaTooLarge.WithMessage(
			fmt.Sprintf("file size %d exceeds maximum %d", resp.ContentLength, maxSize))
	}

	// Read body with size limit
	limitedReader := io.LimitReader(resp.Body, maxSize+1) // +1 to detect if exceeded
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, errors.ErrMediaDownloadFailed.WithCause(err)
	}

	// Check if we hit the limit
	if int64(len(data)) > maxSize {
		return nil, errors.ErrMediaTooLarge.WithMessage(
			fmt.Sprintf("file size exceeds maximum %d bytes", maxSize))
	}

	// Determine MIME type
	mimeType := d.determineMimeType(resp, data, info)

	// Determine filename
	filename := d.determineFilename(resp, parsedURL, info)

	return repository.NewDownloadedMedia(data, mimeType, filename), nil
}

// DetectMimeType detects the MIME type of the downloaded content
func (d *HTTPMediaDownloader) DetectMimeType(data []byte) string {
	return http.DetectContentType(data)
}

// determineMimeType determines the MIME type from response headers, content, or expected type
func (d *HTTPMediaDownloader) determineMimeType(resp *http.Response, data []byte, info *entity.MediaDownloadInfo) string {
	// First, try Content-Type header
	contentType := resp.Header.Get("Content-Type")
	if contentType != "" {
		// Extract MIME type without parameters (e.g., "text/html; charset=utf-8" -> "text/html")
		if idx := strings.Index(contentType, ";"); idx != -1 {
			contentType = strings.TrimSpace(contentType[:idx])
		}
		if contentType != "" && contentType != "application/octet-stream" {
			return contentType
		}
	}

	// If expected MIME type is provided, use it
	if info.ExpectedMimeType != "" {
		return info.ExpectedMimeType
	}

	// Fall back to content detection
	return d.DetectMimeType(data)
}

// determineFilename determines the filename from response headers, URL, or info
func (d *HTTPMediaDownloader) determineFilename(resp *http.Response, parsedURL *url.URL, info *entity.MediaDownloadInfo) string {
	// First, check if filename is provided in info
	if info.Filename != "" {
		return info.Filename
	}

	// Try Content-Disposition header
	contentDisposition := resp.Header.Get("Content-Disposition")
	if contentDisposition != "" {
		filename := extractFilenameFromContentDisposition(contentDisposition)
		if filename != "" {
			return filename
		}
	}

	// Extract from URL path
	urlPath := parsedURL.Path
	if urlPath != "" {
		filename := path.Base(urlPath)
		if filename != "" && filename != "." && filename != "/" {
			return filename
		}
	}

	return ""
}

// extractFilenameFromContentDisposition extracts filename from Content-Disposition header
func extractFilenameFromContentDisposition(header string) string {
	// Look for filename="..." or filename=...
	parts := strings.Split(header, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(strings.ToLower(part), "filename=") {
			filename := strings.TrimPrefix(part, "filename=")
			filename = strings.TrimPrefix(filename, "Filename=")
			filename = strings.TrimPrefix(filename, "FILENAME=")
			// Remove quotes if present
			filename = strings.Trim(filename, `"'`)
			return filename
		}
	}
	return ""
}

// ValidateAndDownload downloads media and validates it against constraints
func (d *HTTPMediaDownloader) ValidateAndDownload(
	ctx context.Context,
	info *entity.MediaDownloadInfo,
	expectedMediaType valueobject.MediaType,
) (*repository.DownloadedMedia, error) {
	// Set max size based on expected media type
	if info.MaxSize == 0 {
		info.MaxSize = d.constraints.GetMaxSize(expectedMediaType)
	}

	// Download the media
	media, err := d.Download(ctx, info)
	if err != nil {
		return nil, err
	}

	// Validate MIME type
	if err := d.constraints.ValidateMimeType(expectedMediaType, media.MimeType); err != nil {
		return nil, err
	}

	// Validate size
	if err := d.constraints.ValidateSize(expectedMediaType, media.Size); err != nil {
		return nil, err
	}

	return media, nil
}
