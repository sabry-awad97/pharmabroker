// Package pkg contains shared utilities and dependency imports
package pkg

// This file ensures all required dependencies are tracked by go mod tidy.
// These imports will be used throughout the application.

import (
	_ "github.com/gin-gonic/gin"
	_ "github.com/go-playground/validator/v10"
	_ "github.com/gorilla/websocket"
	_ "github.com/leanovate/gopter"
	_ "github.com/spf13/viper"
	_ "github.com/stretchr/testify/assert"
	_ "go.mau.fi/whatsmeow"
	_ "go.uber.org/fx"
	_ "modernc.org/sqlite"
)
