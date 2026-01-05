package property

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
)

// Feature: whatsapp-service, Property 3: Multiple Concurrent Sessions Independence
// *For any* set of concurrent sessions, operations on one session should not affect
// the state or data of other sessions.
// **Validates: Requirements 2.4**

func TestConcurrentSessionsIndependence_Property3(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create a temporary database for testing
	tmpDir, err := os.MkdirTemp("", "whatsapp-concurrent-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test.db")
	dsn := persistence.CreateDSN(dbPath, 5000)

	repo, err := persistence.NewSQLiteSessionRepository(dsn)
	if err != nil {
		t.Fatalf("failed to create repository: %v", err)
	}
	defer repo.Close()

	ctx := context.Background()

	// Property 3.1: Concurrent creates don't interfere with each other
	properties.Property("concurrent creates don't interfere", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 2 || sessionCount > 10 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			var wg sync.WaitGroup
			errors := make(chan error, sessionCount)
			sessions := make([]*entity.Session, sessionCount)

			// Create sessions concurrently
			for i := 0; i < sessionCount; i++ {
				sessions[i] = entity.NewSession(
					generateConcurrentID("create", i),
					"Session "+string(rune('A'+i)),
				)
			}

			for i := 0; i < sessionCount; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					if err := repo.Create(ctx, sessions[idx]); err != nil {
						errors <- err
					}
				}(i)
			}

			wg.Wait()
			close(errors)

			// Check for errors
			for err := range errors {
				t.Logf("concurrent create error: %v", err)
				return false
			}

			// Verify all sessions were created
			all, err := repo.GetAll(ctx)
			if err != nil {
				t.Logf("failed to get all sessions: %v", err)
				return false
			}

			// Clean up
			for _, s := range sessions {
				_ = repo.Delete(ctx, s.ID)
			}

			return len(all) == sessionCount
		},
		gen.IntRange(2, 10),
	))

	// Property 3.2: Updating one session doesn't affect others
	properties.Property("updating one session doesn't affect others", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 2 || sessionCount > 5 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			// Create sessions
			sessions := make([]*entity.Session, sessionCount)
			originalNames := make([]string, sessionCount)
			for i := 0; i < sessionCount; i++ {
				name := "Original " + string(rune('A'+i))
				sessions[i] = entity.NewSession(
					generateConcurrentID("update", i),
					name,
				)
				originalNames[i] = name
				if err := repo.Create(ctx, sessions[i]); err != nil {
					t.Logf("failed to create session: %v", err)
					return false
				}
			}

			// Update only the first session
			sessions[0].Name = "Updated Name"
			sessions[0].SetStatus(entity.StatusConnected)
			if err := repo.Update(ctx, sessions[0]); err != nil {
				t.Logf("failed to update session: %v", err)
				return false
			}

			// Verify other sessions are unchanged
			for i := 1; i < sessionCount; i++ {
				retrieved, err := repo.GetByID(ctx, sessions[i].ID)
				if err != nil {
					t.Logf("failed to retrieve session %d: %v", i, err)
					return false
				}
				if retrieved.Name != originalNames[i] {
					t.Logf("session %d name changed unexpectedly: got %s, want %s",
						i, retrieved.Name, originalNames[i])
					return false
				}
				if retrieved.Status != entity.StatusPending {
					t.Logf("session %d status changed unexpectedly: got %s, want %s",
						i, retrieved.Status, entity.StatusPending)
					return false
				}
			}

			// Clean up
			for _, s := range sessions {
				_ = repo.Delete(ctx, s.ID)
			}

			return true
		},
		gen.IntRange(2, 5),
	))

	// Property 3.3: Deleting one session doesn't affect others
	properties.Property("deleting one session doesn't affect others", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 2 || sessionCount > 5 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			// Create sessions
			sessions := make([]*entity.Session, sessionCount)
			for i := 0; i < sessionCount; i++ {
				sessions[i] = entity.NewSession(
					generateConcurrentID("delete", i),
					"Session "+string(rune('A'+i)),
				)
				if err := repo.Create(ctx, sessions[i]); err != nil {
					t.Logf("failed to create session: %v", err)
					return false
				}
			}

			// Delete the first session
			if err := repo.Delete(ctx, sessions[0].ID); err != nil {
				t.Logf("failed to delete session: %v", err)
				return false
			}

			// Verify other sessions still exist
			for i := 1; i < sessionCount; i++ {
				retrieved, err := repo.GetByID(ctx, sessions[i].ID)
				if err != nil {
					t.Logf("session %d was unexpectedly deleted: %v", i, err)
					return false
				}
				if retrieved.ID != sessions[i].ID {
					t.Logf("session %d ID mismatch", i)
					return false
				}
			}

			// Clean up remaining sessions
			for i := 1; i < sessionCount; i++ {
				_ = repo.Delete(ctx, sessions[i].ID)
			}

			return true
		},
		gen.IntRange(2, 5),
	))

	// Property 3.4: Concurrent updates to different sessions don't interfere
	properties.Property("concurrent updates to different sessions don't interfere", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 2 || sessionCount > 5 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			// Create sessions
			sessions := make([]*entity.Session, sessionCount)
			for i := 0; i < sessionCount; i++ {
				sessions[i] = entity.NewSession(
					generateConcurrentID("concurrent_update", i),
					"Session "+string(rune('A'+i)),
				)
				if err := repo.Create(ctx, sessions[i]); err != nil {
					t.Logf("failed to create session: %v", err)
					return false
				}
			}

			// Update all sessions concurrently
			var wg sync.WaitGroup
			errors := make(chan error, sessionCount)
			expectedNames := make([]string, sessionCount)

			for i := 0; i < sessionCount; i++ {
				expectedNames[i] = "Updated " + string(rune('A'+i))
				wg.Add(1)
				go func(idx int, newName string) {
					defer wg.Done()
					sessions[idx].Name = newName
					if err := repo.Update(ctx, sessions[idx]); err != nil {
						errors <- err
					}
				}(i, expectedNames[i])
			}

			wg.Wait()
			close(errors)

			// Check for errors
			for err := range errors {
				t.Logf("concurrent update error: %v", err)
				return false
			}

			// Verify all sessions have correct names
			for i := 0; i < sessionCount; i++ {
				retrieved, err := repo.GetByID(ctx, sessions[i].ID)
				if err != nil {
					t.Logf("failed to retrieve session %d: %v", i, err)
					return false
				}
				if retrieved.Name != expectedNames[i] {
					t.Logf("session %d name mismatch: got %s, want %s",
						i, retrieved.Name, expectedNames[i])
					return false
				}
			}

			// Clean up
			for _, s := range sessions {
				_ = repo.Delete(ctx, s.ID)
			}

			return true
		},
		gen.IntRange(2, 5),
	))

	// Property 3.5: Concurrent status updates to different sessions are independent
	properties.Property("concurrent status updates are independent", prop.ForAll(
		func(sessionCount int) bool {
			if sessionCount < 2 || sessionCount > 5 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			statuses := []entity.Status{
				entity.StatusConnected,
				entity.StatusDisconnected,
				entity.StatusConnecting,
				entity.StatusLoggedOut,
				entity.StatusPending,
			}

			// Create sessions
			sessions := make([]*entity.Session, sessionCount)
			for i := 0; i < sessionCount; i++ {
				sessions[i] = entity.NewSession(
					generateConcurrentID("status_update", i),
					"Session "+string(rune('A'+i)),
				)
				if err := repo.Create(ctx, sessions[i]); err != nil {
					t.Logf("failed to create session: %v", err)
					return false
				}
			}

			// Update statuses concurrently
			var wg sync.WaitGroup
			errors := make(chan error, sessionCount)
			expectedStatuses := make([]entity.Status, sessionCount)

			for i := 0; i < sessionCount; i++ {
				expectedStatuses[i] = statuses[i%len(statuses)]
				wg.Add(1)
				go func(idx int, status entity.Status) {
					defer wg.Done()
					if err := repo.UpdateStatus(ctx, sessions[idx].ID, status); err != nil {
						errors <- err
					}
				}(i, expectedStatuses[i])
			}

			wg.Wait()
			close(errors)

			// Check for errors
			for err := range errors {
				t.Logf("concurrent status update error: %v", err)
				return false
			}

			// Verify all sessions have correct statuses
			for i := 0; i < sessionCount; i++ {
				retrieved, err := repo.GetByID(ctx, sessions[i].ID)
				if err != nil {
					t.Logf("failed to retrieve session %d: %v", i, err)
					return false
				}
				if retrieved.Status != expectedStatuses[i] {
					t.Logf("session %d status mismatch: got %s, want %s",
						i, retrieved.Status, expectedStatuses[i])
					return false
				}
			}

			// Clean up
			for _, s := range sessions {
				_ = repo.Delete(ctx, s.ID)
			}

			return true
		},
		gen.IntRange(2, 5),
	))

	properties.TestingRun(t)
}

// generateConcurrentID generates a unique ID for concurrent tests
func generateConcurrentID(prefix string, index int) string {
	return prefix + "_" + string(rune('a'+index)) + "_test"
}
