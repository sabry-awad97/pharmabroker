package property

import (
	"context"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/domain/entity"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/persistence"
)

// Feature: whatsapp-service, Property 2: Session Persistence Round-Trip
// *For any* valid session stored in the repository, retrieving it by ID should return
// an equivalent session with all fields preserved.
// **Validates: Requirements 2.1**

func TestSessionPersistenceRoundTrip_Property2(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Use in-memory repository for testing
	repo := persistence.NewInMemorySessionRepository()

	ctx := context.Background()

	// Property 2.1: Create and retrieve session preserves all fields
	properties.Property("create and retrieve session preserves all fields", prop.ForAll(
		func(id, name, jid string, statusIdx int) bool {
			statuses := []entity.Status{
				entity.StatusPending,
				entity.StatusConnecting,
				entity.StatusConnected,
				entity.StatusDisconnected,
				entity.StatusLoggedOut,
			}
			status := statuses[statusIdx%len(statuses)]

			// Create session
			session := &entity.Session{
				ID:        id,
				JID:       jid,
				Name:      name,
				Status:    status,
				CreatedAt: time.Now().Truncate(time.Second),
				UpdatedAt: time.Now().Truncate(time.Second),
			}

			// Store session (clean up first)
			_ = repo.Delete(ctx, id)
			err := repo.Create(ctx, session)
			if err != nil {
				t.Logf("failed to create session: %v", err)
				return false
			}

			// Retrieve session
			retrieved, err := repo.GetByID(ctx, id)
			if err != nil {
				t.Logf("failed to retrieve session: %v", err)
				_ = repo.Delete(ctx, id)
				return false
			}

			// Clean up
			_ = repo.Delete(ctx, id)

			// Verify all fields are preserved
			idMatch := retrieved.ID == session.ID
			nameMatch := retrieved.Name == session.Name
			jidMatch := retrieved.JID == session.JID
			statusMatch := retrieved.Status == session.Status

			// Timestamps should be within 1 second (due to RFC3339 formatting)
			createdAtMatch := retrieved.CreatedAt.Sub(session.CreatedAt).Abs() < time.Second
			updatedAtMatch := retrieved.UpdatedAt.Sub(session.UpdatedAt).Abs() < time.Second

			return idMatch && nameMatch && jidMatch && statusMatch && createdAtMatch && updatedAtMatch
		},
		genSessionID(),
		genSessionName(),
		genJID(),
		gen.IntRange(0, 4),
	))

	// Property 2.2: Update session preserves ID and updates other fields
	properties.Property("update session preserves ID and updates other fields", prop.ForAll(
		func(id, name1, name2, jid1, jid2 string) bool {
			// Create initial session
			session := entity.NewSession(id, name1)
			session.JID = jid1

			// Clean up any existing session
			_ = repo.Delete(ctx, id)

			err := repo.Create(ctx, session)
			if err != nil {
				t.Logf("failed to create session: %v", err)
				return false
			}

			// Update session
			session.Name = name2
			session.JID = jid2
			session.SetStatus(entity.StatusConnected)

			err = repo.Update(ctx, session)
			if err != nil {
				t.Logf("failed to update session: %v", err)
				_ = repo.Delete(ctx, id)
				return false
			}

			// Retrieve and verify
			retrieved, err := repo.GetByID(ctx, id)
			if err != nil {
				t.Logf("failed to retrieve session: %v", err)
				_ = repo.Delete(ctx, id)
				return false
			}

			// Clean up
			_ = repo.Delete(ctx, id)

			// Verify updates
			idPreserved := retrieved.ID == id
			nameUpdated := retrieved.Name == name2
			jidUpdated := retrieved.JID == jid2
			statusUpdated := retrieved.Status == entity.StatusConnected

			return idPreserved && nameUpdated && jidUpdated && statusUpdated
		},
		genSessionID(),
		genSessionName(),
		genSessionName(),
		genJID(),
		genJID(),
	))

	// Property 2.3: Delete session removes it from repository
	properties.Property("delete session removes it from repository", prop.ForAll(
		func(id, name string) bool {
			// Clean up any existing session
			_ = repo.Delete(ctx, id)

			// Create session
			session := entity.NewSession(id, name)
			err := repo.Create(ctx, session)
			if err != nil {
				t.Logf("failed to create session: %v", err)
				return false
			}

			// Delete session
			err = repo.Delete(ctx, id)
			if err != nil {
				t.Logf("failed to delete session: %v", err)
				return false
			}

			// Try to retrieve - should fail
			_, err = repo.GetByID(ctx, id)
			return err != nil // Should return error (not found)
		},
		genSessionID(),
		genSessionName(),
	))

	// Property 2.4: GetAll returns all created sessions
	properties.Property("GetAll returns all created sessions", prop.ForAll(
		func(count int) bool {
			if count < 1 || count > 10 {
				return true // skip invalid counts
			}

			// Clean up existing sessions
			existing, _ := repo.GetAll(ctx)
			for _, s := range existing {
				_ = repo.Delete(ctx, s.ID)
			}

			// Create multiple sessions
			createdIDs := make(map[string]bool)
			for i := 0; i < count; i++ {
				id := generateUniqueID(i)
				session := entity.NewSession(id, "Test Session")
				err := repo.Create(ctx, session)
				if err != nil {
					t.Logf("failed to create session %d: %v", i, err)
					continue
				}
				createdIDs[id] = true
			}

			// Get all sessions
			sessions, err := repo.GetAll(ctx)
			if err != nil {
				t.Logf("failed to get all sessions: %v", err)
				return false
			}

			// Clean up
			for id := range createdIDs {
				_ = repo.Delete(ctx, id)
			}

			// Verify count
			return len(sessions) == len(createdIDs)
		},
		gen.IntRange(1, 10),
	))

	// Property 2.5: UpdateStatus only changes status field
	properties.Property("UpdateStatus only changes status field", prop.ForAll(
		func(id, name, jid string, newStatusIdx int) bool {
			statuses := []entity.Status{
				entity.StatusPending,
				entity.StatusConnecting,
				entity.StatusConnected,
				entity.StatusDisconnected,
				entity.StatusLoggedOut,
			}
			newStatus := statuses[newStatusIdx%len(statuses)]

			// Clean up any existing session
			_ = repo.Delete(ctx, id)

			// Create session with initial status
			session := entity.NewSession(id, name)
			session.JID = jid
			session.Status = entity.StatusPending

			err := repo.Create(ctx, session)
			if err != nil {
				t.Logf("failed to create session: %v", err)
				return false
			}

			// Update only status
			err = repo.UpdateStatus(ctx, id, newStatus)
			if err != nil {
				t.Logf("failed to update status: %v", err)
				_ = repo.Delete(ctx, id)
				return false
			}

			// Retrieve and verify
			retrieved, err := repo.GetByID(ctx, id)
			if err != nil {
				t.Logf("failed to retrieve session: %v", err)
				_ = repo.Delete(ctx, id)
				return false
			}

			// Clean up
			_ = repo.Delete(ctx, id)

			// Verify only status changed
			idPreserved := retrieved.ID == id
			namePreserved := retrieved.Name == name
			jidPreserved := retrieved.JID == jid
			statusChanged := retrieved.Status == newStatus

			return idPreserved && namePreserved && jidPreserved && statusChanged
		},
		genSessionID(),
		genSessionName(),
		genJID(),
		gen.IntRange(0, 4),
	))

	properties.TestingRun(t)
}

// Generator functions
func genSessionID() gopter.Gen {
	return gen.Identifier().Map(func(s string) string {
		if len(s) > 36 {
			return s[:36]
		}
		if s == "" {
			return "session_default"
		}
		return s
	})
}

func genSessionName() gopter.Gen {
	return gen.Identifier().Map(func(s string) string {
		if len(s) > 100 {
			return s[:100]
		}
		if s == "" {
			return "Default Session"
		}
		return s
	})
}

func genJID() gopter.Gen {
	return gen.Identifier().Map(func(s string) string {
		if s == "" {
			s = "user"
		}
		if len(s) > 50 {
			s = s[:50]
		}
		return s + "@s.whatsapp.net"
	})
}

func generateUniqueID(index int) string {
	return time.Now().Format("20060102150405") + "_" + string(rune('a'+index))
}
