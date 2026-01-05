package unit

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/pharmabroker/whatsapp/internal/infrastructure/whatsapp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultRetryConfig(t *testing.T) {
	config := whatsapp.DefaultRetryConfig()

	assert.Equal(t, 3, config.MaxAttempts)
	assert.Equal(t, 100*time.Millisecond, config.InitialDelay)
	assert.Equal(t, 30*time.Second, config.MaxDelay)
	assert.Equal(t, 2.0, config.Multiplier)
	assert.Equal(t, 0.1, config.JitterFactor)
	assert.Equal(t, 100, config.RetryBudget)
	assert.Equal(t, time.Minute, config.RetryBudgetWindow)
}

func TestNewRetryPolicy(t *testing.T) {
	config := whatsapp.DefaultRetryConfig()
	policy := whatsapp.NewRetryPolicy(config)

	require.NotNil(t, policy)
	assert.Equal(t, 0, policy.GetRetryCount())
}

func TestRetryPolicy_ExecuteSuccess(t *testing.T) {
	config := whatsapp.DefaultRetryConfig()
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	callCount := 0
	err := policy.Execute(ctx, func() error {
		callCount++
		return nil
	})

	require.NoError(t, err)
	assert.Equal(t, 1, callCount)
}

func TestRetryPolicy_ExecuteRetryOnFailure(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:  3,
		InitialDelay: time.Millisecond,
		MaxDelay:     10 * time.Millisecond,
		Multiplier:   2.0,
		JitterFactor: 0,
	}
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	callCount := 0
	err := policy.Execute(ctx, func() error {
		callCount++
		if callCount < 3 {
			return errors.New("temporary error")
		}
		return nil
	})

	require.NoError(t, err)
	assert.Equal(t, 3, callCount)
}

func TestRetryPolicy_ExecuteMaxAttemptsExceeded(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:  2,
		InitialDelay: time.Millisecond,
		MaxDelay:     10 * time.Millisecond,
		Multiplier:   2.0,
		JitterFactor: 0,
	}
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	expectedErr := errors.New("persistent error")
	callCount := 0
	err := policy.Execute(ctx, func() error {
		callCount++
		return expectedErr
	})

	assert.Equal(t, expectedErr, err)
	assert.Equal(t, 3, callCount) // Initial + 2 retries
}

func TestRetryPolicy_ExecuteContextCancellation(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:  5,
		InitialDelay: 100 * time.Millisecond,
		MaxDelay:     time.Second,
		Multiplier:   2.0,
		JitterFactor: 0,
	}
	policy := whatsapp.NewRetryPolicy(config)

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	err := policy.Execute(ctx, func() error {
		return errors.New("should not reach here")
	})

	assert.ErrorIs(t, err, context.Canceled)
}

func TestRetryPolicy_ExecuteWithResult(t *testing.T) {
	config := whatsapp.DefaultRetryConfig()
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	result, err := policy.ExecuteWithResult(ctx, func() (any, error) {
		return "success", nil
	})

	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestRetryPolicy_ExecuteWithResultRetry(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:  3,
		InitialDelay: time.Millisecond,
		MaxDelay:     10 * time.Millisecond,
		Multiplier:   2.0,
		JitterFactor: 0,
	}
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	callCount := 0
	result, err := policy.ExecuteWithResult(ctx, func() (any, error) {
		callCount++
		if callCount < 2 {
			return nil, errors.New("temporary error")
		}
		return "success", nil
	})

	require.NoError(t, err)
	assert.Equal(t, "success", result)
	assert.Equal(t, 2, callCount)
}

func TestRetryPolicy_RetryBudget(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:       10,
		InitialDelay:      time.Millisecond,
		MaxDelay:          10 * time.Millisecond,
		Multiplier:        2.0,
		JitterFactor:      0,
		RetryBudget:       3,
		RetryBudgetWindow: time.Minute,
	}
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	// First execution - uses 2 retries from budget
	callCount1 := 0
	_ = policy.Execute(ctx, func() error {
		callCount1++
		if callCount1 < 3 {
			return errors.New("error")
		}
		return nil
	})

	// Second execution - should be limited by budget
	callCount2 := 0
	_ = policy.Execute(ctx, func() error {
		callCount2++
		return errors.New("error")
	})

	// Budget should be exhausted after 3 retries total
	assert.LessOrEqual(t, policy.GetRetryCount(), 3)
}

func TestRetryPolicy_ResetBudget(t *testing.T) {
	config := whatsapp.RetryConfig{
		MaxAttempts:       5,
		InitialDelay:      time.Millisecond,
		MaxDelay:          10 * time.Millisecond,
		Multiplier:        2.0,
		JitterFactor:      0,
		RetryBudget:       2,
		RetryBudgetWindow: time.Minute,
	}
	policy := whatsapp.NewRetryPolicy(config)
	ctx := context.Background()

	// Use up some budget
	_ = policy.Execute(ctx, func() error {
		return errors.New("error")
	})

	assert.Greater(t, policy.GetRetryCount(), 0)

	// Reset budget
	policy.ResetBudget()
	assert.Equal(t, 0, policy.GetRetryCount())
}

func TestCalculateDelayWithJitter(t *testing.T) {
	baseDelay := 100 * time.Millisecond
	maxDelay := time.Second

	// Test without jitter
	delay := whatsapp.CalculateDelayWithJitter(baseDelay, 0, maxDelay, 0)
	assert.Equal(t, baseDelay, delay)

	// Test exponential backoff
	delay1 := whatsapp.CalculateDelayWithJitter(baseDelay, 1, maxDelay, 0)
	assert.Equal(t, 200*time.Millisecond, delay1)

	delay2 := whatsapp.CalculateDelayWithJitter(baseDelay, 2, maxDelay, 0)
	assert.Equal(t, 400*time.Millisecond, delay2)

	// Test max delay cap
	delay10 := whatsapp.CalculateDelayWithJitter(baseDelay, 10, maxDelay, 0)
	assert.Equal(t, maxDelay, delay10)
}

func TestCalculateDelayWithJitter_JitterRange(t *testing.T) {
	baseDelay := 100 * time.Millisecond
	maxDelay := time.Second
	jitterFactor := 0.1

	// Run multiple times to test jitter variation
	delays := make([]time.Duration, 100)
	for i := 0; i < 100; i++ {
		delays[i] = whatsapp.CalculateDelayWithJitter(baseDelay, 0, maxDelay, jitterFactor)
	}

	// Check that delays are within expected range (90ms to 110ms for 10% jitter)
	minExpected := time.Duration(float64(baseDelay) * (1 - jitterFactor))
	maxExpected := time.Duration(float64(baseDelay) * (1 + jitterFactor))

	for _, d := range delays {
		assert.GreaterOrEqual(t, d, minExpected-time.Millisecond) // Small tolerance
		assert.LessOrEqual(t, d, maxExpected+time.Millisecond)
	}
}

func TestRetryableError(t *testing.T) {
	originalErr := errors.New("original error")
	retryableErr := whatsapp.WrapRetryable(originalErr)

	assert.True(t, whatsapp.IsRetryable(retryableErr))
	assert.False(t, whatsapp.IsRetryable(originalErr))
	assert.Equal(t, "original error", retryableErr.Error())
	assert.ErrorIs(t, retryableErr, originalErr)
}

func TestWrapRetryable_Nil(t *testing.T) {
	result := whatsapp.WrapRetryable(nil)
	assert.Nil(t, result)
}

func TestIsRetryable_Nil(t *testing.T) {
	assert.False(t, whatsapp.IsRetryable(nil))
}
