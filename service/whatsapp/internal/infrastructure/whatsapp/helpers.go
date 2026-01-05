package whatsapp

import (
	"encoding/base64"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/skip2/go-qrcode"
	waProto "go.mau.fi/whatsmeow/binary/proto"
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
func buildWhatsAppMessage(msg *entity.Message) (*waProto.Message, error) {
	waMsg := &waProto.Message{}

	switch msg.Type {
	case entity.MessageTypeText:
		if msg.Content.Text == nil || *msg.Content.Text == "" {
			return nil, errors.ErrEmptyContent
		}
		waMsg.Conversation = proto.String(*msg.Content.Text)

	case entity.MessageTypeImage:
		// For image messages, we would need to upload the image first
		// This is a simplified version
		if msg.Content.ImageURL == nil {
			return nil, errors.ErrEmptyContent
		}
		// In a real implementation, you would:
		// 1. Download the image from ImageURL
		// 2. Upload it to WhatsApp servers
		// 3. Create an ImageMessage with the upload response
		return nil, errors.ErrInvalidMessageType.WithMessage("image upload not implemented")

	case entity.MessageTypeDocument:
		// Similar to image, document upload would be needed
		if msg.Content.DocURL == nil {
			return nil, errors.ErrEmptyContent
		}
		return nil, errors.ErrInvalidMessageType.WithMessage("document upload not implemented")

	default:
		return nil, errors.ErrInvalidMessageType
	}

	return waMsg, nil
}

// generateEventID generates a unique event ID
func generateEventID() string {
	return time.Now().Format("20060102150405.000000000")
}
