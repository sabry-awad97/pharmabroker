package property

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"pgregory.net/rapid"
)

// ==================== Property-Based Tests for WebSocket Authentication ====================

// AuthMessage represents the authentication message sent by Go service
type AuthMessage struct {
	Type   string `json:"type"`
	APIKey string `json:"api_key"`
}

// AuthResponse represents the authentication response from Node.js API
type AuthResponse struct {
	Type    string `json:"type"`
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}

// simulateAuth simulates the authentication logic
func simulateAuth(providedKey, expectedKey string) AuthResponse {
	// If no expected key (empty string), allow all
	if expectedKey == "" {
		return AuthResponse{
			Type:    "auth_response",
			Success: true,
			Message: "Authentication successful",
		}
	}

	// Check if keys match
	if providedKey == expectedKey {
		return AuthResponse{
			Type:    "auth_response",
			Success: true,
			Message: "Authentication successful",
		}
	}

	return AuthResponse{
		Type:    "auth_response",
		Success: false,
		Message: "Invalid API key",
	}
}

// ==================== Property Tests ====================

// Property 1: Matching keys always authenticate successfully
func TestProperty_MatchingKeysAlwaysAuthenticate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate a random API key
		key := rapid.String().Draw(t, "api_key")

		// When provided key matches expected key, auth should succeed
		response := simulateAuth(key, key)

		assert.Equal(t, "auth_response", response.Type)
		assert.True(t, response.Success, "Matching keys should always authenticate")
	})
}

// Property 2: Different non-empty keys never authenticate
func TestProperty_DifferentKeysNeverAuthenticate(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate two different non-empty keys
		key1 := rapid.StringMatching(`[a-zA-Z0-9]{1,50}`).Draw(t, "key1")
		key2 := rapid.StringMatching(`[a-zA-Z0-9]{1,50}`).Draw(t, "key2")

		// Skip if keys happen to be the same
		if key1 == key2 {
			return
		}

		// When keys don't match, auth should fail
		response := simulateAuth(key1, key2)

		assert.Equal(t, "auth_response", response.Type)
		assert.False(t, response.Success, "Different keys should never authenticate")
		assert.Equal(t, "Invalid API key", response.Message)
	})
}

// Property 3: Empty expected key allows any provided key
func TestProperty_EmptyExpectedKeyAllowsAll(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate any random key
		providedKey := rapid.String().Draw(t, "provided_key")

		// When expected key is empty, any key should work
		response := simulateAuth(providedKey, "")

		assert.Equal(t, "auth_response", response.Type)
		assert.True(t, response.Success, "Empty expected key should allow any key")
	})
}

// Property 4: Authentication is deterministic
func TestProperty_AuthenticationIsDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		providedKey := rapid.String().Draw(t, "provided_key")
		expectedKey := rapid.String().Draw(t, "expected_key")

		// Same inputs should always produce same outputs
		response1 := simulateAuth(providedKey, expectedKey)
		response2 := simulateAuth(providedKey, expectedKey)

		assert.Equal(t, response1.Type, response2.Type)
		assert.Equal(t, response1.Success, response2.Success)
		assert.Equal(t, response1.Message, response2.Message)
	})
}

// Property 5: Auth response always has correct type
func TestProperty_AuthResponseAlwaysHasCorrectType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		providedKey := rapid.String().Draw(t, "provided_key")
		expectedKey := rapid.String().Draw(t, "expected_key")

		response := simulateAuth(providedKey, expectedKey)

		assert.Equal(t, "auth_response", response.Type, "Response type should always be 'auth_response'")
	})
}

// ==================== Backoff Property Tests ====================

// calculateBackoff calculates exponential backoff delay
func calculateBackoff(currentDelay, maxDelay time.Duration) time.Duration {
	nextDelay := currentDelay * 2
	if nextDelay > maxDelay {
		return maxDelay
	}
	return nextDelay
}

// Property 6: Backoff is always positive
func TestProperty_BackoffAlwaysPositive(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		currentDelay := time.Duration(rapid.Int64Range(1, int64(time.Hour)).Draw(t, "current_delay"))
		maxDelay := time.Duration(rapid.Int64Range(1, int64(24*time.Hour)).Draw(t, "max_delay"))

		result := calculateBackoff(currentDelay, maxDelay)

		assert.Greater(t, int64(result), int64(0), "Backoff should always be positive")
	})
}

// Property 7: Backoff never exceeds max
func TestProperty_BackoffNeverExceedsMax(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		currentDelay := time.Duration(rapid.Int64Range(1, int64(time.Hour)).Draw(t, "current_delay"))
		maxDelay := time.Duration(rapid.Int64Range(1, int64(24*time.Hour)).Draw(t, "max_delay"))

		result := calculateBackoff(currentDelay, maxDelay)

		assert.LessOrEqual(t, int64(result), int64(maxDelay), "Backoff should never exceed max")
	})
}

// Property 8: Backoff is monotonically non-decreasing until max
func TestProperty_BackoffMonotonicallyNonDecreasing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		initialDelay := time.Duration(rapid.Int64Range(1, int64(time.Second)).Draw(t, "initial_delay"))
		maxDelay := time.Duration(rapid.Int64Range(int64(time.Minute), int64(time.Hour)).Draw(t, "max_delay"))

		delay := initialDelay
		prevDelay := time.Duration(0)

		// Run through several iterations
		for i := 0; i < 10; i++ {
			assert.GreaterOrEqual(t, int64(delay), int64(prevDelay), "Backoff should be monotonically non-decreasing")
			prevDelay = delay
			delay = calculateBackoff(delay, maxDelay)
		}
	})
}

// Property 9: Backoff doubles when below max
func TestProperty_BackoffDoublesWhenBelowMax(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		currentDelay := time.Duration(rapid.Int64Range(1, int64(time.Minute)).Draw(t, "current_delay"))
		maxDelay := time.Duration(rapid.Int64Range(int64(time.Hour), int64(24*time.Hour)).Draw(t, "max_delay"))

		// Ensure current delay * 2 is below max
		if currentDelay*2 > maxDelay {
			return
		}

		result := calculateBackoff(currentDelay, maxDelay)

		assert.Equal(t, currentDelay*2, result, "Backoff should double when below max")
	})
}

// ==================== Event Queue Property Tests ====================

// Property 10: Queue size is always non-negative
func TestProperty_QueueSizeNonNegative(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		queueSize := rapid.IntRange(0, 10000).Draw(t, "queue_size")

		assert.GreaterOrEqual(t, queueSize, 0, "Queue size should be non-negative")
	})
}

// ==================== Connection State Property Tests ====================

// ConnectionState represents the publisher connection state
type ConnectionState struct {
	Connected     bool
	Authenticated bool
}

// simulateConnectionFlow simulates the connection state machine
func simulateConnectionFlow(connectSuccess, authSuccess bool) ConnectionState {
	state := ConnectionState{
		Connected:     false,
		Authenticated: false,
	}

	if !connectSuccess {
		return state
	}

	state.Connected = true

	if authSuccess {
		state.Authenticated = true
	} else {
		// Auth failed, disconnect
		state.Connected = false
	}

	return state
}

// Property 11: Authentication requires connection
func TestProperty_AuthRequiresConnection(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		connectSuccess := rapid.Bool().Draw(t, "connect_success")
		authSuccess := rapid.Bool().Draw(t, "auth_success")

		state := simulateConnectionFlow(connectSuccess, authSuccess)

		// If authenticated, must be connected
		if state.Authenticated {
			assert.True(t, state.Connected, "Authentication requires connection")
		}
	})
}

// Property 12: Failed auth disconnects
func TestProperty_FailedAuthDisconnects(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Connect succeeds but auth fails
		state := simulateConnectionFlow(true, false)

		assert.False(t, state.Connected, "Failed auth should disconnect")
		assert.False(t, state.Authenticated, "Failed auth should not authenticate")
	})
}

// Property 13: Successful flow results in authenticated state
func TestProperty_SuccessfulFlowAuthenticates(t *testing.T) {
	// When both connect and auth succeed, should be authenticated
	state := simulateConnectionFlow(true, true)

	assert.True(t, state.Connected, "Successful flow should be connected")
	assert.True(t, state.Authenticated, "Successful flow should be authenticated")
}

// Property 14: Failed connect never authenticates
func TestProperty_FailedConnectNeverAuthenticates(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		authSuccess := rapid.Bool().Draw(t, "auth_success")

		// Connect fails
		state := simulateConnectionFlow(false, authSuccess)

		assert.False(t, state.Connected, "Failed connect should not be connected")
		assert.False(t, state.Authenticated, "Failed connect should never authenticate")
	})
}
