package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/pkg/validator"
)

// Handler defines HTTP handlers for the WhatsApp service
type Handler struct {
	sessionUC *usecase.SessionUseCase
	messageUC *usecase.MessageUseCase
	healthUC  *usecase.HealthUseCase
	groupsUC  *usecase.GroupsUseCase
}

// NewHandler creates a new Handler with all use cases
func NewHandler(sessionUC *usecase.SessionUseCase, messageUC *usecase.MessageUseCase, healthUC *usecase.HealthUseCase, groupsUC *usecase.GroupsUseCase) *Handler {
	return &Handler{
		sessionUC: sessionUC,
		messageUC: messageUC,
		healthUC:  healthUC,
		groupsUC:  groupsUC,
	}
}

// SyncGroups handles POST /api/sessions/:id/groups/sync
func (h *Handler) SyncGroups(c *gin.Context) {
	sessionID := c.Param("id")
	if sessionID == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	if h.groupsUC == nil {
		respondWithError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "Groups use case not configured", nil)
		return
	}

	result, err := h.groupsUC.SyncGroups(c.Request.Context(), sessionID)
	if err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, result)
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

	respondWithSuccess(c, http.StatusAccepted, map[string]any{
		"message_id": msg.ID,
		"status":     msg.GetStatus().String(),
	})
}

// RegisterSession handles POST /api/internal/sessions/register
// Called by Node.js API when a new session is created
func (h *Handler) RegisterSession(c *gin.Context) {
	var req struct {
		ID   string `json:"id" binding:"required"`
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithError(c, http.StatusBadRequest, "INVALID_JSON", "Invalid request body", nil)
		return
	}

	// Create session in local repository for WhatsApp client tracking
	session, err := h.sessionUC.CreateSessionWithID(c.Request.Context(), req.ID, req.Name)
	if err != nil {
		// Session might already exist, which is fine
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusCreated, dto.NewSessionResponse(session))
}

// UnregisterSession handles POST /api/internal/sessions/:id/unregister
// Called by Node.js API when a session is deleted
func (h *Handler) UnregisterSession(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	// Disconnect and cleanup WhatsApp client resources
	if err := h.sessionUC.DeleteSession(c.Request.Context(), id); err != nil {
		// Ignore not found errors - session might not exist locally
		if !errors.IsNotFound(err) {
			handleDomainError(c, err)
			return
		}
	}

	respondWithSuccess(c, http.StatusOK, map[string]string{"message": "Session unregistered successfully"})
}

// UpdateSessionStatus handles POST /api/internal/sessions/:id/status
// Called internally when WhatsApp connection status changes
func (h *Handler) UpdateSessionStatus(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
		JID    string `json:"jid,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithError(c, http.StatusBadRequest, "INVALID_JSON", "Invalid request body", nil)
		return
	}

	status := entity.Status(req.Status)
	if !status.IsValid() {
		respondWithError(c, http.StatusBadRequest, "INVALID_STATUS", "Invalid status value", nil)
		return
	}

	if err := h.sessionUC.UpdateSessionStatus(c.Request.Context(), id, status); err != nil {
		handleDomainError(c, err)
		return
	}

	// Update JID if provided
	if req.JID != "" {
		if err := h.sessionUC.UpdateSessionJID(c.Request.Context(), id, req.JID); err != nil {
			handleDomainError(c, err)
			return
		}
	}

	respondWithSuccess(c, http.StatusOK, map[string]string{"message": "Status updated successfully"})
}

// ReconnectSession handles POST /api/internal/sessions/:id/reconnect
// Attempts to reconnect a session using stored WhatsApp credentials
func (h *Handler) ReconnectSession(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	// Parse optional JID from request body
	var req struct {
		JID string `json:"jid,omitempty"`
	}
	// Ignore binding errors - JID is optional
	_ = c.ShouldBindJSON(&req)

	if err := h.sessionUC.ReconnectSessionWithJID(c.Request.Context(), id, req.JID); err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, map[string]any{
		"success": true,
		"message": "Session reconnected successfully",
	})
}

// DisconnectSession handles POST /api/internal/sessions/:id/disconnect
// Disconnects a session without deleting it (keeps credentials for reconnect)
func (h *Handler) DisconnectSession(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	if err := h.sessionUC.DisconnectSession(c.Request.Context(), id); err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, map[string]any{
		"success": true,
		"message": "Session disconnected successfully",
	})
}

// ConfigureHistorySync handles POST /api/internal/sessions/:id/history-sync
// Configures history sync settings for a session
func (h *Handler) ConfigureHistorySync(c *gin.Context) {
	id := c.Param("id")
	if id == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	var req struct {
		Enabled  bool   `json:"enabled"`
		FullSync bool   `json:"full_sync"`
		Since    string `json:"since,omitempty"` // ISO 8601 timestamp for incremental sync
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondWithError(c, http.StatusBadRequest, "INVALID_JSON", "Invalid request body", nil)
		return
	}

	if err := h.sessionUC.ConfigureHistorySync(c.Request.Context(), id, req.Enabled, req.FullSync, req.Since); err != nil {
		handleDomainError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, map[string]any{
		"success": true,
		"message": "History sync configured successfully",
	})
}

// Health handles GET /health (liveness probe)
func (h *Handler) Health(c *gin.Context) {
	if h.healthUC != nil {
		response := h.healthUC.CheckLiveness(c.Request.Context())
		if !response.Alive {
			c.JSON(http.StatusServiceUnavailable, map[string]any{
				"status":  "unhealthy",
				"message": response.Message,
			})
			return
		}

		// Include additional details if requested
		if c.Query("details") == "true" {
			details := h.healthUC.GetHealthDetails(c.Request.Context())
			c.JSON(http.StatusOK, map[string]any{
				"status":  "healthy",
				"message": response.Message,
				"details": details,
			})
			return
		}
	}

	respondWithSuccess(c, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// Ready handles GET /ready (readiness probe)
func (h *Handler) Ready(c *gin.Context) {
	if h.healthUC != nil {
		response := h.healthUC.CheckReadiness(c.Request.Context())

		statusCode := http.StatusOK
		status := "ready"
		if !response.Ready {
			statusCode = http.StatusServiceUnavailable
			status = "not_ready"
		}

		// Use respondWithSuccess for consistent API response format
		if statusCode == http.StatusOK {
			respondWithSuccess(c, statusCode, map[string]any{
				"status":     status,
				"components": response.Components,
			})
		} else {
			c.JSON(statusCode, map[string]any{
				"success": false,
				"error": map[string]any{
					"code":    "NOT_READY",
					"message": "Service is not ready",
				},
				"data": map[string]any{
					"status":     status,
					"components": response.Components,
				},
			})
		}
		return
	}

	// Fallback if health use case is not configured
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
	case "DISCONNECTED":
		return http.StatusBadRequest
	case "INVALID_MEDIA_SIZE", "MEDIA_TOO_LARGE", "UNSUPPORTED_MEDIA_TYPE", "INVALID_MIME_TYPE", "UNSUPPORTED_MIME_TYPE":
		return http.StatusBadRequest
	case "QR_TIMEOUT":
		return http.StatusRequestTimeout
	case "CONNECTION_FAILED", "RECONNECT_FAILED", "CIRCUIT_OPEN":
		return http.StatusServiceUnavailable
	case "DATABASE_ERROR", "INTERNAL_ERROR":
		return http.StatusInternalServerError
	default:
		return http.StatusInternalServerError
	}
}

// respondWithSuccess sends a successful JSON response
func respondWithSuccess(c *gin.Context, statusCode int, data any) {
	c.JSON(statusCode, dto.NewSuccessResponse(data))
}

// respondWithError sends an error JSON response
func respondWithError(c *gin.Context, statusCode int, code, message string, details map[string]string) {
	c.JSON(statusCode, dto.NewErrorResponse[any](code, message, details))
}
