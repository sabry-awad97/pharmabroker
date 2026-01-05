package main

import (
	"log"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	port := getEnv("PORT", "8080")

	r := gin.Default()

	r.GET("/", func(c *gin.Context) {
		c.String(200, "OK")
	})

	log.Printf("🚀 WhatsApp service listening on :%s", port)
	r.Run(":" + port)
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
