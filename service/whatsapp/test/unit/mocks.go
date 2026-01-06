package unit

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
	"github.com/pharmabroker/whatsapp/internal/domain/valueobject"
)

// ==================== Session Repository Mock ====================

// SessionRepositoryMock is a mock implementation of SessionRepository
type SessionRepositoryMock struct {
	sessions map[string]*entity.Session
	createFn func(ctx context.Context, session *entity.Session) error
	getFn    func(ctx context.Context, id string) (*entity.Session, error)
	updateFn func(ctx context.Context, session *entity.Session) error
	deleteFn func(ctx context.Context, id string) error
}

func NewSessionRepositoryMock() *SessionRepositoryMock {
	return &SessionRepositoryMock{
		sessions: make(map[string]*entity.Session),
	}
}

func (m *SessionRepositoryMock) Create(ctx context.Context, session *entity.Session) error {
	if m.createFn != nil {
		return m.createFn(ctx, session)
	}
	m.sessions[session.ID] = session
	return nil
}

func (m *SessionRepositoryMock) GetByID(ctx context.Context, id string) (*entity.Session, error) {
	if m.getFn != nil {
		return m.getFn(ctx, id)
	}
	if session, ok := m.sessions[id]; ok {
		return session, nil
	}
	return nil, errors.ErrSessionNotFound
}

func (m *SessionRepositoryMock) Update(ctx context.Context, session *entity.Session) error {
	if m.updateFn != nil {
		return m.updateFn(ctx, session)
	}
	m.sessions[session.ID] = session
	return nil
}

func (m *SessionRepositoryMock) Delete(ctx context.Context, id string) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id)
	}
	if _, ok := m.sessions[id]; !ok {
		return errors.ErrSessionNotFound
	}
	delete(m.sessions, id)
	return nil
}

func (m *SessionRepositoryMock) UpdateStatus(ctx context.Context, id string, status entity.Status) error {
	if s, ok := m.sessions[id]; ok {
		s.SetStatus(status)
		return nil
	}
	return errors.ErrSessionNotFound
}

// ==================== WhatsApp Client Mock ====================

// WhatsAppClientMock is a mock implementation of WhatsAppClient with extended functionality
type WhatsAppClientMock struct {
	Connected    map[string]bool
	ConnectFn    func(ctx context.Context, sessionID string) error
	DisconnectFn func(ctx context.Context, sessionID string) error
	SendFn       func(ctx context.Context, msg *entity.Message) error
	QRChan       chan repository.QREvent
}

func NewWhatsAppClientMock() *WhatsAppClientMock {
	return &WhatsAppClientMock{
		Connected: make(map[string]bool),
		QRChan:    make(chan repository.QREvent, 10),
	}
}

func (m *WhatsAppClientMock) Connect(ctx context.Context, sessionID string) error {
	if m.ConnectFn != nil {
		return m.ConnectFn(ctx, sessionID)
	}
	m.Connected[sessionID] = true
	return nil
}

func (m *WhatsAppClientMock) Disconnect(ctx context.Context, sessionID string) error {
	if m.DisconnectFn != nil {
		return m.DisconnectFn(ctx, sessionID)
	}
	delete(m.Connected, sessionID)
	return nil
}

func (m *WhatsAppClientMock) SendMessage(ctx context.Context, msg *entity.Message) error {
	if m.SendFn != nil {
		return m.SendFn(ctx, msg)
	}
	return nil
}

func (m *WhatsAppClientMock) GetQRChannel(ctx context.Context, sessionID string) (<-chan repository.QREvent, error) {
	return m.QRChan, nil
}

func (m *WhatsAppClientMock) RegisterEventHandler(handler repository.EventHandler) {}

func (m *WhatsAppClientMock) IsConnected(sessionID string) bool {
	return m.Connected[sessionID]
}

func (m *WhatsAppClientMock) GetSessionJID(sessionID string) (string, error) {
	if m.Connected[sessionID] {
		return sessionID + "@s.whatsapp.net", nil
	}
	return "", errors.ErrSessionNotFound
}

// ==================== Event Publisher Mock ====================

// EventPublisherMock is a mock implementation of EventPublisher with extended functionality
type EventPublisherMock struct {
	IsConnectedVal bool
	Events         []*entity.Event
	PublishFn      func(ctx context.Context, event *entity.Event) error
}

func NewEventPublisherMock() *EventPublisherMock {
	return &EventPublisherMock{
		IsConnectedVal: true,
		Events:         make([]*entity.Event, 0),
	}
}

func (m *EventPublisherMock) Publish(ctx context.Context, event *entity.Event) error {
	if m.PublishFn != nil {
		return m.PublishFn(ctx, event)
	}
	m.Events = append(m.Events, event)
	return nil
}

func (m *EventPublisherMock) Connect(ctx context.Context) error {
	m.IsConnectedVal = true
	return nil
}

func (m *EventPublisherMock) Disconnect(ctx context.Context) error {
	m.IsConnectedVal = false
	return nil
}

func (m *EventPublisherMock) IsConnected() bool {
	return m.IsConnectedVal
}

func (m *EventPublisherMock) QueueSize() int {
	return len(m.Events)
}

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
