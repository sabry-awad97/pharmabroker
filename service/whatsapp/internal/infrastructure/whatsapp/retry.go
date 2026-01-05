package whatsapp

import (
	"context"
	"math/rand"
	"sync"
	"time"
)

// RetryConfig holds configuration for retry behavior
type RetryConfig struct {
	// MaxAttempts is the maximum number of retry attempts (0 = no retries)
	MaxAttempts int

	// InitialDelay is the initial delay before the first retry
	InitialDelay time.Duration

	// MaxDelay is the maximum delay between retries
	MaxDelay time.Duration

	// Multiplier is the factor by which the delay increases after each retry
	Multiplier float64

	// JitterFactor is the maximum jitter as a fraction of the delay (0.0 to 1.0)
	// For example, 0.1 means up to 10% jitter
	JitterFactor float64

	// RetryBudget is the maximum number of retries allowed per time window
	// 0 means no budget limit
	RetryBudget int

	// RetryBudgetWindow is the time window for the retry budget
	RetryBudgetWindow time.Duration
}

// DefaultRetryConfig returns default retry configuration
func DefaultRetryConfig() RetryConfig {
	return RetryConfig{
		MaxAttempts:       3,
		InitialDelay:      100 * time.Millisecond,
		MaxDelay:          30 * time.Second,
		Multiplier:        2.0,
		JitterFactor:      0.1,
		RetryBudget:       100,
		RetryBudgetWindow: time.Minute,
	}
}

// RetryPolicy implements configurable retry logic with jitter and budget
type RetryPolicy struct {
	config      RetryConfig
	budgetMu    sync.Mutex
	retryCount  int
	windowStart time.Time
	rng         *rand.Rand
}

// NewRetryPolicy creates a new retry policy with the given configuration
func NewRetryPolicy(config RetryConfig) *RetryPolicy {
	return &RetryPolicy{
		config:      config,
		windowStart: time.Now(),
		rng:         rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// Execute runs the given function with retry logic
func (p *RetryPolicy) Execute(ctx context.Context, fn func() error) error {
	var lastErr error

	for attempt := 0; attempt <= p.config.MaxAttempts; attempt++ {
		// Check context before each attempt
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		// Check retry budget
		if attempt > 0 && !p.checkBudget() {
			return lastErr
		}

		// Execute the function
		err := fn()
		if err == nil {
			return nil
		}

		lastErr = err

		// Don't wait after the last attempt
		if attempt < p.config.MaxAttempts {
			delay := p.calculateDelay(attempt)

			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
				// Continue to next attempt
			}
		}
	}

	return lastErr
}

// ExecuteWithResult runs the given function with retry logic and returns a result
func (p *RetryPolicy) ExecuteWithResult(ctx context.Context, fn func() (any, error)) (any, error) {
	var lastErr error
	var result any

	for attempt := 0; attempt <= p.config.MaxAttempts; attempt++ {
		// Check context before each attempt
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		// Check retry budget
		if attempt > 0 && !p.checkBudget() {
			return nil, lastErr
		}

		// Execute the function
		result, err := fn()
		if err == nil {
			return result, nil
		}

		lastErr = err

		// Don't wait after the last attempt
		if attempt < p.config.MaxAttempts {
			delay := p.calculateDelay(attempt)

			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
				// Continue to next attempt
			}
		}
	}

	return result, lastErr
}

// calculateDelay calculates the delay for a given attempt with jitter
func (p *RetryPolicy) calculateDelay(attempt int) time.Duration {
	// Calculate base delay with exponential backoff
	delay := float64(p.config.InitialDelay)
	for i := 0; i < attempt; i++ {
		delay *= p.config.Multiplier
	}

	// Cap at max delay
	if delay > float64(p.config.MaxDelay) {
		delay = float64(p.config.MaxDelay)
	}

	// Add jitter
	if p.config.JitterFactor > 0 {
		jitter := delay * p.config.JitterFactor * (2*p.rng.Float64() - 1)
		delay += jitter
	}

	// Ensure delay is not negative
	if delay < 0 {
		delay = 0
	}

	return time.Duration(delay)
}

// checkBudget checks if a retry is allowed within the budget
func (p *RetryPolicy) checkBudget() bool {
	if p.config.RetryBudget <= 0 {
		return true // No budget limit
	}

	p.budgetMu.Lock()
	defer p.budgetMu.Unlock()

	now := time.Now()

	// Reset window if expired
	if now.Sub(p.windowStart) >= p.config.RetryBudgetWindow {
		p.windowStart = now
		p.retryCount = 0
	}

	// Check if within budget
	if p.retryCount >= p.config.RetryBudget {
		return false
	}

	p.retryCount++
	return true
}

// GetRetryCount returns the current retry count in the budget window
func (p *RetryPolicy) GetRetryCount() int {
	p.budgetMu.Lock()
	defer p.budgetMu.Unlock()
	return p.retryCount
}

// ResetBudget resets the retry budget
func (p *RetryPolicy) ResetBudget() {
	p.budgetMu.Lock()
	defer p.budgetMu.Unlock()
	p.retryCount = 0
	p.windowStart = time.Now()
}

// CalculateBackoff calculates the next backoff delay using exponential backoff
// delay = currentDelay * 2, capped at maxAttempts minutes
func CalculateBackoff(currentDelay time.Duration, maxAttempts int) time.Duration {
	maxDelay := time.Duration(maxAttempts) * time.Minute
	nextDelay := currentDelay * 2
	if nextDelay > maxDelay {
		return maxDelay
	}
	return nextDelay
}

// CalculateBackoffWithBase calculates backoff with a specific base delay and attempt number
// delay = baseDelay * 2^attempt, capped at maxDelay
func CalculateBackoffWithBase(baseDelay time.Duration, attempt int, maxDelay time.Duration) time.Duration {
	delay := baseDelay
	for range attempt {
		delay *= 2
		if delay > maxDelay {
			return maxDelay
		}
	}
	return delay
}

// CalculateDelayWithJitter calculates a delay with jitter for a given attempt
// This is useful for distributed systems to avoid thundering herd
func CalculateDelayWithJitter(baseDelay time.Duration, attempt int, maxDelay time.Duration, jitterFactor float64) time.Duration {
	// Calculate base delay with exponential backoff
	delay := float64(baseDelay)
	for range attempt {
		delay *= 2
	}

	// Cap at max delay
	if delay > float64(maxDelay) {
		delay = float64(maxDelay)
	}

	// Add jitter
	if jitterFactor > 0 {
		jitter := delay * jitterFactor * (2*rand.Float64() - 1)
		delay += jitter
	}

	// Ensure delay is not negative
	if delay < 0 {
		delay = 0
	}

	return time.Duration(delay)
}

// RetryableError wraps an error to indicate it should be retried
type RetryableError struct {
	Err error
}

func (e *RetryableError) Error() string {
	return e.Err.Error()
}

func (e *RetryableError) Unwrap() error {
	return e.Err
}

// IsRetryable checks if an error should be retried
func IsRetryable(err error) bool {
	if err == nil {
		return false
	}
	_, ok := err.(*RetryableError)
	return ok
}

// WrapRetryable wraps an error to indicate it should be retried
func WrapRetryable(err error) error {
	if err == nil {
		return nil
	}
	return &RetryableError{Err: err}
}
