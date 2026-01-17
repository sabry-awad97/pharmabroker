# WhatsApp Session Backup Service

Automated backup service for WhatsApp session database to prevent data loss and session logout.

## Features

- ✅ Automatic periodic backups
- ✅ Safe online backups using SQLite `VACUUM INTO`
- ✅ Automatic cleanup of old backups
- ✅ Integrity verification
- ✅ Health checks for monitoring
- ✅ Configurable interval and retention
- ✅ Read-only access to source database
- ✅ Separate backup volume for isolation

## Quick Start

### Using Docker Compose

**Development:**

```bash
docker compose up whatsapp-dev whatsapp-backup-dev
```

**Production:**

```bash
docker compose --profile prod up whatsapp whatsapp-backup
```

### Standalone Docker

```bash
# Build image
docker build -t pharmabroker-whatsapp-backup ./service/whatsapp-backup

# Run container
docker run -d \
  --name whatsapp-backup \
  -e BACKUP_INTERVAL=3600 \
  -e BACKUP_RETENTION_DAYS=7 \
  -v whatsapp_data:/data:ro \
  -v whatsapp_backups:/backups \
  pharmabroker-whatsapp-backup
```

## Configuration

### Environment Variables

| Variable                | Default              | Description                         |
| ----------------------- | -------------------- | ----------------------------------- |
| `BACKUP_INTERVAL`       | `3600`               | Backup interval in seconds (1 hour) |
| `BACKUP_RETENTION_DAYS` | `7`                  | Number of days to keep backups      |
| `DB_PATH`               | `/data/whatsmeow.db` | Path to source database             |
| `BACKUP_DIR`            | `/backups`           | Directory for backup files          |
| `TZ`                    | `Africa/Cairo`       | Timezone for timestamps             |
| `LOG_LEVEL`             | `info`               | Log level (info, warn, error)       |

### Recommended Settings

**Development:**

```bash
BACKUP_INTERVAL=3600        # 1 hour
BACKUP_RETENTION_DAYS=7     # 7 days
```

**Production:**

```bash
BACKUP_INTERVAL=1800        # 30 minutes
BACKUP_RETENTION_DAYS=14    # 14 days
```

**High-Traffic:**

```bash
BACKUP_INTERVAL=900         # 15 minutes
BACKUP_RETENTION_DAYS=30    # 30 days
```

## Usage

### View Logs

```bash
docker compose logs -f whatsapp-backup-dev
```

### List Backups

```bash
docker compose exec whatsapp-backup-dev ls -lh /backups
```

### Manual Backup

```bash
docker compose exec whatsapp-backup-dev /app/backup.sh
```

### Export Backup

```bash
# Export all backups
docker compose cp whatsapp-backup-dev:/backups/. ./whatsapp-backups/

# Export specific backup
docker compose cp whatsapp-backup-dev:/backups/whatsmeow_20260117_120000.db ./backup.db
```

### Restore Backup

```bash
# 1. Stop WhatsApp service
docker compose stop whatsapp-dev

# 2. Copy backup to data volume
docker compose exec whatsapp-backup-dev cp /backups/whatsmeow_20260117_120000.db /data/whatsmeow.db

# 3. Restart WhatsApp service
docker compose start whatsapp-dev
```

## Backup Process

### 1. Backup Creation

The service uses SQLite's `VACUUM INTO` command:

```sql
VACUUM INTO '/backups/whatsmeow_YYYYMMDD_HHMMSS.db';
```

**Benefits:**

- Safe for online databases
- Creates clean copy without WAL files
- Verifies integrity during process
- No database locking required

### 2. Integrity Verification

Each backup is verified after creation:

```sql
PRAGMA integrity_check;
```

Failed backups are automatically deleted.

### 3. Cleanup

Old backups are removed based on retention policy:

```bash
find /backups -name "whatsmeow_*.db" -mtime +${BACKUP_RETENTION_DAYS} -delete
```

## Monitoring

### Health Check

The container includes a health check:

```bash
# Check if last backup is recent (within 2× interval)
test $(( $(date +%s) - $(stat -c %Y /backups/.last_backup) )) -lt $(( BACKUP_INTERVAL * 2 ))
```

**Check status:**

```bash
docker compose ps whatsapp-backup-dev
```

### Metrics

Monitor these metrics:

1. **Backup Success Rate**
   - Look for "Backup completed successfully" in logs
   - Alert on consecutive failures

2. **Backup Size**
   - Track database growth
   - Alert on unexpected changes

3. **Backup Duration**
   - Monitor time taken
   - Alert on slow backups

4. **Storage Usage**
   - Monitor volume usage
   - Alert when approaching capacity

## Troubleshooting

### No Backups Created

**Check service status:**

```bash
docker compose ps whatsapp-backup-dev
docker compose logs whatsapp-backup-dev
```

**Verify volumes:**

```bash
docker volume ls | grep whatsapp
docker volume inspect whatsapp_data_dev
docker volume inspect whatsapp_backups_dev
```

### Backup Failures

**Check disk space:**

```bash
docker compose exec whatsapp-backup-dev df -h
```

**Check database access:**

```bash
docker compose exec whatsapp-backup-dev ls -lh /data/whatsmeow.db
```

**Check permissions:**

```bash
docker compose exec whatsapp-backup-dev stat /data/whatsmeow.db
```

### Database Corruption

**Check integrity:**

```bash
docker compose exec whatsapp-backup-dev sqlite3 /data/whatsmeow.db "PRAGMA integrity_check;"
```

**Restore from backup:**

```bash
docker compose stop whatsapp-dev
docker compose exec whatsapp-backup-dev cp /backups/whatsmeow_LATEST.db /data/whatsmeow.db
docker compose start whatsapp-dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Host                              │
│                                                             │
│  ┌──────────────────────┐      ┌──────────────────────┐   │
│  │  WhatsApp Service    │      │  Backup Service      │   │
│  │                      │      │                      │   │
│  │  ┌────────────────┐ │      │  ┌────────────────┐ │   │
│  │  │ whatsmeow.db   │◄├──────┤──│  backup.sh     │ │   │
│  │  │ (read/write)   │ │  RO  │  │  (read-only)   │ │   │
│  │  └────────────────┘ │      │  └────────────────┘ │   │
│  │         │            │      │         │           │   │
│  └─────────┼────────────┘      └─────────┼───────────┘   │
│            │                              │               │
│            ▼                              ▼               │
│  ┌──────────────────────┐      ┌──────────────────────┐  │
│  │  whatsapp_data       │      │  whatsapp_backups    │  │
│  │  (persistent volume) │      │  (backup volume)     │  │
│  └──────────────────────┘      └──────────────────────┘  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

## Security

### Access Control

- Backup service has **read-only** access to database
- Only WhatsApp service can write to database
- Backup volume is separate from data volume
- Non-root user (backupuser) runs the service

### Data Protection

The session database contains sensitive data:

- Authentication tokens
- Encryption keys
- Contact information

**Recommendations:**

- Encrypt backup volume at rest
- Use encrypted external storage for exports
- Secure backup transfer channels
- Implement access controls

## Storage Requirements

**Typical database size:** 1-50 MB

**Storage calculation:**

```
Storage = (DB Size) × (Backups/Day) × (Retention Days)

Example (1 hour interval, 7 days):
Storage = 10 MB × 24 × 7 = 1.68 GB
```

## Best Practices

1. **Regular Exports**
   - Export backups to external storage weekly
   - Use automated scripts or cron jobs

2. **Test Restores**
   - Periodically test restore procedure
   - Verify data integrity after restore

3. **Monitor Health**
   - Set up alerts for backup failures
   - Monitor storage usage
   - Track backup duration

4. **Secure Storage**
   - Encrypt backups at rest
   - Restrict access to backup volumes
   - Use off-site storage for critical backups

5. **Document Procedures**
   - Maintain restore runbooks
   - Document recovery steps
   - Keep contact information updated

## License

Part of the PharmaBroker project.

## Support

For issues or questions:

1. Check logs: `docker compose logs whatsapp-backup-dev`
2. Review documentation: `../whatsapp/SESSION_PERSISTENCE.md`
3. Check GitHub issues
4. Contact development team
