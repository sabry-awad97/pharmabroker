package logger

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"sync"
	"time"
)

// Level represents the log level
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

// String returns the string representation of the log level
func (l Level) String() string {
	switch l {
	case LevelDebug:
		return "debug"
	case LevelInfo:
		return "info"
	case LevelWarn:
		return "warn"
	case LevelError:
		return "error"
	default:
		return "unknown"
	}
}

// ParseLevel parses a string into a Level
func ParseLevel(s string) Level {
	switch s {
	case "debug":
		return LevelDebug
	case "info":
		return LevelInfo
	case "warn":
		return LevelWarn
	case "error":
		return LevelError
	default:
		return LevelInfo
	}
}

// Config holds logger configuration
type Config struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"` // "json" or "text"
}

// DefaultConfig returns the default logger configuration
func DefaultConfig() Config {
	return Config{
		Level:  "info",
		Format: "json",
	}
}

// StructuredLogger implements the Logger interface with structured logging
type StructuredLogger struct {
	mu     sync.Mutex
	output io.Writer
	level  Level
	format string
	fields []Field
	isJSON bool
}

// NewStructuredLogger creates a new structured logger
func NewStructuredLogger(cfg Config) *StructuredLogger {
	return &StructuredLogger{
		output: os.Stdout,
		level:  ParseLevel(cfg.Level),
		format: cfg.Format,
		fields: nil,
		isJSON: cfg.Format == "json",
	}
}

// NewStructuredLoggerWithOutput creates a logger with custom output
func NewStructuredLoggerWithOutput(cfg Config, output io.Writer) *StructuredLogger {
	return &StructuredLogger{
		output: output,
		level:  ParseLevel(cfg.Level),
		format: cfg.Format,
		fields: nil,
		isJSON: cfg.Format == "json",
	}
}

// Debug logs a debug message
func (l *StructuredLogger) Debug(msg string, fields ...Field) {
	l.log(LevelDebug, msg, fields...)
}

// Info logs an info message
func (l *StructuredLogger) Info(msg string, fields ...Field) {
	l.log(LevelInfo, msg, fields...)
}

// Warn logs a warning message
func (l *StructuredLogger) Warn(msg string, fields ...Field) {
	l.log(LevelWarn, msg, fields...)
}

// Error logs an error message
func (l *StructuredLogger) Error(msg string, fields ...Field) {
	l.log(LevelError, msg, fields...)
}

// WithContext returns a logger with context fields extracted
func (l *StructuredLogger) WithContext(ctx context.Context) Logger {
	newFields := make([]Field, len(l.fields))
	copy(newFields, l.fields)

	if requestID, ok := ctx.Value(RequestIDKey).(string); ok && requestID != "" {
		newFields = append(newFields, String("request_id", requestID))
	}
	if sessionID, ok := ctx.Value(SessionIDKey).(string); ok && sessionID != "" {
		newFields = append(newFields, String("session_id", sessionID))
	}

	return &StructuredLogger{
		output: l.output,
		level:  l.level,
		format: l.format,
		fields: newFields,
		isJSON: l.isJSON,
	}
}

// WithFields returns a logger with additional fields
func (l *StructuredLogger) WithFields(fields ...Field) Logger {
	newFields := make([]Field, len(l.fields), len(l.fields)+len(fields))
	copy(newFields, l.fields)
	newFields = append(newFields, fields...)

	return &StructuredLogger{
		output: l.output,
		level:  l.level,
		format: l.format,
		fields: newFields,
		isJSON: l.isJSON,
	}
}

// WithRequestID returns a logger with request ID field
func (l *StructuredLogger) WithRequestID(requestID string) Logger {
	return l.WithFields(String("request_id", requestID))
}

// WithSessionID returns a logger with session ID field
func (l *StructuredLogger) WithSessionID(sessionID string) Logger {
	return l.WithFields(String("session_id", sessionID))
}

// log writes a log entry
func (l *StructuredLogger) log(level Level, msg string, fields ...Field) {
	if level < l.level {
		return
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	// Combine base fields with call-specific fields
	allFields := make([]Field, 0, len(l.fields)+len(fields))
	allFields = append(allFields, l.fields...)
	allFields = append(allFields, fields...)

	if l.isJSON {
		l.writeJSON(level, msg, allFields)
	} else {
		l.writeText(level, msg, allFields)
	}
}

// writeJSON writes a JSON log entry
func (l *StructuredLogger) writeJSON(level Level, msg string, fields []Field) {
	entry := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level.String(),
		"message":   msg,
	}

	for _, f := range fields {
		entry[f.Key] = f.Value
	}

	data, err := json.Marshal(entry)
	if err != nil {
		fmt.Fprintf(l.output, `{"error":"failed to marshal log entry: %s"}`+"\n", err)
		return
	}

	fmt.Fprintln(l.output, string(data))
}

// writeText writes a text log entry
func (l *StructuredLogger) writeText(level Level, msg string, fields []Field) {
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	levelStr := fmt.Sprintf("%-5s", level.String())

	var fieldsStr string
	for _, f := range fields {
		fieldsStr += fmt.Sprintf(" %s=%v", f.Key, f.Value)
	}

	fmt.Fprintf(l.output, "%s [%s] %s%s\n", timestamp, levelStr, msg, fieldsStr)
}

// SetLevel sets the log level
func (l *StructuredLogger) SetLevel(level Level) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.level = level
}

// GetLevel returns the current log level
func (l *StructuredLogger) GetLevel() Level {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.level
}
