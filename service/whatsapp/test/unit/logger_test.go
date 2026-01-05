package unit

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/pharmabroker/whatsapp/internal/infrastructure/logger"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewStructuredLogger(t *testing.T) {
	cfg := logger.Config{
		Level:  "info",
		Format: "json",
	}

	l := logger.NewStructuredLogger(cfg)
	assert.NotNil(t, l)
}

func TestStructuredLogger_JSONFormat(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	l.Info("test message", logger.String("key", "value"))

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "info", entry["level"])
	assert.Equal(t, "test message", entry["message"])
	assert.Equal(t, "value", entry["key"])
	assert.Contains(t, entry, "timestamp")
}

func TestStructuredLogger_TextFormat(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "text"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	l.Info("test message", logger.String("key", "value"))

	output := buf.String()
	assert.Contains(t, output, "[info ]")
	assert.Contains(t, output, "test message")
	assert.Contains(t, output, "key=value")
}

func TestStructuredLogger_LogLevels(t *testing.T) {
	tests := []struct {
		name      string
		logLevel  string
		logMethod string
		shouldLog bool
	}{
		{"debug at debug level", "debug", "debug", true},
		{"info at debug level", "debug", "info", true},
		{"warn at debug level", "debug", "warn", true},
		{"error at debug level", "debug", "error", true},
		{"debug at info level", "info", "debug", false},
		{"info at info level", "info", "info", true},
		{"warn at info level", "info", "warn", true},
		{"error at info level", "info", "error", true},
		{"debug at warn level", "warn", "debug", false},
		{"info at warn level", "warn", "info", false},
		{"warn at warn level", "warn", "warn", true},
		{"error at warn level", "warn", "error", true},
		{"debug at error level", "error", "debug", false},
		{"info at error level", "error", "info", false},
		{"warn at error level", "error", "warn", false},
		{"error at error level", "error", "error", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			cfg := logger.Config{Level: tt.logLevel, Format: "json"}
			l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

			switch tt.logMethod {
			case "debug":
				l.Debug("test")
			case "info":
				l.Info("test")
			case "warn":
				l.Warn("test")
			case "error":
				l.Error("test")
			}

			if tt.shouldLog {
				assert.NotEmpty(t, buf.String())
			} else {
				assert.Empty(t, buf.String())
			}
		})
	}
}

func TestStructuredLogger_WithFields(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	childLogger := l.WithFields(logger.String("service", "whatsapp"))
	childLogger.Info("test message")

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "whatsapp", entry["service"])
}

func TestStructuredLogger_WithRequestID(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	childLogger := l.WithRequestID("req-123")
	childLogger.Info("test message")

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "req-123", entry["request_id"])
}

func TestStructuredLogger_WithSessionID(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	childLogger := l.WithSessionID("sess-456")
	childLogger.Info("test message")

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "sess-456", entry["session_id"])
}

func TestStructuredLogger_WithContext(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	ctx := context.WithValue(context.Background(), logger.RequestIDKey, "ctx-req-123")
	ctx = context.WithValue(ctx, logger.SessionIDKey, "ctx-sess-456")

	childLogger := l.WithContext(ctx)
	childLogger.Info("test message")

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "ctx-req-123", entry["request_id"])
	assert.Equal(t, "ctx-sess-456", entry["session_id"])
}

func TestStructuredLogger_FieldTypes(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	l.Info("test",
		logger.String("str", "value"),
		logger.Int("int", 42),
		logger.Int64("int64", 9223372036854775807),
		logger.Float64("float", 3.14),
		logger.Bool("bool", true),
		logger.Any("any", map[string]int{"a": 1}),
		logger.Duration("duration", 150.5),
	)

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "value", entry["str"])
	assert.Equal(t, float64(42), entry["int"])
	assert.Equal(t, float64(9223372036854775807), entry["int64"])
	assert.Equal(t, 3.14, entry["float"])
	assert.Equal(t, true, entry["bool"])
	assert.Equal(t, 150.5, entry["duration"])
}

func TestStructuredLogger_ErrField(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	l.Error("operation failed", logger.Err(assert.AnError))

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, assert.AnError.Error(), entry["error"])
}

func TestStructuredLogger_ErrFieldNil(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	l.Info("no error", logger.Err(nil))

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Nil(t, entry["error"])
}

func TestParseLevel(t *testing.T) {
	tests := []struct {
		input    string
		expected logger.Level
	}{
		{"debug", logger.LevelDebug},
		{"info", logger.LevelInfo},
		{"warn", logger.LevelWarn},
		{"error", logger.LevelError},
		{"unknown", logger.LevelInfo}, // default
		{"", logger.LevelInfo},        // default
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, logger.ParseLevel(tt.input))
		})
	}
}

func TestLevel_String(t *testing.T) {
	tests := []struct {
		level    logger.Level
		expected string
	}{
		{logger.LevelDebug, "debug"},
		{logger.LevelInfo, "info"},
		{logger.LevelWarn, "warn"},
		{logger.LevelError, "error"},
		{logger.Level(99), "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			assert.Equal(t, tt.expected, tt.level.String())
		})
	}
}

func TestLoggerDefaultConfig(t *testing.T) {
	cfg := logger.DefaultConfig()

	assert.Equal(t, "info", cfg.Level)
	assert.Equal(t, "json", cfg.Format)
}

func TestStructuredLogger_SetLevel(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "info", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	// Debug should not log at info level
	l.Debug("should not appear")
	assert.Empty(t, buf.String())

	// Change to debug level
	l.SetLevel(logger.LevelDebug)

	// Now debug should log
	l.Debug("should appear")
	assert.NotEmpty(t, buf.String())
}

func TestStructuredLogger_GetLevel(t *testing.T) {
	cfg := logger.Config{Level: "warn", Format: "json"}
	l := logger.NewStructuredLogger(cfg)

	assert.Equal(t, logger.LevelWarn, l.GetLevel())
}

func TestStructuredLogger_ChainedFields(t *testing.T) {
	var buf bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf)

	childLogger := l.WithRequestID("req-1").WithSessionID("sess-1").WithFields(logger.String("extra", "value"))
	childLogger.Info("test")

	var entry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &entry)
	require.NoError(t, err)

	assert.Equal(t, "req-1", entry["request_id"])
	assert.Equal(t, "sess-1", entry["session_id"])
	assert.Equal(t, "value", entry["extra"])
}

func TestStructuredLogger_DoesNotMutateParent(t *testing.T) {
	var buf1, buf2 bytes.Buffer
	cfg := logger.Config{Level: "debug", Format: "json"}
	l := logger.NewStructuredLoggerWithOutput(cfg, &buf1)

	// Create child with field
	child := l.WithFields(logger.String("child", "true"))

	// Log from parent
	l.Info("parent log")

	// Log from child
	child.(*logger.StructuredLogger).SetLevel(logger.LevelDebug)
	// Need to create new child with buf2
	cfg2 := logger.Config{Level: "debug", Format: "json"}
	l2 := logger.NewStructuredLoggerWithOutput(cfg2, &buf2)
	child2 := l2.WithFields(logger.String("child", "true"))
	child2.Info("child log")

	// Parent should not have child field
	parentOutput := buf1.String()
	assert.False(t, strings.Contains(parentOutput, `"child"`))

	// Child should have child field
	childOutput := buf2.String()
	assert.True(t, strings.Contains(childOutput, `"child":"true"`))
}
