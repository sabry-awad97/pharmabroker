package config

import (
	"go.uber.org/fx"
)

// Module provides configuration dependencies
var Module = fx.Module("config",
	fx.Provide(MustLoad),
)
