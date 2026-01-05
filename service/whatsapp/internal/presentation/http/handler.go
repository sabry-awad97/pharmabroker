package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/pkg/validator"
)

// Handler defines HTTP handlers for the WhatsApp service
type Handler struct {
	sessionUC *usecase.SessionUseCase
	messageUC *usecase.MessageUseCase
}

// NewHandler creates a new Handler
func NewHandler(sessionUC *usecase.SessionUseCase, messageUC *usecase.MessageUseCase) *Handler {
	return &Handler{
		sessionUC: sessionUC,
		messageUC: messageUC,
	}
}

// CreateSession handles POST /api/sessions
func (h *Handler) CreateSession(c *gin.Context) {
	var req dto.CreateSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithError(c, http.StatusBadRequest, "INVALID_JSON", "Invalid request body", nil)
		return
	}

	if err := validator.Validate(req); err != nil {
		details := validator.ValidationErrors(err)
		respondWithError(c, http.StatusBadRequest, "VALIDATION_FAILED", "Validation failed", details)
		return
	}

	session, err := h.sessionUC.CreateSession(c.Request.Context(), req)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusCreated, dto.NewSessionResponse(session))
}

// ListSessions handles GET /api/sessions
func (h *Handler) ListSessions(c *gin.Context) {
	sessions, err := h.sessionUC.ListSessions(c.Request.Context())
	if err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, dto.NewSessionListResponse(sessions))
}

// GetSession handles GET /api/sessions/:id
func (h *Handler) GetSession(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	session, err := h.sessionUC.GetSession(c.Request.Context(), id)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, dto.NewSessionResponse(session))
}

// DeleteSession handles DELETE /api/sessions/:id
func (h *Handler) DeleteSession(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	if err := h.sessionUC.DeleteSession(c.Request.Context(), id); err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, map[string]string{"message": "Session deleted successfully"})
}

// SendMessage handles POST /api/messages
func (h *Handler) SendMessage(c *gin.Context) {
	var req dto.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithError(c, http.StatusBadRequest, "INVALID_JSON", "Invalid request body", nil)
		return
	}

	if err := validator.Validate(req); err != nil {
		details := validator.ValidationErrors(err)
		respondWithError(c, http.StatusBadRequest, "VALIDATION_FAILED", "Validation failed", details)
		return
	}

	// Additional validation for message content
	if err := req.Validate(); err != nil {
		respondWithError(c, http.StatusBadRequest, "VALIDATION_FAILED", err.Error(), nil)
		return
	}

	msg, err := h.messageUC.SendMessage(c.Request.Context(), req)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusAccepted, map[string]interface{}{
		"message_id": msg.ID,
		"status":     msg.Status.String(),
	})
}

// Health handles GET /health
func (h *Handler) Health(c *gin.Context) {
	respondWithSuccess(c, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// Ready handles GET /ready
func (h *Handler) Ready(c *gin.Context) {
	// Check if dependencies are ready
	// For now, we just return OK
	// In production, this would check DB connection, WhatsApp client, etc.
	respondWithSuccess(c, http.StatusOK, map[string]string{
		"status": "ready",
	})
}

// handleDomainError converts domain errors to HTTP responses
func handleDomainError(c *gin.Context, err error) {
	domainErr := errors.GetDomainError(err)
	if domainErr == nil {
		respondWithError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "An internal error occurred", nil)
		return
	}

	statusCode := mapErrorToHTTPStatus(domainErr.Code)
	respondWithError(c, statusCode, domainErr.Code, domainErr.Message, nil)
}

// mapErrorToHTTPStatus maps domain error codes to HTTP status codes
func mapErrorToHTTPStatus(code string) int {
	switch code {
	case "SESSION_NOT_FOUND", "MESSAGE_NOT_FOUND", "NOT_FOUND":
		return http.StatusNotFound
	case "SESSION_EXISTS", "DUPLICATE":
		return http.StatusConflict
	case "INVALID_PHONE", "VALIDATION_FAILED", "INVALID_INPUT", "EMPTY_CONTENT", "INVALID_MESSAGE_TYPE":
		return http.StatusBadRequest
	case "QR_TIMEOUT":
		return http.StatusRequestTimeout
	case "CONNECTION_FAILED", "DISCONNECTED", "RECONNECT_FAILED":
		return http.StatusServiceUnavailable
	case "DATABASE_ERROR", "INTERNAL_ERROR":
		return http.StatusInternalServerError
	default:
		return http.StatusInternalServerError
	}
}

// respondWithSuccess sends a successful JSON response
func respondWithSuccess(c *gin.Context, statusCode int, data interface{}) {
	c.JSON(statusCode, dto.NewSuccessResponse(data))
}

// respondWithError sends an error JSON response
func respondWithError(c *gin.Context, statusCode int, code, message string, details map[string]string) {
	c.JSON(statusCode, dto.NewErrorResponse[interface{}](code, message, details))
}
