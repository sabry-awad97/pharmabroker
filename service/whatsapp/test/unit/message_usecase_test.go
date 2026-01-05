package unit

import (
	"context"
	"testing"
	"time"

	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== MessageUseCase Tests ====================

func TestMessageUseCase_SendMessage_Text(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer uc.Close()

	text := "Hello, World!"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	require.NoError(t, err)
	assert.NotEmpty(t, msg.ID)
	assert.Equal(t, "session-1", msg.SessionID)
	assert.Equal(t, "+1234567890", msg.To)
	assert.Equal(t, entity.MessageTypeText, msg.Type)
}

func TestMessageUseCase_SendMessage_InvalidPhoneNumber(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer uc.Close()

	text := "Hello"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "invalid-phone",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, errors.ErrInvalidPhoneNumber)
}

func TestMessageUseCase_SendMessage_ImageWithoutUploader(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	// No media uploader
	uc := usecase.NewMessageUseCase(waClient, publisher, nil, config)
	defer uc.Close()

	imageURL := "https://example.com/image.jpg"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "image",
		Content: dto.SendMessageContentInput{
			ImageURL: &imageURL,
		},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, errors.ErrMediaUploadFailed)
}

func TestMessageUseCase_SendMessage_ImageWithUploader(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer uc.Close()

	imageURL := "https://example.com/image.jpg"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "image",
		Content: dto.SendMessageContentInput{
			ImageURL: &imageURL,
		},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	require.NoError(t, err)
	assert.NotEmpty(t, msg.ID)
	assert.Equal(t, entity.MessageTypeImage, msg.Type)
}

func TestMessageUseCase_SendMessage_DocumentWithoutURL(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer uc.Close()

	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "document",
		Content:   dto.SendMessageContentInput{},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, errors.ErrEmptyContent)
}

func TestMessageUseCase_SendMessageSync(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer uc.Close()

	text := "Hello, World!"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}

	msg, err := uc.SendMessageSync(context.Background(), req)

	require.NoError(t, err)
	assert.NotEmpty(t, msg.ID)
	assert.Equal(t, "session-1", msg.SessionID)
	assert.Equal(t, "+1234567890", msg.To)
}

func TestMessageUseCase_SendMessageSync_InvalidPhoneNumber(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer uc.Close()

	text := "Hello"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "invalid",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}

	msg, err := uc.SendMessageSync(context.Background(), req)

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, errors.ErrInvalidPhoneNumber)
}

func TestMessageUseCase_HandleIncomingMessage(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	text := "Incoming message"
	msg := entity.NewMessage(
		"msg-1",
		"session-1",
		"+1234567890",
		"+0987654321",
		entity.MessageContent{Text: &text},
		entity.MessageTypeText,
	)

	err := uc.HandleIncomingMessage(context.Background(), msg)

	require.NoError(t, err)
	// Verify event was published
	assert.GreaterOrEqual(t, len(publisher.Events), 1)
}

func TestMessageUseCase_HandleIncomingMessage_NilMessage(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer uc.Close()

	err := uc.HandleIncomingMessage(context.Background(), nil)

	assert.ErrorIs(t, err, errors.ErrInvalidInput)
}

func TestMessageUseCase_HandleMessageStatusUpdate_Sent(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	err := uc.HandleMessageStatusUpdate(context.Background(), "msg-1", "session-1", entity.MessageStatusSent)

	require.NoError(t, err)
	// Verify event was published
	assert.GreaterOrEqual(t, len(publisher.Events), 1)
}

func TestMessageUseCase_HandleMessageStatusUpdate_Delivered(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	err := uc.HandleMessageStatusUpdate(context.Background(), "msg-1", "session-1", entity.MessageStatusDelivered)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(publisher.Events), 1)
}

func TestMessageUseCase_HandleMessageStatusUpdate_Read(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	err := uc.HandleMessageStatusUpdate(context.Background(), "msg-1", "session-1", entity.MessageStatusRead)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(publisher.Events), 1)
}

func TestMessageUseCase_HandleMessageStatusUpdate_Failed(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	err := uc.HandleMessageStatusUpdate(context.Background(), "msg-1", "session-1", entity.MessageStatusFailed)

	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(publisher.Events), 1)
}

func TestMessageUseCase_QueueSize(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer uc.Close()

	// Initially queue should be empty
	assert.Equal(t, 0, uc.QueueSize())
}

func TestMessageUseCase_IsMediaUploadAvailable(t *testing.T) {
	t.Run("with uploader", func(t *testing.T) {
		mediaUploader := NewMediaUploaderMock()
		config := usecase.DefaultMessageUseCaseConfig()
		uc := usecase.NewMessageUseCase(nil, nil, mediaUploader, config)
		defer uc.Close()

		assert.True(t, uc.IsMediaUploadAvailable())
	})

	t.Run("without uploader", func(t *testing.T) {
		config := usecase.DefaultMessageUseCaseConfig()
		uc := usecase.NewMessageUseCase(nil, nil, nil, config)
		defer uc.Close()

		assert.False(t, uc.IsMediaUploadAvailable())
	})
}

func TestMessageUseCase_GetMediaConstraints(t *testing.T) {
	t.Run("with uploader", func(t *testing.T) {
		mediaUploader := NewMediaUploaderMock()
		config := usecase.DefaultMessageUseCaseConfig()
		uc := usecase.NewMessageUseCase(nil, nil, mediaUploader, config)
		defer uc.Close()

		constraints := uc.GetMediaConstraints()
		assert.NotNil(t, constraints)
	})

	t.Run("without uploader", func(t *testing.T) {
		config := usecase.DefaultMessageUseCaseConfig()
		uc := usecase.NewMessageUseCase(nil, nil, nil, config)
		defer uc.Close()

		constraints := uc.GetMediaConstraints()
		assert.Nil(t, constraints)
	})
}

func TestMessageUseCase_SendMessage_TextWithoutContent(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	uc := usecase.NewMessageUseCase(waClient, publisher, nil, config)
	defer uc.Close()

	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "text",
		Content:   dto.SendMessageContentInput{},
	}

	msg, err := uc.SendMessage(context.Background(), req)

	assert.Nil(t, msg)
	assert.ErrorIs(t, err, errors.ErrEmptyContent)
}

func TestMessageUseCase_SendMessageSync_NoClient(t *testing.T) {
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	config.MaxRetries = 1 // Reduce retries for faster test
	uc := usecase.NewMessageUseCase(nil, publisher, nil, config)
	defer uc.Close()

	text := "Hello"
	req := dto.SendMessageRequest{
		SessionID: "session-1",
		To:        "+1234567890",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	msg, err := uc.SendMessageSync(ctx, req)

	assert.Nil(t, msg)
	assert.Error(t, err)
}
