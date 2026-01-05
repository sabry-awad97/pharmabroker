// Package usecase contains application use cases.
package usecase

import (
	"context"
	"runtime"
	"time"

	"github.com/pharmabroker/whatsapp/internal/domain/repository"
)

// HealthUseCase handles health check operations.
type HealthUseCase struct {
	checkers  []repository.HealthChecker
	startTime time.Time
}

// NewHealthUseCase creates a new health use case.
func NewHealthUseCase(checkers ...repository.HealthChecker) *HealthUseCase {
	return &HealthUseCase{
		checkers:  checkers,
		startTime: time.Now(),
	}
}

// AddChecker adds a health checker to the use case.
func (uc *HealthUseCase) AddChecker(checker repository.HealthChecker) {
	uc.checkers = append(uc.checkers, checker)
}

// CheckReadiness performs readiness checks on all registered components.
// Returns true if all components are healthy and ready to serve traffic.
func (uc *HealthUseCase) CheckReadiness(ctx context.Context) repository.ReadinessResponse {
	response := repository.ReadinessResponse{
		Ready:      true,
		Components: make([]repository.HealthStatus, 0, len(uc.checkers)),
	}

	for _, checker := range uc.checkers {
		status := checker.Check(ctx)
		response.Components = append(response.Components, status)

		if !status.Healthy {
			response.Ready = false
		}
	}

	return response
}

// CheckLiveness performs a liveness check.
// Returns true if the service is alive and not deadlocked.
func (uc *HealthUseCase) CheckLiveness(ctx context.Context) repository.LivenessResponse {
	response := repository.LivenessResponse{
		Alive: true,
	}

	// Check if context is already cancelled
	select {
	case <-ctx.Done():
		response.Alive = false
		response.Message = "context cancelled"
		return response
	default:
	}

	// Basic liveness check - if we can execute this code, we're alive
	response.Message = "service is alive"

	return response
}

// GetHealthDetails returns detailed health information including uptime and memory stats.
func (uc *HealthUseCase) GetHealthDetails(ctx context.Context) map[string]interface{} {
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)

	return map[string]interface{}{
		"uptime_seconds":  time.Since(uc.startTime).Seconds(),
		"goroutines":      runtime.NumGoroutine(),
		"memory_alloc_mb": float64(memStats.Alloc) / 1024 / 1024,
		"memory_sys_mb":   float64(memStats.Sys) / 1024 / 1024,
		"gc_cycles":       memStats.NumGC,
		"go_version":      runtime.Version(),
		"num_cpu":         runtime.NumCPU(),
	}
}

// Uptime returns the duration since the service started.
func (uc *HealthUseCase) Uptime() time.Duration {
	return time.Since(uc.startTime)
}
