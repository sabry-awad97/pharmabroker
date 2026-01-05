package unit

import (
	"context"
	"errors"
	"testing"
	"time"

	domainerrors "github.com/pharmabroker/whatsapp/internal/domain/errors"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"github.com/sony/gobreaker/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultCircuitBreakerConfig(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()

	assert.Equal(t, "whatsapp", config.Name)
	assert.Equal(t, uint32(3), config.MaxRequests)
	assert.Equal(t, 60*time.Second, config.Interval)
	assert.Equal(t, 30*time.Second, config.Timeout)
	assert.Equal(t, uint32(5), config.FailureThreshold)
	assert.Equal(t, uint32(2), config.SuccessThreshold)
}

func TestNewCircuitBreaker(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)

	require.NotNil(t, cb)
	assert.Equal(t, "whatsapp", cb.Name())
	assert.True(t, cb.IsClosed())
	assert.False(t, cb.IsOpen())
	assert.False(t, cb.IsHalfOpen())
}

func TestCircuitBreaker_ExecuteSuccess(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)
	ctx := context.Background()

	result, err := cb.Execute(ctx, func() (any, error) {
		return "success", nil
	})

	require.NoError(t, err)
	assert.Equal(t, "success", result)
	assert.True(t, cb.IsClosed())
}

func TestCircuitBreaker_ExecuteFailure(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)
	ctx := context.Background()

	expectedErr := errors.New("test error")
	result, err := cb.Execute(ctx, func() (any, error) {
		return nil, expectedErr
	})

	assert.Nil(t, result)
	assert.Equal(t, expectedErr, err)
}

func TestCircuitBreaker_OpensAfterFailureThreshold(t *testing.T) {
	config := whatsapp.CircuitBreakerConfig{
		Name:             "test",
		MaxRequests:      1,
		Interval:         time.Minute,
		Timeout:          time.Second,
		FailureThreshold: 3,
		SuccessThreshold: 1,
	}
	cb := whatsapp.NewCircuitBreaker(config)
	ctx := context.Background()

	// Cause failures to trip the circuit
	for i := 0; i < 3; i++ {
		_, _ = cb.Execute(ctx, func() (any, error) {
			return nil, errors.New("failure")
		})
	}

	// Circuit should be open now
	assert.True(t, cb.IsOpen())

	// Next call should fail with circuit open error
	_, err := cb.Execute(ctx, func() (any, error) {
		return "should not execute", nil
	})

	assert.ErrorIs(t, err, domainerrors.ErrCircuitOpen)
}

func TestCircuitBreaker_ContextCancellation(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := cb.Execute(ctx, func() (any, error) {
		return "should not execute", nil
	})

	assert.ErrorIs(t, err, context.Canceled)
}

func TestCircuitBreaker_State(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)

	// Initially closed
	assert.Equal(t, gobreaker.StateClosed, cb.State())
	assert.True(t, cb.IsClosed())
	assert.False(t, cb.IsOpen())
	assert.False(t, cb.IsHalfOpen())
}

func TestCircuitBreaker_Counts(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)
	ctx := context.Background()

	// Execute some successful requests
	for i := 0; i < 3; i++ {
		_, _ = cb.Execute(ctx, func() (any, error) {
			return "success", nil
		})
	}

	counts := cb.Counts()
	assert.Equal(t, uint32(3), counts.Requests)
	assert.Equal(t, uint32(3), counts.TotalSuccesses)
	assert.Equal(t, uint32(0), counts.TotalFailures)
}

func TestCircuitBreaker_String(t *testing.T) {
	config := whatsapp.DefaultCircuitBreakerConfig()
	cb := whatsapp.NewCircuitBreaker(config)

	str := cb.String()
	assert.Contains(t, str, "CircuitBreaker[whatsapp]")
	assert.Contains(t, str, "state=closed")
}

func TestCircuitBreaker_ContextDeadlineNotCountedAsFailure(t *testing.T) {
	config := whatsapp.CircuitBreakerConfig{
		Name:             "test",
		MaxRequests:      1,
		Interval:         time.Minute,
		Timeout:          time.Second,
		FailureThreshold: 2,
		SuccessThreshold: 1,
	}
	cb := whatsapp.NewCircuitBreaker(config)
	ctx := context.Background()

	// Context deadline errors should not count as failures
	for i := 0; i < 5; i++ {
		_, _ = cb.Execute(ctx, func() (any, error) {
			return nil, context.DeadlineExceeded
		})
	}

	// Circuit should still be closed because deadline errors are not counted
	assert.True(t, cb.IsClosed())
}

func TestCircuitBreaker_CustomConfig(t *testing.T) {
	config := whatsapp.CircuitBreakerConfig{
		Name:             "custom",
		MaxRequests:      5,
		Interval:         30 * time.Second,
		Timeout:          15 * time.Second,
		FailureThreshold: 10,
		SuccessThreshold: 3,
	}
	cb := whatsapp.NewCircuitBreaker(config)

	assert.Equal(t, "custom", cb.Name())
	assert.True(t, cb.IsClosed())
}
