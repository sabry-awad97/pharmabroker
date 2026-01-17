# ═══════════════════════════════════════════════════════════════════════════════
#  📱 PharmaBroker WhatsApp Session Backup Service
# ═══════════════════════════════════════════════════════════════════════════════
#  Lightweight Alpine-based backup service for WhatsApp session database
#  Performs periodic backups of whatsmeow.db to prevent session loss
# ═══════════════════════════════════════════════════════════════════════════════

FROM alpine:3.21

WORKDIR /app

# Install required tools
RUN apk add --no-cache \
    sqlite \
    bash \
    tzdata \
    ca-certificates

# Create backup directory
RUN mkdir -p /backups && chmod 755 /backups

# Copy backup script
COPY backup.sh /app/backup.sh

# Fix line endings and make executable
RUN sed -i 's/\r$//' /app/backup.sh && chmod +x /app/backup.sh

# Create non-root user
RUN adduser -D -g '' backupuser && \
    chown -R backupuser:backupuser /app /backups

USER backupuser

# Environment variables with defaults
ENV BACKUP_INTERVAL=3600
ENV BACKUP_RETENTION_DAYS=7
ENV DB_PATH=/data/whatsmeow.db
ENV BACKUP_DIR=/backups
ENV TZ=Africa/Cairo

# Health check
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
    CMD test -f /backups/.last_backup && \
    test $(( $(date +%s) - $(stat -c %Y /backups/.last_backup) )) -lt $(( BACKUP_INTERVAL * 2 )) || exit 1

CMD ["/app/backup.sh"]
