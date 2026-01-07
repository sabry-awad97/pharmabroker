package repository

import (
	"context"
)

// HealthStatus represents the health status of a component
type HealthStatus struct {
	Healthy bool           `json:"healthy"`
	Name    string         `json:"name"`
	Message string         `json:"message,omitempty"`
	Details map[string]any `json:"details,omitempty"`
}

// HealthChecker defines the interface for health checking components
type HealthChecker interface {
	// Check performs a health check and returns the status
	Check(ctx context.Context) HealthStatus

	// Name returns the name of the component being checked
	Name() string
}

// ReadinessResponse represents the response for readiness probe
type ReadinessResponse struct {
	Ready      bool           `json:"ready"`
	Components []HealthStatus `json:"components"`
}

// LivenessResponse represents the response for liveness probe
type LivenessResponse struct {
	Alive   bool   `json:"alive"`
	Message string `json:"message,omitempty"`
}
