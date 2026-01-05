package logger

import "context"

// Logger defines the interface for structured logging
type Logger interface {
	// Debug logs a debug message with optional fields
	Debug(msg string, fields ...Field)
	// Info logs an info message with optional fields
	Info(msg string, fields ...Field)
	// Warn logs a warning message with optional fields
	Warn(msg string, fields ...Field)
	// Error logs an error message with optional fields
	Error(msg string, fields ...Field)

	// WithContext returns a logger with context fields extracted
	WithContext(ctx context.Context) Logger
	// WithFields returns a logger with additional fields
	WithFields(fields ...Field) Logger
	// WithRequestID returns a logger with request ID field
	WithRequestID(requestID string) Logger
	// WithSessionID returns a logger with session ID field
	WithSessionID(sessionID string) Logger
}

// Field represents a key-value pair for structured logging
type Field struct {
	Key   string
	Value interface{}
}

// String creates a string field
func String(key, value string) Field {
	return Field{Key: key, Value: value}
}

// Int creates an integer field
func Int(key string, value int) Field {
	return Field{Key: key, Value: value}
}

// Int64 creates an int64 field
func Int64(key string, value int64) Field {
	return Field{Key: key, Value: value}
}

// Float64 creates a float64 field
func Float64(key string, value float64) Field {
	return Field{Key: key, Value: value}
}

// Bool creates a boolean field
func Bool(key string, value bool) Field {
	return Field{Key: key, Value: value}
}

// Err creates an error field
func Err(err error) Field {
	if err == nil {
		return Field{Key: "error", Value: nil}
	}
	return Field{Key: "error", Value: err.Error()}
}

// Any creates a field with any value
func Any(key string, value interface{}) Field {
	return Field{Key: key, Value: value}
}

// Duration creates a duration field (in milliseconds)
func Duration(key string, ms float64) Field {
	return Field{Key: key, Value: ms}
}

// Context keys for extracting values
type contextKey string

const (
	RequestIDKey contextKey = "request_id"
	SessionIDKey contextKey = "session_id"
)
