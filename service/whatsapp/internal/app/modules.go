package app

import (
	"github.com/pharmabroker/whatsapp/internal/application"
	"github.com/pharmabroker/whatsapp/internal/infrastructure"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/presentation"
	"go.uber.org/fx"
)

// Module aggregates all application modules for easy import
var Module = fx.Options(
	config.Module,
	infrastructure.Module,
	application.Module,
	presentation.Module,
)
