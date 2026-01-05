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

// EncodeQRToBase64 encodes a QR code string to a base64 PNG image
func EncodeQRToBase64(qrCode string) (string, error) {
	png, err := qrcode.Encode(qrCode, qrcode.Medium, 256)
	if err != nil {
		return "", errors.ErrQRGenerationFailed.WithCause(err)
	}
	return base64.StdEncoding.EncodeToString(png), nil
}

// DecodeBase64ToQR decodes a base64 PNG image (for testing)
func DecodeBase64ToQR(base64Str string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(base64Str)
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

// BuildTextMessage builds a WhatsApp text message from a domain message
func BuildTextMessage(msg *entity.Message) (*waE2E.Message, error) {
	if msg.Content.Text == nil || *msg.Content.Text == "" {
		return nil, errors.ErrEmptyContent
	}
	return &waE2E.Message{
		Conversation: proto.String(*msg.Content.Text),
	}, nil
}

// generateEventID generates a unique event ID
func generateEventID() string {
	return time.Now().Format("20060102150405.000000000")
}
