package usecase

import (
	"context"

	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// GroupsUseCase handles WhatsApp group operations
type GroupsUseCase struct {
	groupFetcher repository.GroupFetcher
}

// NewGroupsUseCase creates a new GroupsUseCase
func NewGroupsUseCase(groupFetcher repository.GroupFetcher) *GroupsUseCase {
	return &GroupsUseCase{
		groupFetcher: groupFetcher,
	}
}

// SyncGroupsResult represents the result of a groups sync operation
type SyncGroupsResult struct {
	Groups []*entity.Group `json:"groups"`
	Synced int             `json:"synced"`
	Errors []string        `json:"errors,omitempty"`
}

// SyncGroups fetches all groups from WhatsApp for the given session
// Returns the groups data for the API server to persist
func (uc *GroupsUseCase) SyncGroups(ctx context.Context, sessionID string) (*SyncGroupsResult, error) {
	if uc.groupFetcher == nil {
		return nil, errors.ErrInternal.WithMessage("group fetcher not available")
	}

	// Fetch groups from WhatsApp
	groups, err := uc.groupFetcher.GetJoinedGroups(ctx, sessionID)
	if err != nil {
		// Check for specific error types
		if errors.IsDomainError(err) {
			return nil, err
		}
		return nil, errors.ErrInternal.WithCause(err).WithMessage("failed to fetch groups")
	}

	result := &SyncGroupsResult{
		Groups: groups,
		Synced: len(groups),
		Errors: []string{},
	}

	return result, nil
}
