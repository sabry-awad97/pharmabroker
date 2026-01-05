package whatsapp

import (
	"encoding/base64"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/skip2/go-qrcode"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

// CalculateBackoff calculates the next backoff delay using exponential backoff
// delay = base * 2^attempt, capped at maxDelay
func CalculateBackoff(currentDelay time.Duration, maxAttempts int) time.Duration {
	maxDelay := time.Duration(maxAttempts) * time.Minute
	nextDelay := currentDelay * 2
	if nextDelay > maxDelay {
		return maxDelay
	}
	return nextDelay
}

// CalculateBackoffWithBase calculates backoff with a specific base delay
func CalculateBackoffWithBase(baseDelay time.Duration, attempt int, maxDelay time.Duration) time.Duration {
	delay := baseDelay
	for i := 0; i < attempt; i++ {
		delay *= 2
		if delay > maxDelay {
			return maxDelay
		}
	}
	return delay
}

// EncodeQRToBase64 encodes a QR code string to a base64 PNG image
func EncodeQRToBase64(qrCode string) (string, error) {
	png, err := qrcode.Encode(qrCode, qrcode.Medium, 256)
	if err != nil {
		return "", errors.ErrQRGenerationFailed.WithCause(err)
	}
	return base64.StdEncoding.EncodeToString(png), nil
}

// encodeQRToBase64 is an internal alias for EncodeQRToBase64
func encodeQRToBase64(qrCode string) (string, error) {
	return EncodeQRToBase64(qrCode)
}

// DecodeBase64ToQR decodes a base64 PNG image (for testing)
func DecodeBase64ToQR(base64Str string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(base64Str)
}

// buildWhatsAppMessage builds a WhatsApp protocol message from a domain message
// For media messages, the upload result must be provided
func buildWhatsAppMessage(msg *entity.Message) (*waE2E.Message, error) {
	waMsg := &waE2E.Message{}

	switch msg.Type {
	case entity.MessageTypeText:
		if msg.Content.Text == nil || *msg.Content.Text == "" {
			return nil, errors.ErrEmptyContent
		}
		waMsg.Conversation = proto.String(*msg.Content.Text)

	case entity.MessageTypeImage:
		if msg.Content.ImageURL == nil {
			return nil, errors.ErrEmptyContent
		}
		// Image messages require upload first - this is handled by MessageUseCase
		// This function only builds text messages directly
		return nil, errors.ErrInvalidMessageType.WithMessage("image messages must be built with upload result")

	case entity.MessageTypeDocument:
		if msg.Content.DocURL == nil {
			return nil, errors.ErrEmptyContent
		}
		// Document messages require upload first - this is handled by MessageUseCase
		return nil, errors.ErrInvalidMessageType.WithMessage("document messages must be built with upload result")

	case entity.MessageTypeAudio:
		// Audio messages require upload first - this is handled by MessageUseCase
		return nil, errors.ErrInvalidMessageType.WithMessage("audio messages must be built with upload result")

	case entity.MessageTypeVideo:
		// Video messages require upload first - this is handled by MessageUseCase
		return nil, errors.ErrInvalidMessageType.WithMessage("video messages must be built with upload result")

	default:
		return nil, errors.ErrInvalidMessageType
	}

	return waMsg, nil
}

// BuildImageMessage builds a WhatsApp image message from upload result
func BuildImageMessage(uploadResult *entity.MediaUploadResult, caption string) *waE2E.Message {
	imageMsg := &waE2E.ImageMessage{
		URL:           proto.String(uploadResult.URL),
		DirectPath:    proto.String(uploadResult.DirectPath),
		MediaKey:      uploadResult.MediaKey,
		FileEncSHA256: uploadResult.FileEncHash,
		FileSHA256:    uploadResult.FileHash,
		FileLength:    proto.Uint64(uploadResult.FileLength),
		Mimetype:      proto.String(uploadResult.MimeType),
	}

	if caption != "" {
		imageMsg.Caption = proto.String(caption)
	}

	return &waE2E.Message{
		ImageMessage: imageMsg,
	}
}

// BuildDocumentMessage builds a WhatsApp document message from upload result
func BuildDocumentMessage(uploadResult *entity.MediaUploadResult, filename, caption string) *waE2E.Message {
	docMsg := &waE2E.DocumentMessage{
		URL:           proto.String(uploadResult.URL),
		DirectPath:    proto.String(uploadResult.DirectPath),
		MediaKey:      uploadResult.MediaKey,
		FileEncSHA256: uploadResult.FileEncHash,
		FileSHA256:    uploadResult.FileHash,
		FileLength:    proto.Uint64(uploadResult.FileLength),
		Mimetype:      proto.String(uploadResult.MimeType),
	}

	if filename != "" {
		docMsg.FileName = proto.String(filename)
	}

	if caption != "" {
		docMsg.Caption = proto.String(caption)
	}

	return &waE2E.Message{
		DocumentMessage: docMsg,
	}
}

// BuildAudioMessage builds a WhatsApp audio message from upload result
func BuildAudioMessage(uploadResult *entity.MediaUploadResult) *waE2E.Message {
	audioMsg := &waE2E.AudioMessage{
		URL:           proto.String(uploadResult.URL),
		DirectPath:    proto.String(uploadResult.DirectPath),
		MediaKey:      uploadResult.MediaKey,
		FileEncSHA256: uploadResult.FileEncHash,
		FileSHA256:    uploadResult.FileHash,
		FileLength:    proto.Uint64(uploadResult.FileLength),
		Mimetype:      proto.String(uploadResult.MimeType),
	}

	return &waE2E.Message{
		AudioMessage: audioMsg,
	}
}

// BuildVideoMessage builds a WhatsApp video message from upload result
func BuildVideoMessage(uploadResult *entity.MediaUploadResult, caption string) *waE2E.Message {
	videoMsg := &waE2E.VideoMessage{
		URL:           proto.String(uploadResult.URL),
		DirectPath:    proto.String(uploadResult.DirectPath),
		MediaKey:      uploadResult.MediaKey,
		FileEncSHA256: uploadResult.FileEncHash,
		FileSHA256:    uploadResult.FileHash,
		FileLength:    proto.Uint64(uploadResult.FileLength),
		Mimetype:      proto.String(uploadResult.MimeType),
	}

	if caption != "" {
		videoMsg.Caption = proto.String(caption)
	}

	return &waE2E.Message{
		VideoMessage: videoMsg,
	}
}

// generateEventID generates a unique event ID
func generateEventID() string {
	return time.Now().Format("20060102150405.000000000")
}
