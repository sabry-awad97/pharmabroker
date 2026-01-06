package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pharmabroker/whatsapp/internal/app"
	"github.com/pharmabroker/whatsapp/internal/infrastructure/config"
	"github.com/pharmabroker/whatsapp/internal/presentation/ws"
	"go.uber.org/fx"
)

func main() {
	fxApp := fx.New(
		// Include all application modules
		app.Module,

		// Invoke the server startup
		fx.Invoke(startServer),
	)

	fxApp.Run()
}

// startServer starts the HTTP server with graceful shutdown
func startServer(
	lc fx.Lifecycle,
	router *gin.Engine,
	qrHandler *ws.QRHandler,
	cfg *config.Config,
) {
	// Register QR WebSocket routes on the router
	qrHandler.RegisterRoutes(router)

	// Create HTTP server
	srv := &http.Server{
		Addr:         cfg.Server.Address(),
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			log.Printf("🚀 WhatsApp service starting on %s", cfg.Server.Address())
			log.Printf("📁 Whatsmeow database: %s", cfg.WhatsApp.DBPath)
			log.Printf("� WebSoceket API URL: %s", cfg.WebSocket.URL)

			// Start server in a goroutine
			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					log.Printf("❌ Server error: %v", err)
				}
			}()

			return nil
		},
		OnStop: func(ctx context.Context) error {
			log.Println("🛑 Shutting down WhatsApp service...")

			// Create a deadline for graceful shutdown
			shutdownCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			defer cancel()

			if err := srv.Shutdown(shutdownCtx); err != nil {
				return fmt.Errorf("server shutdown error: %w", err)
			}

			log.Println("✅ WhatsApp service stopped gracefully")
			return nil
		},
	})
}
