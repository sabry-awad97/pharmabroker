# ═══════════════════════════════════════════════════════════════════════════════
#  📱 PharmaBroker WhatsApp Service
# ═══════════════════════════════════════════════════════════════════════════════
#  Multi-stage build for Go/Gin WhatsApp microservice
#  Run from service/whatsapp: docker build -t pharmabroker-whatsapp .
# ═══════════════════════════════════════════════════════════════════════════════

# ─────────────────────────────────────────────────────────────────────────────
#  Builder Stage - Compile Go binary
# ─────────────────────────────────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git ca-certificates

# Copy go mod files first for better caching
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
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

# Copy binary from builder
COPY --from=builder /app/whatsapp .

# Set ownership
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

CMD ["./whatsapp"]
