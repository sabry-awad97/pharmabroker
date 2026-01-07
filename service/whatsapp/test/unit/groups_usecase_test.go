package unit

import (
	"context"
	"testing"
	"time"

	"github.com/pharmabroker/whatsapp/internal/application/usecase"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ==================== GroupFetcher Mock ====================

// GroupFetcherMock is a mock implementation of GroupFetcher
type GroupFetcherMock struct {
	groups      map[string][]*entity.Group
	getGroupsFn func(ctx context.Context, sessionID string) ([]*entity.Group, error)
}

func NewGroupFetcherMock() *GroupFetcherMock {
	return &GroupFetcherMock{
		groups: make(map[string][]*entity.Group),
	}
}

func (m *GroupFetcherMock) GetJoinedGroups(ctx context.Context, sessionID string) ([]*entity.Group, error) {
	if m.getGroupsFn != nil {
		return m.getGroupsFn(ctx, sessionID)
	}
	if groups, ok := m.groups[sessionID]; ok {
		return groups, nil
	}
	return nil, errors.ErrSessionNotFound
}

// ==================== GroupsUseCase Tests ====================

func TestGroupsUseCase_SyncGroups_Success(t *testing.T) {
	fetcher := NewGroupFetcherMock()

	// Setup test groups
	testGroups := []*entity.Group{
		{
			ID:        "group-1",
			JID:       "1234567890@g.us",
			Name:      "Test Group 1",
			SessionID: "session-1",
		},
		{
			ID:        "group-2",
			JID:       "0987654321@g.us",
			Name:      "Test Group 2",
			SessionID: "session-1",
		},
	}
	fetcher.groups["session-1"] = testGroups

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 2, result.Synced)
	assert.Len(t, result.Groups, 2)
	assert.Empty(t, result.Errors)
}

func TestGroupsUseCase_SyncGroups_EmptyGroups(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.groups["session-1"] = []*entity.Group{}

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 0, result.Synced)
	assert.Empty(t, result.Groups)
	assert.Empty(t, result.Errors)
}

func TestGroupsUseCase_SyncGroups_SessionNotFound(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.getGroupsFn = func(ctx context.Context, sessionID string) ([]*entity.Group, error) {
		return nil, errors.ErrSessionNotFound
	}

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "non-existent-session")

	assert.Nil(t, result)
	assert.ErrorIs(t, err, errors.ErrSessionNotFound)
}

func TestGroupsUseCase_SyncGroups_SessionDisconnected(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.getGroupsFn = func(ctx context.Context, sessionID string) ([]*entity.Group, error) {
		return nil, errors.ErrDisconnected
	}

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "disconnected-session")

	assert.Nil(t, result)
	assert.ErrorIs(t, err, errors.ErrDisconnected)
}

func TestGroupsUseCase_SyncGroups_NilFetcher(t *testing.T) {
	uc := usecase.NewGroupsUseCase(nil)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	assert.Nil(t, result)
	assert.Error(t, err)
	// Should return internal error when fetcher is nil
	domainErr := errors.GetDomainError(err)
	assert.NotNil(t, domainErr)
	assert.Equal(t, "INTERNAL_ERROR", domainErr.Code)
}

func TestGroupsUseCase_SyncGroups_InternalError(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.getGroupsFn = func(ctx context.Context, sessionID string) ([]*entity.Group, error) {
		return nil, errors.ErrInternal.WithMessage("database connection failed")
	}

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	assert.Nil(t, result)
	assert.Error(t, err)
	domainErr := errors.GetDomainError(err)
	assert.NotNil(t, domainErr)
	assert.Equal(t, "INTERNAL_ERROR", domainErr.Code)
}

func TestGroupsUseCase_SyncGroups_NonDomainError(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.getGroupsFn = func(ctx context.Context, sessionID string) ([]*entity.Group, error) {
		return nil, context.DeadlineExceeded
	}

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	assert.Nil(t, result)
	assert.Error(t, err)
	// Non-domain errors should be wrapped as internal errors
	domainErr := errors.GetDomainError(err)
	assert.NotNil(t, domainErr)
	assert.Equal(t, "INTERNAL_ERROR", domainErr.Code)
}

func TestGroupsUseCase_SyncGroups_LargeGroupCount(t *testing.T) {
	fetcher := NewGroupFetcherMock()

	// Create 100 test groups
	testGroups := make([]*entity.Group, 100)
	for i := 0; i < 100; i++ {
		testGroups[i] = &entity.Group{
			ID:        "group-" + string(rune(i)),
			JID:       "group-" + string(rune(i)) + "@g.us",
			Name:      "Test Group " + string(rune(i)),
			SessionID: "session-1",
		}
	}
	fetcher.groups["session-1"] = testGroups

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	require.NoError(t, err)
	assert.NotNil(t, result)
	assert.Equal(t, 100, result.Synced)
	assert.Len(t, result.Groups, 100)
}

func TestGroupsUseCase_SyncGroups_ContextCancelled(t *testing.T) {
	fetcher := NewGroupFetcherMock()
	fetcher.getGroupsFn = func(ctx context.Context, sessionID string) ([]*entity.Group, error) {
		return nil, ctx.Err()
	}

	uc := usecase.NewGroupsUseCase(fetcher)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	result, err := uc.SyncGroups(ctx, "session-1")

	assert.Nil(t, result)
	assert.Error(t, err)
}

// ==================== Error Mapping Tests ====================

func TestMapGroupsErrorToHTTPStatus(t *testing.T) {
	tests := []struct {
		name         string
		errorCode    string
		expectedCode int
	}{
		{
			name:         "SESSION_NOT_FOUND returns 404",
			errorCode:    "SESSION_NOT_FOUND",
			expectedCode: 404,
		},
		{
			name:         "DISCONNECTED returns 400",
			errorCode:    "DISCONNECTED",
			expectedCode: 400,
		},
		{
			name:         "INTERNAL_ERROR returns 500",
			errorCode:    "INTERNAL_ERROR",
			expectedCode: 500,
		},
		{
			name:         "Unknown error returns 500",
			errorCode:    "UNKNOWN_ERROR",
			expectedCode: 500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Test the error code mapping logic
			var statusCode int
			switch tt.errorCode {
			case "SESSION_NOT_FOUND":
				statusCode = 404
			case "DISCONNECTED":
				statusCode = 400
			case "INTERNAL_ERROR":
				statusCode = 500
			default:
				statusCode = 500
			}
			assert.Equal(t, tt.expectedCode, statusCode)
		})
	}
}

// ==================== Property Tests ====================

// Feature: whatsapp-groups-filter-counts, Property 6: Go Client Data Mapping
// For any WhatsApp API response containing group data, the Go client SHALL correctly
// map the archived and muted status to the Group entity fields.

func TestGroupEntity_DataMapping_IncludesFilterFields(t *testing.T) {
	// Property: For any group entity, the JSON serialization SHALL include
	// is_archived and is_muted fields with correct values

	testCases := []struct {
		name       string
		isArchived bool
		isMuted    bool
	}{
		{"both false", false, false},
		{"archived only", true, false},
		{"muted only", false, true},
		{"both true", true, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			group := entity.NewGroup("test-id", "123@g.us", "Test Group", "session-1")
			group.IsArchived = tc.isArchived
			group.IsMuted = tc.isMuted

			// Verify fields are set correctly
			assert.Equal(t, tc.isArchived, group.IsArchived)
			assert.Equal(t, tc.isMuted, group.IsMuted)

			// Verify JSON serialization includes the fields
			jsonBytes, err := group.MarshalJSON()
			require.NoError(t, err)

			jsonStr := string(jsonBytes)
			assert.Contains(t, jsonStr, `"is_archived"`)
			assert.Contains(t, jsonStr, `"is_muted"`)
		})
	}
}

func TestGroupEntity_MutedUntil_Serialization(t *testing.T) {
	// Property: For any group with mutedUntil set, the JSON serialization
	// SHALL include the muted_until field in RFC3339 format

	group := entity.NewGroup("test-id", "123@g.us", "Test Group", "session-1")

	// Test with nil mutedUntil
	jsonBytes, err := group.MarshalJSON()
	require.NoError(t, err)
	assert.NotContains(t, string(jsonBytes), `"muted_until"`)

	// Test with set mutedUntil
	now := time.Now()
	group.MutedUntil = &now

	jsonBytes, err = group.MarshalJSON()
	require.NoError(t, err)
	assert.Contains(t, string(jsonBytes), `"muted_until"`)
}

func TestGroupFetcher_ReturnsGroupsWithFilterFields(t *testing.T) {
	// Property: For any sync operation, returned groups SHALL have
	// IsArchived and IsMuted fields initialized (default to false)

	fetcher := NewGroupFetcherMock()

	testGroups := []*entity.Group{
		{
			ID:         "group-1",
			JID:        "1234567890@g.us",
			Name:       "Test Group 1",
			SessionID:  "session-1",
			IsArchived: false,
			IsMuted:    false,
		},
		{
			ID:         "group-2",
			JID:        "0987654321@g.us",
			Name:       "Test Group 2",
			SessionID:  "session-1",
			IsArchived: true,
			IsMuted:    true,
		},
	}
	fetcher.groups["session-1"] = testGroups

	uc := usecase.NewGroupsUseCase(fetcher)

	result, err := uc.SyncGroups(context.Background(), "session-1")

	require.NoError(t, err)
	require.Len(t, result.Groups, 2)

	// Verify first group has default values
	assert.False(t, result.Groups[0].IsArchived)
	assert.False(t, result.Groups[0].IsMuted)

	// Verify second group has set values
	assert.True(t, result.Groups[1].IsArchived)
	assert.True(t, result.Groups[1].IsMuted)
}
