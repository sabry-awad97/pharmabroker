package property

import (
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
)

// Feature: whatsapp-service, Property 4: Exponential Backoff Retry Pattern
// *For any* sequence of retry attempts, the delay between attempts should follow
// exponential backoff (delay = base * 2^attempt) up to a maximum delay.
// **Validates: Requirements 2.7, 4.5**

func TestExponentialBackoff_Property4(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 4.1: Each backoff delay should be double the previous (until max)
	properties.Property("backoff delay doubles each time", prop.ForAll(
		func(baseDelayMs int, maxAttempts int) bool {
			if baseDelayMs < 1 || maxAttempts < 1 || maxAttempts > 20 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			maxDelay := time.Duration(maxAttempts) * time.Minute

			currentDelay := baseDelay
			for i := 0; i < maxAttempts; i++ {
				nextDelay := whatsapp.CalculateBackoff(currentDelay, maxAttempts)

				// Next delay should be either double or capped at max
				expectedDouble := currentDelay * 2
				if expectedDouble > maxDelay {
					// Should be capped at max
					if nextDelay != maxDelay {
						t.Logf("Expected max delay %v, got %v at attempt %d", maxDelay, nextDelay, i)
						return false
					}
				} else {
					// Should be double
					if nextDelay != expectedDouble {
						t.Logf("Expected double %v, got %v at attempt %d", expectedDouble, nextDelay, i)
						return false
					}
				}

				currentDelay = nextDelay
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
		gen.IntRange(1, 10),     // max attempts
	))

	// Property 4.2: Backoff delay should never exceed maximum
	properties.Property("backoff delay never exceeds maximum", prop.ForAll(
		func(baseDelayMs int, maxAttempts int, iterations int) bool {
			if baseDelayMs < 1 || maxAttempts < 1 || iterations < 1 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			maxDelay := time.Duration(maxAttempts) * time.Minute

			currentDelay := baseDelay
			for i := 0; i < iterations; i++ {
				currentDelay = whatsapp.CalculateBackoff(currentDelay, maxAttempts)
				if currentDelay > maxDelay {
					t.Logf("Delay %v exceeded max %v at iteration %d", currentDelay, maxDelay, i)
					return false
				}
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
		gen.IntRange(1, 10),     // max attempts
		gen.IntRange(1, 50),     // iterations
	))

	// Property 4.3: Backoff with base calculation follows formula
	properties.Property("backoff with base follows formula delay = base * 2^attempt", prop.ForAll(
		func(baseDelayMs int, attempt int) bool {
			if baseDelayMs < 1 || attempt < 0 || attempt > 20 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			maxDelay := 10 * time.Minute

			result := whatsapp.CalculateBackoffWithBase(baseDelay, attempt, maxDelay)

			// Calculate expected value
			expected := baseDelay
			for i := 0; i < attempt; i++ {
				expected *= 2
				if expected > maxDelay {
					expected = maxDelay
					break
				}
			}

			if result != expected {
				t.Logf("Expected %v, got %v for base=%v, attempt=%d", expected, result, baseDelay, attempt)
				return false
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
		gen.IntRange(0, 15),     // attempt number
	))

	// Property 4.4: Backoff is monotonically increasing (until max)
	properties.Property("backoff is monotonically increasing until max", prop.ForAll(
		func(baseDelayMs int, maxAttempts int) bool {
			if baseDelayMs < 1 || maxAttempts < 1 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			_ = time.Duration(maxAttempts) * time.Minute // maxDelay for reference

			prevDelay := baseDelay
			currentDelay := baseDelay

			for i := 0; i < 20; i++ {
				currentDelay = whatsapp.CalculateBackoff(currentDelay, maxAttempts)

				// Current should be >= previous (monotonically increasing)
				if currentDelay < prevDelay {
					t.Logf("Delay decreased from %v to %v at iteration %d", prevDelay, currentDelay, i)
					return false
				}

				prevDelay = currentDelay
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
		gen.IntRange(1, 10),     // max attempts
	))

	// Property 4.5: Zero attempt should return base delay
	properties.Property("zero attempt returns base delay", prop.ForAll(
		func(baseDelayMs int) bool {
			if baseDelayMs < 1 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			maxDelay := 10 * time.Minute

			result := whatsapp.CalculateBackoffWithBase(baseDelay, 0, maxDelay)

			if result != baseDelay {
				t.Logf("Expected base delay %v, got %v", baseDelay, result)
				return false
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
	))

	// Property 4.6: Large attempt numbers should cap at max delay
	properties.Property("large attempt numbers cap at max delay", prop.ForAll(
		func(baseDelayMs int, maxDelayMin int) bool {
			if baseDelayMs < 1 || maxDelayMin < 1 {
				return true // skip invalid inputs
			}

			baseDelay := time.Duration(baseDelayMs) * time.Millisecond
			maxDelay := time.Duration(maxDelayMin) * time.Minute

			// Use a very large attempt number
			result := whatsapp.CalculateBackoffWithBase(baseDelay, 100, maxDelay)

			if result != maxDelay {
				t.Logf("Expected max delay %v, got %v for large attempt", maxDelay, result)
				return false
			}

			return true
		},
		gen.IntRange(100, 5000), // base delay in ms
		gen.IntRange(1, 10),     // max delay in minutes
	))

	properties.TestingRun(t)
}
