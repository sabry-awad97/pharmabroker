package unit

import (
	"testing"

	"github.com/pharmabroker/whatsapp/internal/presentation/ws"
	"github.com/stretchr/testify/assert"
)

func TestIsOriginAllowed_Wildcard(t *testing.T) {
	allowedOrigins := []string{"*"}

	tests := []struct {
		name     string
		origin   string
		expected bool
	}{
		{"Any origin allowed", "https://example.com", true},
		{"Another origin allowed", "https://evil.com", true},
		{"HTTP origin allowed", "http://localhost:3000", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ws.IsOriginAllowed(tt.origin, allowedOrigins)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsOriginAllowed_ExactMatch(t *testing.T) {
	allowedOrigins := []string{"https://app.example.com", "https://admin.example.com"}

	tests := []struct {
		name     string
		origin   string
		expected bool
	}{
		{"Exact match - app", "https://app.example.com", true},
		{"Exact match - admin", "https://admin.example.com", true},
		{"Not in list", "https://evil.com", false},
		{"Similar but not exact", "https://app.example.com.evil.com", false},
		{"Subdomain not allowed", "https://sub.app.example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ws.IsOriginAllowed(tt.origin, allowedOrigins)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsOriginAllowed_WildcardSubdomain(t *testing.T) {
	allowedOrigins := []string{"*.example.com"}

	tests := []struct {
		name     string
		origin   string
		expected bool
	}{
		{"Subdomain match - app", "https://app.example.com", true},
		{"Subdomain match - api", "https://api.example.com", true},
		{"Subdomain match - deep", "https://deep.sub.example.com", true},
		{"Different domain", "https://example.org", false},
		{"Similar domain", "https://notexample.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ws.IsOriginAllowed(tt.origin, allowedOrigins)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestIsOriginAllowed_EmptyList(t *testing.T) {
	allowedOrigins := []string{}

	result := ws.IsOriginAllowed("https://example.com", allowedOrigins)
	assert.False(t, result, "Empty allowed origins should reject all")
}

func TestIsOriginAllowed_MixedPatterns(t *testing.T) {
	allowedOrigins := []string{
		"https://specific.example.com",
		"*.trusted.com",
		"http://localhost:3000",
	}

	tests := []struct {
		name     string
		origin   string
		expected bool
	}{
		{"Exact match", "https://specific.example.com", true},
		{"Wildcard subdomain", "https://app.trusted.com", true},
		{"Localhost", "http://localhost:3000", true},
		{"Not allowed", "https://evil.com", false},
		{"Wrong port", "http://localhost:8080", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ws.IsOriginAllowed(tt.origin, allowedOrigins)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestDefaultQRHandlerConfig(t *testing.T) {
	config := ws.DefaultQRHandlerConfig()

	assert.NotEmpty(t, config.AllowedOrigins)
	assert.Contains(t, config.AllowedOrigins, "*")
	assert.True(t, config.AuthTimeout > 0)
	assert.True(t, config.WriteTimeout > 0)
	assert.True(t, config.PingInterval > 0)
}
