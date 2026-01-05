package property

import (
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
)

// Feature: whatsapp-service, Property 13: Configuration Validation
// *For any* configuration with missing required fields, the service should fail fast
// with a descriptive error message.
// **Validates: Requirements 7.2, 7.3**

func TestConfigurationValidation_Property13(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property 13.1: Valid configuration should pass validation
	properties.Property("valid configuration passes validation", prop.ForAll(
		func(port int, sqlitePath, wsURL, logLevel, logFormat string) bool {
			// Ensure we have valid values
			if port < 1 || port > 65535 {
				return true // skip invalid test cases
			}
			if sqlitePath == "" || wsURL == "" {
				return true // skip empty required fields
			}

			cfg := &config.Config{
				Server: config.ServerConfig{
					Host: "localhost",
					Port: port,
				},
				SQLite: config.SQLiteConfig{
					Path:        sqlitePath,
					BusyTimeout: 5000,
				},
				WhatsApp: config.WhatsAppConfig{
					QRTimeout:        2 * time.Minute,
					ReconnectDelay:   5 * time.Second,
					MaxReconnects:    10,
					MessageRateLimit: 30,
				},
				WebSocket: config.WebSocketConfig{
					URL:            wsURL,
					PingInterval:   30 * time.Second,
					PongTimeout:    10 * time.Second,
					ReconnectDelay: 5 * time.Second,
					MaxReconnects:  0,
					QueueSize:      1000,
				},
				Log: config.LogConfig{
					Level:  logLevel,
					Format: logFormat,
				},
			}

			err := cfg.Validate()
			return err == nil
		},
		gen.IntRange(1, 65535),
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		gen.OneConstOf("debug", "info", "warn", "error"),
		gen.OneConstOf("json", "text"),
	))

	// Property 13.2: Missing SQLite path should fail validation with descriptive error
	properties.Property("missing SQLite path fails validation", prop.ForAll(
		func(port int) bool {
			cfg := createValidConfig()
			cfg.SQLite.Path = ""

			err := cfg.Validate()
			if err == nil {
				return false
			}

			// Error should mention the field
			errStr := err.Error()
			return containsStr(errStr, "sqlite.path") && containsStr(errStr, "required")
		},
		gen.IntRange(1, 65535),
	))

	// Property 13.3: Missing WebSocket URL should fail validation with descriptive error
	properties.Property("missing WebSocket URL fails validation", prop.ForAll(
		func(port int) bool {
			cfg := createValidConfig()
			cfg.WebSocket.URL = ""

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "websocket.url") && containsStr(errStr, "required")
		},
		gen.IntRange(1, 65535),
	))

	// Property 13.4: Invalid port should fail validation
	properties.Property("invalid port fails validation", prop.ForAll(
		func(port int) bool {
			if port >= 1 && port <= 65535 {
				return true // skip valid ports
			}

			cfg := createValidConfig()
			cfg.Server.Port = port

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "server.port")
		},
		gen.OneConstOf(0, -1, -100, 65536, 70000, 100000),
	))

	// Property 13.5: Invalid log level should fail validation
	properties.Property("invalid log level fails validation", prop.ForAll(
		func(level string) bool {
			validLevels := map[string]bool{
				"debug": true, "info": true, "warn": true, "error": true,
				"DEBUG": true, "INFO": true, "WARN": true, "ERROR": true,
			}
			if validLevels[level] {
				return true // skip valid levels
			}

			cfg := createValidConfig()
			cfg.Log.Level = level

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "log.level")
		},
		gen.OneConstOf("invalid", "trace", "fatal", "warning", ""),
	))

	// Property 13.6: Invalid log format should fail validation
	properties.Property("invalid log format fails validation", prop.ForAll(
		func(format string) bool {
			validFormats := map[string]bool{
				"json": true, "text": true,
				"JSON": true, "TEXT": true,
			}
			if validFormats[format] {
				return true // skip valid formats
			}

			cfg := createValidConfig()
			cfg.Log.Format = format

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "log.format")
		},
		gen.OneConstOf("xml", "yaml", "csv", ""),
	))

	// Property 13.7: Non-positive QR timeout should fail validation
	properties.Property("non-positive QR timeout fails validation", prop.ForAll(
		func(timeout time.Duration) bool {
			if timeout > 0 {
				return true // skip valid timeouts
			}

			cfg := createValidConfig()
			cfg.WhatsApp.QRTimeout = timeout

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "whatsapp.qr_timeout")
		},
		gen.OneConstOf(time.Duration(0), -time.Second, -time.Minute),
	))

	// Property 13.8: Non-positive ping interval should fail validation
	properties.Property("non-positive ping interval fails validation", prop.ForAll(
		func(interval time.Duration) bool {
			if interval > 0 {
				return true // skip valid intervals
			}

			cfg := createValidConfig()
			cfg.WebSocket.PingInterval = interval

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "websocket.ping_interval")
		},
		gen.OneConstOf(time.Duration(0), -time.Second, -time.Minute),
	))

	// Property 13.9: Negative values for non-negative fields should fail validation
	properties.Property("negative busy timeout fails validation", prop.ForAll(
		func(timeout int) bool {
			if timeout >= 0 {
				return true // skip valid values
			}

			cfg := createValidConfig()
			cfg.SQLite.BusyTimeout = timeout

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			return containsStr(errStr, "sqlite.busy_timeout")
		},
		gen.IntRange(-1000, -1),
	))

	// Property 13.10: Multiple validation errors should all be reported
	properties.Property("multiple validation errors are all reported", prop.ForAll(
		func(_ int) bool {
			cfg := &config.Config{
				Server: config.ServerConfig{
					Host: "localhost",
					Port: 0, // invalid
				},
				SQLite: config.SQLiteConfig{
					Path:        "", // invalid
					BusyTimeout: -1, // invalid
				},
				WhatsApp: config.WhatsAppConfig{
					QRTimeout:        0, // invalid
					ReconnectDelay:   5 * time.Second,
					MaxReconnects:    -1, // invalid
					MessageRateLimit: -1, // invalid
				},
				WebSocket: config.WebSocketConfig{
					URL:            "", // invalid
					PingInterval:   0,  // invalid
					PongTimeout:    0,  // invalid
					ReconnectDelay: 5 * time.Second,
					MaxReconnects:  0,
					QueueSize:      -1, // invalid
				},
				Log: config.LogConfig{
					Level:  "invalid", // invalid
					Format: "invalid", // invalid
				},
			}

			err := cfg.Validate()
			if err == nil {
				return false
			}

			errStr := err.Error()
			// Should contain multiple error fields
			hasServerPort := containsStr(errStr, "server.port")
			hasSqlitePath := containsStr(errStr, "sqlite.path")
			hasWebsocketURL := containsStr(errStr, "websocket.url")
			hasLogLevel := containsStr(errStr, "log.level")

			return hasServerPort && hasSqlitePath && hasWebsocketURL && hasLogLevel
		},
		gen.Const(0),
	))

	properties.TestingRun(t)
}

// createValidConfig creates a valid configuration for testing
func createValidConfig() *config.Config {
	return &config.Config{
		Server: config.ServerConfig{
			Host: "localhost",
			Port: 8080,
		},
		SQLite: config.SQLiteConfig{
			Path:        "/data/whatsapp.db",
			BusyTimeout: 5000,
		},
		WhatsApp: config.WhatsAppConfig{
			QRTimeout:        2 * time.Minute,
			ReconnectDelay:   5 * time.Second,
			MaxReconnects:    10,
			MessageRateLimit: 30,
		},
		WebSocket: config.WebSocketConfig{
			URL:            "ws://localhost:3000/ws/whatsapp",
			PingInterval:   30 * time.Second,
			PongTimeout:    10 * time.Second,
			ReconnectDelay: 5 * time.Second,
			MaxReconnects:  0,
			QueueSize:      1000,
		},
		Log: config.LogConfig{
			Level:  "info",
			Format: "json",
		},
	}
}

// containsStr checks if s contains substr
func containsStr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
