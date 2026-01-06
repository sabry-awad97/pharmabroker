package http

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/application/dto"
	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
)

// GroupsHandler handles HTTP requests for WhatsApp groups
type GroupsHandler struct {
	groupsUC *usecase.GroupsUseCase
}

// NewGroupsHandler creates a new GroupsHandler
func NewGroupsHandler(groupsUC *usecase.GroupsUseCase) *GroupsHandler {
	return &GroupsHandler{
		groupsUC: groupsUC,
	}
}

// SyncGroups handles POST /api/sessions/:id/groups/sync
// Fetches all groups from WhatsApp and returns them for the API server to persist
func (h *GroupsHandler) SyncGroups(c *gin.Context) {
	sessionID := c.Param("id")
	if sessionID == "" {
		respondWithError(c, http.StatusBadRequest, "INVALID_ID", "Session ID is required", nil)
		return
	}

	result, err := h.groupsUC.SyncGroups(c.Request.Context(), sessionID)
	if err != nil {
		handleGroupsError(c, err)
		return
	}

	respondWithSuccess(c, http.StatusOK, result)
}

// handleGroupsError converts domain errors to HTTP responses for groups operations
func handleGroupsError(c *gin.Context, err error) {
	domainErr := errors.GetDomainError(err)
	if domainErr == nil {
		respondWithError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "An internal error occurred", nil)
		return
	}

	statusCode := mapGroupsErrorToHTTPStatus(domainErr.Code)
	respondWithError(c, statusCode, domainErr.Code, domainErr.Message, nil)
}

// mapGroupsErrorToHTTPStatus maps domain error codes to HTTP status codes for groups
func mapGroupsErrorToHTTPStatus(code string) int {
	switch code {
	case "SESSION_NOT_FOUND":
		return http.StatusNotFound
	case "DISCONNECTED":
		return http.StatusBadRequest
	case "INTERNAL_ERROR":
		return http.StatusInternalServerError
	default:
		return http.StatusInternalServerError
	}
}

// SyncGroupsResponse represents the response for the sync groups endpoint
type SyncGroupsResponse struct {
	Groups []dto.GroupResponse `json:"groups"`
	Synced int                 `json:"synced"`
	Errors []string            `json:"errors,omitempty"`
}
