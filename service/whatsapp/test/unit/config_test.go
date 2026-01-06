package unit

import (
	"testing"

	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfig_Load_Defaults(t *testing.T) {
	v := viper.New()
	cfg, err := config.LoadWithViper(v)
	require.NoError(t, err)

	// Server defaults
	assert.Equal(t, "0.0.0.0", cfg.Server.Host)
	assert.Equal(t, 8080, cfg.Server.Port)

	// WhatsApp defaults - whatsmeow database path
	assert.Equal(t, "/data/whatsmeow.db", cfg.WhatsApp.DBPath)
}

func TestConfig_Validate_MissingDBPath(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{Host: "0.0.0.0", Port: 8080},
		WhatsApp: config.WhatsAppConfig{
			DBPath:           "", // Missing
			QRTimeout:        120000000000,
			ReconnectDelay:   5000000000,
			MaxReconnects:    10,
			MessageRateLimit: 30,
		},
		WebSocket: config.WebSocketConfig{
			URL:            "ws://localhost:3000/ws",
			PingInterval:   30000000000,
			PongTimeout:    10000000000,
			ReconnectDelay: 5000000000,
			QueueSize:      1000,
		},
		Log: config.LogConfig{Level: "info", Format: "json"},
	}

	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "whatsapp.db_path")
}

func TestConfig_Validate_ValidConfig(t *testing.T) {
	v := viper.New()
	cfg, err := config.LoadWithViper(v)
	require.NoError(t, err)

	err = cfg.Validate()
	assert.NoError(t, err)
}
