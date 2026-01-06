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

	// SQLite defaults - separate databases
	assert.Equal(t, "/data/sessions.db", cfg.SQLite.Path)
	assert.Equal(t, "/data/whatsmeow.db", cfg.SQLite.WhatsmeowPath)
	assert.Equal(t, 5000, cfg.SQLite.BusyTimeout)

	// Verify paths are different
	assert.NotEqual(t, cfg.SQLite.Path, cfg.SQLite.WhatsmeowPath,
		"Session and Whatsmeow databases should use different paths to avoid lock contention")
}

func TestConfig_SQLite_DSN(t *testing.T) {
	cfg := config.SQLiteConfig{
		Path:          "/data/sessions.db",
		WhatsmeowPath: "/data/whatsmeow.db",
		BusyTimeout:   5000,
	}

	// Session repository DSN
	dsn := cfg.DSN()
	assert.Contains(t, dsn, "/data/sessions.db")
	assert.Contains(t, dsn, "_journal_mode=WAL")
	assert.Contains(t, dsn, "_busy_timeout=5000")

	// Whatsmeow DSN
	whatsmeowDSN := cfg.WhatsmeowDSN()
	assert.Contains(t, whatsmeowDSN, "/data/whatsmeow.db")
	assert.Contains(t, whatsmeowDSN, "_pragma=foreign_keys(1)")
	assert.Contains(t, whatsmeowDSN, "_pragma=journal_mode(WAL)")
	assert.Contains(t, whatsmeowDSN, "_pragma=busy_timeout(5000)")
}

func TestConfig_Validate_MissingPath(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{Host: "0.0.0.0", Port: 8080},
		SQLite: config.SQLiteConfig{
			Path:          "", // Missing
			WhatsmeowPath: "/data/whatsmeow.db",
			BusyTimeout:   5000,
		},
		WhatsApp: config.WhatsAppConfig{
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
	assert.Contains(t, err.Error(), "sqlite.path")
}

func TestConfig_Validate_MissingWhatsmeowPath(t *testing.T) {
	cfg := &config.Config{
		Server: config.ServerConfig{Host: "0.0.0.0", Port: 8080},
		SQLite: config.SQLiteConfig{
			Path:          "/data/sessions.db",
			WhatsmeowPath: "", // Missing
			BusyTimeout:   5000,
		},
		WhatsApp: config.WhatsAppConfig{
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
	assert.Contains(t, err.Error(), "sqlite.whatsmeow_path")
}

func TestConfig_Validate_ValidConfig(t *testing.T) {
	v := viper.New()
	cfg, err := config.LoadWithViper(v)
	require.NoError(t, err)

	err = cfg.Validate()
	assert.NoError(t, err)
}

func TestConfig_SeparateDatabases_NoLockContention(t *testing.T) {
	// This test documents the architectural decision to use separate databases
	// to avoid SQLite lock contention between the session repository and whatsmeow

	v := viper.New()
	cfg, err := config.LoadWithViper(v)
	require.NoError(t, err)

	// The session repository uses one database
	sessionDB := cfg.SQLite.Path
	// The whatsmeow client uses a different database
	whatsmeowDB := cfg.SQLite.WhatsmeowPath

	assert.NotEqual(t, sessionDB, whatsmeowDB,
		"Session and Whatsmeow must use separate databases to prevent lock contention")

	// Both should be in the same directory for simplicity
	assert.Contains(t, sessionDB, "/data/")
	assert.Contains(t, whatsmeowDB, "/data/")
}
