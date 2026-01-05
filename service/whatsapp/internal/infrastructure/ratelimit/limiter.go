// Package ratelimit provides rate limiting functionality using token bucket algorithm.
package ratelimit

import (
	"context"
	"net/http"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// Config holds the configuration for rate limiting.
type Config struct {
	Enabled           bool          `mapstructure:"enabled"`
	RequestsPerSecond float64       `mapstructure:"requests_per_second"`
	BurstSize         int           `mapstructure:"burst_size"`
	ByIP              bool          `mapstructure:"by_ip"`
	ByAPIKey          bool          `mapstructure:"by_api_key"`
	CleanupInterval   time.Duration `mapstructure:"cleanup_interval"`
	MaxAge            time.Duration `mapstructure:"max_age"`
}

// DefaultConfig returns a default rate limit configuration.
func DefaultConfig() Config {
	return Config{
		Enabled:           true,
		RequestsPerSecond: 10,
		BurstSize:         20,
		ByIP:              true,
		ByAPIKey:          false,
		CleanupInterval:   time.Minute * 5,
		MaxAge:            time.Hour,
	}
}

// limiterEntry holds a rate limiter and its last access time.
type limiterEntry struct {
	limiter    *rate.Limiter
	lastAccess time.Time
}

// Limiter manages rate limiters for different clients.
type Limiter struct {
	config   Config
	limiters sync.Map // map[string]*limiterEntry
	stopCh   chan struct{}
}

// NewLimiter creates a new rate limiter with the given configuration.
func NewLimiter(config Config) *Limiter {
	l := &Limiter{
		config: config,
		stopCh: make(chan struct{}),
	}

	if config.CleanupInterval > 0 {
		go l.cleanup()
	}

	return l
}

// Allow checks if a request from the given key is allowed.
func (l *Limiter) Allow(key string) bool {
	if !l.config.Enabled {
		return true
	}

	entry := l.getLimiter(key)
	return entry.limiter.Allow()
}

// Wait blocks until a request from the given key is allowed or context is done.
func (l *Limiter) Wait(key string) error {
	if !l.config.Enabled {
		return nil
	}

	entry := l.getLimiter(key)
	return entry.limiter.Wait(context.TODO())
}

// Reserve returns a Reservation for the given key.
func (l *Limiter) Reserve(key string) *rate.Reservation {
	entry := l.getLimiter(key)
	return entry.limiter.Reserve()
}

// GetLimitInfo returns rate limit information for the given key.
func (l *Limiter) GetLimitInfo(key string) LimitInfo {
	entry := l.getLimiter(key)
	tokens := entry.limiter.Tokens()

	return LimitInfo{
		Limit:     int(l.config.RequestsPerSecond),
		Remaining: int(tokens),
		Reset:     time.Now().Add(time.Second).Unix(),
	}
}

// LimitInfo contains rate limit information for response headers.
type LimitInfo struct {
	Limit     int   // Maximum requests allowed per second
	Remaining int   // Remaining requests in current window
	Reset     int64 // Unix timestamp when limit resets
}

// getLimiter retrieves or creates a rate limiter for the given key.
func (l *Limiter) getLimiter(key string) *limiterEntry {
	if val, ok := l.limiters.Load(key); ok {
		entry := val.(*limiterEntry)
		entry.lastAccess = time.Now()
		return entry
	}

	entry := &limiterEntry{
		limiter:    rate.NewLimiter(rate.Limit(l.config.RequestsPerSecond), l.config.BurstSize),
		lastAccess: time.Now(),
	}

	actual, loaded := l.limiters.LoadOrStore(key, entry)
	if loaded {
		return actual.(*limiterEntry)
	}

	return entry
}

// cleanup periodically removes stale limiters.
func (l *Limiter) cleanup() {
	ticker := time.NewTicker(l.config.CleanupInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			l.removeStale()
		case <-l.stopCh:
			return
		}
	}
}

// removeStale removes limiters that haven't been accessed recently.
func (l *Limiter) removeStale() {
	now := time.Now()
	l.limiters.Range(func(key, value interface{}) bool {
		entry := value.(*limiterEntry)
		if now.Sub(entry.lastAccess) > l.config.MaxAge {
			l.limiters.Delete(key)
		}
		return true
	})
}

// Stop stops the cleanup goroutine.
func (l *Limiter) Stop() {
	close(l.stopCh)
}

// KeyExtractor is a function that extracts a rate limit key from an HTTP request.
type KeyExtractor func(r *http.Request) string

// IPKeyExtractor extracts the client IP address from the request.
func IPKeyExtractor(r *http.Request) string {
	// Check X-Forwarded-For header first (for proxied requests)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return xff
	}
	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	// Fall back to RemoteAddr
	return r.RemoteAddr
}

// APIKeyExtractor extracts the API key from the request header.
func APIKeyExtractor(header string) KeyExtractor {
	return func(r *http.Request) string {
		return r.Header.Get(header)
	}
}

// Config returns the current configuration.
func (l *Limiter) Config() Config {
	return l.config
}
