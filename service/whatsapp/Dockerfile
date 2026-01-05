# ═══════════════════════════════════════════════════════════════════════════════
#  📱 PharmaBroker WhatsApp Service
# ═══════════════════════════════════════════════════════════════════════════════
#  Multi-stage build for Go/Gin WhatsApp microservice with SQLite support
#  Run from service/whatsapp: docker build -t pharmabroker-whatsapp .
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
#  Builder Stage - Compile Go binary with CGO for SQLite
# ─────────────────────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies (including C compiler for CGO/SQLite)
RUN apk add --no-cache git ca-certificates gcc musl-dev

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary with CGO enabled for SQLite support
# Using modernc.org/sqlite which is pure Go, so CGO_ENABLED=0 works
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/whatsapp ./cmd/whatsapp

# ─────────────────────────────────────────────────────────────────────────────
#  Runtime Stage - Minimal image with just the binary
# ─────────────────────────────────────────────────────────────────────────────
FROM alpine:3.21

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata

# Create non-root user for security
RUN adduser -D -g '' appuser

# Create data directory for SQLite database
RUN mkdir -p /data && chown -R appuser:appuser /data

# Copy binary from builder
COPY --from=builder /app/whatsapp .

# Set ownership
RUN chown -R appuser:appuser /app

USER appuser

# Environment variables with defaults
ENV WHATSAPP_SERVER_HOST=0.0.0.0
ENV WHATSAPP_SERVER_PORT=8080
ENV WHATSAPP_SQLITE_PATH=/data/whatsapp.db
ENV WHATSAPP_LOG_LEVEL=info
ENV WHATSAPP_LOG_FORMAT=json

# Expose HTTP port
EXPOSE 8080

# Volume for SQLite data persistence
VOLUME ["/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["./whatsapp"]
