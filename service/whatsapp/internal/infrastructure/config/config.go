package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all configuration for the WhatsApp service
type Config struct {
	// Server configuration
	Server ServerConfig `mapstructure:"server"`

	// SQLite database configuration
	SQLite SQLiteConfig `mapstructure:"sqlite"`

	// WhatsApp client configuration
	WhatsApp WhatsAppConfig `mapstructure:"whatsapp"`

	// WebSocket configuration for API server connection
	WebSocket WebSocketConfig `mapstructure:"websocket"`

	// Logging configuration
	Log LogConfig `mapstructure:"log"`
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

// SQLiteConfig holds SQLite database configuration
type SQLiteConfig struct {
	Path        string `mapstructure:"path"`
	BusyTimeout int    `mapstructure:"busy_timeout"` // milliseconds
}

// WhatsAppConfig holds WhatsApp client configuration
type WhatsAppConfig struct {
	QRTimeout        time.Duration `mapstructure:"qr_timeout"`
	ReconnectDelay   time.Duration `mapstructure:"reconnect_delay"`
	MaxReconnects    int           `mapstructure:"max_reconnects"`
	MessageRateLimit int           `mapstructure:"message_rate_limit"` // messages per minute
}

// WebSocketConfig holds WebSocket configuration for API server connection
type WebSocketConfig struct {
	URL            string        `mapstructure:"url"`
	PingInterval   time.Duration `mapstructure:"ping_interval"`
	PongTimeout    time.Duration `mapstructure:"pong_timeout"`
	ReconnectDelay time.Duration `mapstructure:"reconnect_delay"`
	MaxReconnects  int           `mapstructure:"max_reconnects"`
	QueueSize      int           `mapstructure:"queue_size"`
}

// LogConfig holds logging configuration
type LogConfig struct {
	Level  string `mapstructure:"level"`
	Format string `mapstructure:"format"` // json or text
}

// Address returns the server address in host:port format
func (c *ServerConfig) Address() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// DSN returns the SQLite connection string with WAL mode enabled
func (c *SQLiteConfig) DSN() string {
	return fmt.Sprintf("%s?_journal_mode=WAL&_busy_timeout=%d", c.Path, c.BusyTimeout)
}

// ValidationError represents a configuration validation error
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("config validation error: %s - %s", e.Field, e.Message)
}

// ValidationErrors is a collection of validation errors
type ValidationErrors []ValidationError

func (e ValidationErrors) Error() string {
	if len(e) == 0 {
		return ""
	}
	var msgs []string
	for _, err := range e {
		msgs = append(msgs, err.Error())
	}
	return strings.Join(msgs, "; ")
}

// Validate validates the configuration and returns any errors
func (c *Config) Validate() error {
	var errs ValidationErrors

	// Validate Server config
	if c.Server.Port < 1 || c.Server.Port > 65535 {
		errs = append(errs, ValidationError{
			Field:   "server.port",
			Message: "must be between 1 and 65535",
		})
	}

	// Validate SQLite config
	if c.SQLite.Path == "" {
		errs = append(errs, ValidationError{
			Field:   "sqlite.path",
			Message: "is required",
		})
	}
	if c.SQLite.BusyTimeout < 0 {
		errs = append(errs, ValidationError{
			Field:   "sqlite.busy_timeout",
			Message: "must be non-negative",
		})
	}

	// Validate WhatsApp config
	if c.WhatsApp.QRTimeout <= 0 {
		errs = append(errs, ValidationError{
			Field:   "whatsapp.qr_timeout",
			Message: "must be positive",
		})
	}
	if c.WhatsApp.MaxReconnects < 0 {
		errs = append(errs, ValidationError{
			Field:   "whatsapp.max_reconnects",
			Message: "must be non-negative",
		})
	}
	if c.WhatsApp.MessageRateLimit < 0 {
		errs = append(errs, ValidationError{
			Field:   "whatsapp.message_rate_limit",
			Message: "must be non-negative",
		})
	}

	// Validate WebSocket config
	if c.WebSocket.URL == "" {
		errs = append(errs, ValidationError{
			Field:   "websocket.url",
			Message: "is required",
		})
	}
	if c.WebSocket.PingInterval <= 0 {
		errs = append(errs, ValidationError{
			Field:   "websocket.ping_interval",
			Message: "must be positive",
		})
	}
	if c.WebSocket.PongTimeout <= 0 {
		errs = append(errs, ValidationError{
			Field:   "websocket.pong_timeout",
			Message: "must be positive",
		})
	}
	if c.WebSocket.QueueSize < 0 {
		errs = append(errs, ValidationError{
			Field:   "websocket.queue_size",
			Message: "must be non-negative",
		})
	}

	// Validate Log config
	validLogLevels := map[string]bool{
		"debug": true, "info": true, "warn": true, "error": true,
	}
	if !validLogLevels[strings.ToLower(c.Log.Level)] {
		errs = append(errs, ValidationError{
			Field:   "log.level",
			Message: "must be one of: debug, info, warn, error",
		})
	}
	validLogFormats := map[string]bool{
		"json": true, "text": true,
	}
	if !validLogFormats[strings.ToLower(c.Log.Format)] {
		errs = append(errs, ValidationError{
			Field:   "log.format",
			Message: "must be one of: json, text",
		})
	}

	if len(errs) > 0 {
		return errs
	}
	return nil
}

// Load loads configuration from environment variables with defaults
func Load() (*Config, error) {
	v := viper.New()

	// Set default values
	setDefaults(v)

	// Enable reading from environment variables
	v.SetEnvPrefix("WHATSAPP")
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	v.AutomaticEnv()

	// Bind environment variables explicitly
	bindEnvVars(v)

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

// LoadWithViper loads configuration using a provided viper instance (for testing)
func LoadWithViper(v *viper.Viper) (*Config, error) {
	setDefaults(v)

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 8080)

	// SQLite defaults
	v.SetDefault("sqlite.path", "/data/whatsapp.db")
	v.SetDefault("sqlite.busy_timeout", 5000)

	// WhatsApp defaults
	v.SetDefault("whatsapp.qr_timeout", 2*time.Minute)
	v.SetDefault("whatsapp.reconnect_delay", 5*time.Second)
	v.SetDefault("whatsapp.max_reconnects", 10)
	v.SetDefault("whatsapp.message_rate_limit", 30)

	// WebSocket defaults
	v.SetDefault("websocket.url", "ws://localhost:3000/ws/whatsapp")
	v.SetDefault("websocket.ping_interval", 30*time.Second)
	v.SetDefault("websocket.pong_timeout", 10*time.Second)
	v.SetDefault("websocket.reconnect_delay", 5*time.Second)
	v.SetDefault("websocket.max_reconnects", 0) // 0 = unlimited
	v.SetDefault("websocket.queue_size", 1000)

	// Log defaults
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")
}

func bindEnvVars(v *viper.Viper) {
	// Server
	_ = v.BindEnv("server.host", "WHATSAPP_SERVER_HOST")
	_ = v.BindEnv("server.port", "WHATSAPP_SERVER_PORT")

	// SQLite - also support SQLITE_PATH for backward compatibility
	_ = v.BindEnv("sqlite.path", "WHATSAPP_SQLITE_PATH", "SQLITE_PATH")
	_ = v.BindEnv("sqlite.busy_timeout", "WHATSAPP_SQLITE_BUSY_TIMEOUT")

	// WhatsApp
	_ = v.BindEnv("whatsapp.qr_timeout", "WHATSAPP_QR_TIMEOUT")
	_ = v.BindEnv("whatsapp.reconnect_delay", "WHATSAPP_RECONNECT_DELAY")
	_ = v.BindEnv("whatsapp.max_reconnects", "WHATSAPP_MAX_RECONNECTS")
	_ = v.BindEnv("whatsapp.message_rate_limit", "WHATSAPP_MESSAGE_RATE_LIMIT")

	// WebSocket
	_ = v.BindEnv("websocket.url", "WHATSAPP_WEBSOCKET_URL", "API_WEBHOOK_URL")
	_ = v.BindEnv("websocket.ping_interval", "WHATSAPP_WEBSOCKET_PING_INTERVAL")
	_ = v.BindEnv("websocket.pong_timeout", "WHATSAPP_WEBSOCKET_PONG_TIMEOUT")
	_ = v.BindEnv("websocket.reconnect_delay", "WHATSAPP_WEBSOCKET_RECONNECT_DELAY")
	_ = v.BindEnv("websocket.max_reconnects", "WHATSAPP_WEBSOCKET_MAX_RECONNECTS")
	_ = v.BindEnv("websocket.queue_size", "WHATSAPP_WEBSOCKET_QUEUE_SIZE")

	// Log
	_ = v.BindEnv("log.level", "WHATSAPP_LOG_LEVEL", "LOG_LEVEL")
	_ = v.BindEnv("log.format", "WHATSAPP_LOG_FORMAT", "LOG_FORMAT")
}

// MustLoad loads configuration and panics on error (for use in main)
func MustLoad() *Config {
	cfg, err := Load()
	if err != nil {
		panic(fmt.Sprintf("failed to load configuration: %v", err))
	}
	return cfg
}
