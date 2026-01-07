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

	// WhatsApp client configuration (includes whatsmeow database path)
	WhatsApp WhatsAppConfig `mapstructure:"whatsapp"`

	// WebSocket configuration for API server connection
	WebSocket WebSocketConfig `mapstructure:"websocket"`

	// Logging configuration
	Log LogConfig `mapstructure:"log"`

	// Rate limiting configuration
	RateLimit RateLimitConfig `mapstructure:"ratelimit"`

	// CORS configuration
	CORS CORSConfig `mapstructure:"cors"`

	// API Key authentication configuration
	APIKey APIKeyConfig `mapstructure:"apikey"`

	// Metrics configuration
	Metrics MetricsConfig `mapstructure:"metrics"`

	// Circuit breaker configuration
	CircuitBreaker CircuitBreakerConfig `mapstructure:"circuitbreaker"`
}

// CircuitBreakerConfig holds circuit breaker configuration
type CircuitBreakerConfig struct {
	Enabled          bool          `mapstructure:"enabled"`
	MaxRequests      uint32        `mapstructure:"max_requests"`      // Max requests in half-open state
	Interval         time.Duration `mapstructure:"interval"`          // Interval for clearing counts in closed state
	Timeout          time.Duration `mapstructure:"timeout"`           // Timeout before transitioning from open to half-open
	FailureThreshold uint32        `mapstructure:"failure_threshold"` // Consecutive failures to open circuit
	SuccessThreshold uint32        `mapstructure:"success_threshold"` // Consecutive successes to close circuit
}

// MetricsConfig holds Prometheus metrics configuration
type MetricsConfig struct {
	Enabled   bool   `mapstructure:"enabled"`
	Path      string `mapstructure:"path"`      // Metrics endpoint path (default: /metrics)
	Namespace string `mapstructure:"namespace"` // Prometheus namespace (default: whatsapp)
}

// APIKeyConfig holds API key authentication configuration
type APIKeyConfig struct {
	Enabled bool     `mapstructure:"enabled"`
	Keys    []string `mapstructure:"keys"`   // List of valid API keys
	Header  string   `mapstructure:"header"` // Header name for API key (default: X-API-Key)
}

// CORSConfig holds CORS configuration
type CORSConfig struct {
	AllowedOrigins   []string `mapstructure:"allowed_origins"`
	AllowedMethods   []string `mapstructure:"allowed_methods"`
	AllowedHeaders   []string `mapstructure:"allowed_headers"`
	ExposeHeaders    []string `mapstructure:"expose_headers"`
	AllowCredentials bool     `mapstructure:"allow_credentials"`
	MaxAge           int      `mapstructure:"max_age"` // seconds
}

// RateLimitConfig holds rate limiting configuration
type RateLimitConfig struct {
	Enabled           bool          `mapstructure:"enabled"`
	RequestsPerSecond float64       `mapstructure:"requests_per_second"`
	BurstSize         int           `mapstructure:"burst_size"`
	ByIP              bool          `mapstructure:"by_ip"`
	ByAPIKey          bool          `mapstructure:"by_api_key"`
	CleanupInterval   time.Duration `mapstructure:"cleanup_interval"`
	MaxAge            time.Duration `mapstructure:"max_age"`
}

// ServerConfig holds HTTP server configuration
type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port int    `mapstructure:"port"`
}

// WhatsAppConfig holds WhatsApp client configuration
type WhatsAppConfig struct {
	DBPath           string        `mapstructure:"db_path"` // Whatsmeow SQLite database path
	QRTimeout        time.Duration `mapstructure:"qr_timeout"`
	ReconnectDelay   time.Duration `mapstructure:"reconnect_delay"`
	MaxReconnects    int           `mapstructure:"max_reconnects"`
	MessageRateLimit int           `mapstructure:"message_rate_limit"` // messages per minute
}

// WebSocketConfig holds WebSocket configuration for API server connection
type WebSocketConfig struct {
	URL            string        `mapstructure:"url"`
	APIKey         string        `mapstructure:"api_key"` // API key for authentication with Node.js API
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

	// Validate WhatsApp config
	if c.WhatsApp.DBPath == "" {
		errs = append(errs, ValidationError{
			Field:   "whatsapp.db_path",
			Message: "is required",
		})
	}
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

	// Validate RateLimit config
	if c.RateLimit.Enabled {
		if c.RateLimit.RequestsPerSecond <= 0 {
			errs = append(errs, ValidationError{
				Field:   "ratelimit.requests_per_second",
				Message: "must be positive when rate limiting is enabled",
			})
		}
		if c.RateLimit.BurstSize <= 0 {
			errs = append(errs, ValidationError{
				Field:   "ratelimit.burst_size",
				Message: "must be positive when rate limiting is enabled",
			})
		}
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

	// WhatsApp defaults
	v.SetDefault("whatsapp.db_path", "/data/whatsmeow.db")
	v.SetDefault("whatsapp.qr_timeout", 2*time.Minute)
	v.SetDefault("whatsapp.reconnect_delay", 5*time.Second)
	v.SetDefault("whatsapp.max_reconnects", 10)
	v.SetDefault("whatsapp.message_rate_limit", 30)

	// WebSocket defaults
	v.SetDefault("websocket.url", "ws://localhost:3000/ws/whatsapp")
	v.SetDefault("websocket.api_key", "") // API key for authenticating with Node.js API
	v.SetDefault("websocket.ping_interval", 30*time.Second)
	v.SetDefault("websocket.pong_timeout", 10*time.Second)
	v.SetDefault("websocket.reconnect_delay", 5*time.Second)
	v.SetDefault("websocket.max_reconnects", 0) // 0 = unlimited
	v.SetDefault("websocket.queue_size", 1000)

	// Log defaults
	v.SetDefault("log.level", "info")
	v.SetDefault("log.format", "json")

	// RateLimit defaults
	v.SetDefault("ratelimit.enabled", true)
	v.SetDefault("ratelimit.requests_per_second", 10.0)
	v.SetDefault("ratelimit.burst_size", 20)
	v.SetDefault("ratelimit.by_ip", true)
	v.SetDefault("ratelimit.by_api_key", false)
	v.SetDefault("ratelimit.cleanup_interval", 5*time.Minute)
	v.SetDefault("ratelimit.max_age", time.Hour)

	// CORS defaults
	v.SetDefault("cors.allowed_origins", []string{"*"})
	v.SetDefault("cors.allowed_methods", []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"})
	v.SetDefault("cors.allowed_headers", []string{"Origin", "Content-Type", "Accept", "Authorization", "X-Request-ID", "X-API-Key"})
	v.SetDefault("cors.expose_headers", []string{"X-Request-ID", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"})
	v.SetDefault("cors.allow_credentials", false)
	v.SetDefault("cors.max_age", 86400) // 24 hours

	// APIKey defaults
	v.SetDefault("apikey.enabled", false)
	v.SetDefault("apikey.keys", []string{})
	v.SetDefault("apikey.header", "X-API-Key")

	// Metrics defaults
	v.SetDefault("metrics.enabled", true)
	v.SetDefault("metrics.path", "/metrics")
	v.SetDefault("metrics.namespace", "whatsapp")

	// CircuitBreaker defaults
	v.SetDefault("circuitbreaker.enabled", true)
	v.SetDefault("circuitbreaker.max_requests", 3)
	v.SetDefault("circuitbreaker.interval", 60*time.Second)
	v.SetDefault("circuitbreaker.timeout", 30*time.Second)
	v.SetDefault("circuitbreaker.failure_threshold", 5)
	v.SetDefault("circuitbreaker.success_threshold", 2)
}

func bindEnvVars(v *viper.Viper) {
	// Server
	_ = v.BindEnv("server.host", "WHATSAPP_SERVER_HOST")
	_ = v.BindEnv("server.port", "WHATSAPP_SERVER_PORT")

	// WhatsApp
	_ = v.BindEnv("whatsapp.db_path", "WHATSAPP_DB_PATH")
	_ = v.BindEnv("whatsapp.qr_timeout", "WHATSAPP_QR_TIMEOUT")
	_ = v.BindEnv("whatsapp.reconnect_delay", "WHATSAPP_RECONNECT_DELAY")
	_ = v.BindEnv("whatsapp.max_reconnects", "WHATSAPP_MAX_RECONNECTS")
	_ = v.BindEnv("whatsapp.message_rate_limit", "WHATSAPP_MESSAGE_RATE_LIMIT")

	// WebSocket
	_ = v.BindEnv("websocket.url", "WHATSAPP_WEBSOCKET_URL", "API_WEBHOOK_URL")
	_ = v.BindEnv("websocket.api_key", "WHATSAPP_WEBSOCKET_API_KEY")
	_ = v.BindEnv("websocket.ping_interval", "WHATSAPP_WEBSOCKET_PING_INTERVAL")
	_ = v.BindEnv("websocket.pong_timeout", "WHATSAPP_WEBSOCKET_PONG_TIMEOUT")
	_ = v.BindEnv("websocket.reconnect_delay", "WHATSAPP_WEBSOCKET_RECONNECT_DELAY")
	_ = v.BindEnv("websocket.max_reconnects", "WHATSAPP_WEBSOCKET_MAX_RECONNECTS")
	_ = v.BindEnv("websocket.queue_size", "WHATSAPP_WEBSOCKET_QUEUE_SIZE")

	// Log
	_ = v.BindEnv("log.level", "WHATSAPP_LOG_LEVEL", "LOG_LEVEL")
	_ = v.BindEnv("log.format", "WHATSAPP_LOG_FORMAT", "LOG_FORMAT")

	// RateLimit
	_ = v.BindEnv("ratelimit.enabled", "WHATSAPP_RATELIMIT_ENABLED")
	_ = v.BindEnv("ratelimit.requests_per_second", "WHATSAPP_RATELIMIT_RPS")
	_ = v.BindEnv("ratelimit.burst_size", "WHATSAPP_RATELIMIT_BURST")
	_ = v.BindEnv("ratelimit.by_ip", "WHATSAPP_RATELIMIT_BY_IP")
	_ = v.BindEnv("ratelimit.by_api_key", "WHATSAPP_RATELIMIT_BY_API_KEY")
	_ = v.BindEnv("ratelimit.cleanup_interval", "WHATSAPP_RATELIMIT_CLEANUP_INTERVAL")
	_ = v.BindEnv("ratelimit.max_age", "WHATSAPP_RATELIMIT_MAX_AGE")

	// CORS
	_ = v.BindEnv("cors.allowed_origins", "WHATSAPP_CORS_ORIGINS")
	_ = v.BindEnv("cors.allowed_methods", "WHATSAPP_CORS_METHODS")
	_ = v.BindEnv("cors.allowed_headers", "WHATSAPP_CORS_HEADERS")
	_ = v.BindEnv("cors.expose_headers", "WHATSAPP_CORS_EXPOSE_HEADERS")
	_ = v.BindEnv("cors.allow_credentials", "WHATSAPP_CORS_ALLOW_CREDENTIALS")
	_ = v.BindEnv("cors.max_age", "WHATSAPP_CORS_MAX_AGE")

	// APIKey
	_ = v.BindEnv("apikey.enabled", "WHATSAPP_API_KEY_ENABLED")
	_ = v.BindEnv("apikey.keys", "WHATSAPP_API_KEYS")
	_ = v.BindEnv("apikey.header", "WHATSAPP_API_KEY_HEADER")

	// Metrics
	_ = v.BindEnv("metrics.enabled", "WHATSAPP_METRICS_ENABLED")
	_ = v.BindEnv("metrics.path", "WHATSAPP_METRICS_PATH")
	_ = v.BindEnv("metrics.namespace", "WHATSAPP_METRICS_NAMESPACE")

	// CircuitBreaker
	_ = v.BindEnv("circuitbreaker.enabled", "WHATSAPP_CIRCUIT_BREAKER_ENABLED")
	_ = v.BindEnv("circuitbreaker.max_requests", "WHATSAPP_CIRCUIT_BREAKER_MAX_REQUESTS")
	_ = v.BindEnv("circuitbreaker.interval", "WHATSAPP_CIRCUIT_BREAKER_INTERVAL")
	_ = v.BindEnv("circuitbreaker.timeout", "WHATSAPP_CIRCUIT_BREAKER_TIMEOUT")
	_ = v.BindEnv("circuitbreaker.failure_threshold", "WHATSAPP_CIRCUIT_BREAKER_FAILURE_THRESHOLD")
	_ = v.BindEnv("circuitbreaker.success_threshold", "WHATSAPP_CIRCUIT_BREAKER_SUCCESS_THRESHOLD")
}

// MustLoad loads configuration and panics on error (for use in main)
func MustLoad() *Config {
	cfg, err := Load()
	if err != nil {
		panic(fmt.Sprintf("failed to load configuration: %v", err))
	}
	return cfg
}
