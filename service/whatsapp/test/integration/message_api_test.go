package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	httpHandler "github.com/pharmabroker/whatsapp/internal/presentation/http"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== Test Setup ====================

func setupMessageTestRouter(messageUC *usecase.MessageUseCase) *gin.Engine {
	gin.SetMode(gin.TestMode)
	return httpHandler.NewRouter(nil, messageUC, httpHandler.DefaultRouterConfig())
}

// ==================== POST /api/messages Tests ====================

func TestSendMessage_TextSuccess(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	text := "Hello, World!"
	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var response dto.APIResponse[map[string]interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.NotEmpty(t, response.Data["message_id"])
	assert.Equal(t, "pending", response.Data["status"])
}

func TestSendMessage_InvalidJSON(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "INVALID_JSON", response.Error.Code)
}

func TestSendMessage_ValidationFailed_MissingSessionID(t *testing.T) {
	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(nil, nil, nil, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	text := "Hello"
	reqBody := dto.SendMessageRequest{
		SessionID: "", // Missing session ID
		To:        "+1234567890",
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "VALIDATION_FAILED", response.Error.Code)
}

func TestSendMessage_ValidationFailed_InvalidPhoneNumber(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, nil, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	text := "Hello"
	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "invalid-phone", // Invalid phone number
		Type:      "text",
		Content: dto.SendMessageContentInput{
			Text: &text,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
}

func TestSendMessage_ValidationFailed_EmptyTextContent(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, nil, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "text",
		Content:   dto.SendMessageContentInput{}, // Empty content
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
}

func TestSendMessage_ImageSuccess(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	imageURL := "https://example.com/image.jpg"
	caption := "Test image"
	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "image",
		Content: dto.SendMessageContentInput{
			ImageURL: &imageURL,
			Caption:  &caption,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var response dto.APIResponse[map[string]interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.NotEmpty(t, response.Data["message_id"])
}

func TestSendMessage_ImageWithoutUploader(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()

	config := usecase.DefaultMessageUseCaseConfig()
	// No media uploader
	messageUC := usecase.NewMessageUseCase(waClient, publisher, nil, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	imageURL := "https://example.com/image.jpg"
	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "image",
		Content: dto.SendMessageContentInput{
			ImageURL: &imageURL,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	// Should fail because media uploader is not available
	assert.Equal(t, http.StatusInternalServerError, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
	assert.Equal(t, "MEDIA_UPLOAD_FAILED", response.Error.Code)
}

func TestSendMessage_DocumentSuccess(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	docURL := "https://example.com/document.pdf"
	caption := "Test document"
	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "document",
		Content: dto.SendMessageContentInput{
			DocURL:  &docURL,
			Caption: &caption,
		},
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusAccepted, w.Code)

	var response dto.APIResponse[map[string]interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.True(t, response.Success)
	assert.NotEmpty(t, response.Data["message_id"])
}

func TestSendMessage_DocumentWithoutURL(t *testing.T) {
	waClient := NewWhatsAppClientMock()
	publisher := NewEventPublisherMock()
	mediaUploader := NewMediaUploaderMock()

	config := usecase.DefaultMessageUseCaseConfig()
	messageUC := usecase.NewMessageUseCase(waClient, publisher, mediaUploader, config)
	defer messageUC.Close()

	router := setupMessageTestRouter(messageUC)

	reqBody := dto.SendMessageRequest{
		SessionID: "550e8400-e29b-41d4-a716-446655440000",
		To:        "+1234567890",
		Type:      "document",
		Content:   dto.SendMessageContentInput{}, // Missing doc URL
	}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest(http.MethodPost, "/api/messages", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)

	var response dto.APIResponse[interface{}]
	err := json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)

	assert.False(t, response.Success)
}
