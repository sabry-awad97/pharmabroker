package whatsapp

import (
	"context"
	stderrors "errors"
	"fmt"
	"sync"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/sony/gobreaker/v2"
)

// CircuitBreakerConfig holds configuration for the circuit breaker
type CircuitBreakerConfig struct {
	// Name is the circuit breaker name (used for metrics/logging)
	Name string

	// MaxRequests is the maximum number of requests allowed to pass through
	// when the circuit breaker is half-open
	MaxRequests uint32

	// Interval is the cyclic period of the closed state for clearing the internal counts
	// If 0, the circuit breaker doesn't clear internal counts during the closed state
	Interval time.Duration

	// Timeout is the period of the open state, after which the state becomes half-open
	Timeout time.Duration

	// FailureThreshold is the number of consecutive failures before opening the circuit
	FailureThreshold uint32

	// SuccessThreshold is the number of consecutive successes in half-open state
	// before closing the circuit
	SuccessThreshold uint32
}

// DefaultCircuitBreakerConfig returns default circuit breaker configuration
func DefaultCircuitBreakerConfig() CircuitBreakerConfig {
	return CircuitBreakerConfig{
		Name:             "whatsapp",
		MaxRequests:      3,
		Interval:         60 * time.Second,
		Timeout:          30 * time.Second,
		FailureThreshold: 5,
		SuccessThreshold: 2,
	}
}

// CircuitBreaker wraps operations with circuit breaker pattern
type CircuitBreaker struct {
	cb     *gobreaker.CircuitBreaker[any]
	config CircuitBreakerConfig
	mu     sync.RWMutex
}

// NewCircuitBreaker creates a new circuit breaker with the given configuration
func NewCircuitBreaker(config CircuitBreakerConfig) *CircuitBreaker {
	var consecutiveFailures uint32
	var consecutiveSuccesses uint32

	settings := gobreaker.Settings{
		Name:        config.Name,
		MaxRequests: config.MaxRequests,
		Interval:    config.Interval,
		Timeout:     config.Timeout,
		ReadyToTrip: func(counts gobreaker.Counts) bool {
			consecutiveFailures++
			consecutiveSuccesses = 0
			return consecutiveFailures >= config.FailureThreshold
		},
		OnStateChange: func(name string, from gobreaker.State, to gobreaker.State) {
			if to == gobreaker.StateClosed {
				consecutiveFailures = 0
				consecutiveSuccesses = 0
			}
		},
		IsSuccessful: func(err error) bool {
			if err == nil {
				consecutiveSuccesses++
				consecutiveFailures = 0
				return true
			}
			// Don't count certain errors as failures
			if stderrors.Is(err, context.Canceled) || stderrors.Is(err, context.DeadlineExceeded) {
				return true
			}
			return false
		},
	}

	return &CircuitBreaker{
		cb:     gobreaker.NewCircuitBreaker[any](settings),
		config: config,
	}
}

// Execute runs the given function with circuit breaker protection
func (c *CircuitBreaker) Execute(ctx context.Context, fn func() (any, error)) (any, error) {
	result, err := c.cb.Execute(func() (any, error) {
		// Check context before executing
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		return fn()
	})

	if err != nil {
		// Wrap circuit breaker specific errors
		if err == gobreaker.ErrOpenState {
			return nil, errors.ErrCircuitOpen
		}
		if err == gobreaker.ErrTooManyRequests {
			return nil, errors.ErrCircuitOpen.WithMessage("too many requests in half-open state")
		}
		return nil, err
	}

	return result, nil
}

// State returns the current state of the circuit breaker
func (c *CircuitBreaker) State() gobreaker.State {
	return c.cb.State()
}

// IsOpen returns true if the circuit breaker is in open state
func (c *CircuitBreaker) IsOpen() bool {
	return c.cb.State() == gobreaker.StateOpen
}

// IsClosed returns true if the circuit breaker is in closed state
func (c *CircuitBreaker) IsClosed() bool {
	return c.cb.State() == gobreaker.StateClosed
}

// IsHalfOpen returns true if the circuit breaker is in half-open state
func (c *CircuitBreaker) IsHalfOpen() bool {
	return c.cb.State() == gobreaker.StateHalfOpen
}

// Counts returns the current counts of the circuit breaker
func (c *CircuitBreaker) Counts() gobreaker.Counts {
	return c.cb.Counts()
}

// Name returns the name of the circuit breaker
func (c *CircuitBreaker) Name() string {
	return c.config.Name
}

// String returns a string representation of the circuit breaker state
func (c *CircuitBreaker) String() string {
	counts := c.cb.Counts()
	return fmt.Sprintf("CircuitBreaker[%s]: state=%s, requests=%d, successes=%d, failures=%d",
		c.config.Name, c.cb.State(), counts.Requests, counts.TotalSuccesses, counts.TotalFailures)
}
