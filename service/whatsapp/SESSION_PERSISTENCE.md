# WhatsApp Session Persistence & Backup

This document describes the session persistence and backup strategy for the WhatsApp service to prevent data loss and session logout when containers are recreated.

## Overview

The WhatsApp service uses `whatsmeow` which stores session credentials in a SQLite database (`whatsmeow.db`). This database contains:

- Session authentication tokens
- Encryption keys
- Device registration data
- Contact information
- Message keys

**Critical:** If this database is lost, the WhatsApp session will be logged out and require QR code re-authentication.

## Architecture

### 1. Persistent Volume Storage

The session database is stored on a Docker named volume that persists across container restarts and recreations.

**Development:**

```yaml
volumes:
  - whatsapp_data_dev:/data
```

**Production:**

```yaml
volumes:
  - whatsapp_data:/data
```

**Database Location:** `/data/whatsmeow.db`

### 2. Backup Service (Sidecar Container)

A dedicated backup service runs alongside the WhatsApp service to create periodic backups of the session database.

**Features:**

- Automatic periodic backups (configurable interval)
- Safe online backups using SQLite `VACUUM INTO`
- Automatic cleanup of old backups (configurable retention)
- Integrity verification of backups
- Health checks for monitoring
- Separate backup volume for isolation

## Configuration

### Environment Variables

**WhatsApp Service:**

```bash
WHATSAPP_DB_PATH=/data/whatsmeow.db  # Database location
```

**Backup Service:**

```bash
# Backup interval in seconds (default: 3600 = 1 hour)
WHATSAPP_BACKUP_INTERVAL=3600

# Backup retention in days (default: 7 days)
WHATSAPP_BACKUP_RETENTION_DAYS=7

# Database path (read-only access)
DB_PATH=/data/whatsmeow.db

# Backup directory
BACKUP_DIR=/backups
```

### Docker Compose Configuration

The backup service is configured in `docker-compose.yml`:

```yaml
whatsapp-backup-dev:
  build:
    context: ./service/whatsapp-backup
  environment:
    BACKUP_INTERVAL: 3600
    BACKUP_RETENTION_DAYS: 7
  volumes:
    - whatsapp_data_dev:/data:ro # Read-only access
    - whatsapp_backups_dev:/backups # Separate backup volume
  depends_on:
    - whatsapp-dev
```

## Usage

### Starting Services

**Development:**

```bash
docker compose up whatsapp-dev whatsapp-backup-dev
```

**Production:**

```bash
docker compose --profile prod up whatsapp whatsapp-backup
```

### Viewing Backup Logs

```bash
# Development
docker compose logs -f whatsapp-backup-dev

# Production
docker compose logs -f whatsapp-backup
```

### Listing Backups

```bash
# Development
docker compose exec whatsapp-backup-dev ls -lh /backups

# Production
docker compose exec whatsapp-backup ls -lh /backups
```

### Manual Backup

Trigger an immediate backup:

```bash
# Development
docker compose exec whatsapp-backup-dev /app/backup.sh

# Production
docker compose exec whatsapp-backup /app/backup.sh
```

### Restoring from Backup

**⚠️ Warning:** This will overwrite the current session database!

1. **Stop the WhatsApp service:**

   ```bash
   docker compose stop whatsapp-dev
   ```

2. **List available backups:**

   ```bash
   docker compose exec whatsapp-backup-dev ls -lh /backups
   ```

3. **Copy backup to data volume:**

   ```bash
   # Replace YYYYMMDD_HHMMSS with your backup timestamp
   docker compose exec whatsapp-backup-dev cp /backups/whatsmeow_YYYYMMDD_HHMMSS.db /data/whatsmeow.db
   ```

4. **Restart the WhatsApp service:**
   ```bash
   docker compose start whatsapp-dev
   ```

### Exporting Backups to Host

Export backups to your local machine for safekeeping:

```bash
# Create export directory
mkdir -p ./whatsapp-backups

# Copy all backups from container
docker compose cp whatsapp-backup-dev:/backups/. ./whatsapp-backups/

# Or copy a specific backup
docker compose cp whatsapp-backup-dev:/backups/whatsmeow_YYYYMMDD_HHMMSS.db ./whatsapp-backups/
```

### Importing Backups from Host

Restore a backup from your local machine:

```bash
# Stop WhatsApp service
docker compose stop whatsapp-dev

# Copy backup to container
docker compose cp ./whatsapp-backups/whatsmeow_YYYYMMDD_HHMMSS.db whatsapp-backup-dev:/data/whatsmeow.db

# Restart WhatsApp service
docker compose start whatsapp-dev
```

## Backup Strategy

### Backup Method: SQLite VACUUM INTO

The backup service uses SQLite's `VACUUM INTO` command, which:

- Creates a clean copy of the database
- Works safely on online (in-use) databases
- Consolidates WAL files into a single file
- Verifies integrity during the process
- Doesn't require locking the database

**Command:**

```sql
VACUUM INTO '/backups/whatsmeow_YYYYMMDD_HHMMSS.db';
```

### Backup Schedule

**Default:** Every 1 hour (3600 seconds)

**Recommended schedules:**

- **Development:** 1 hour (3600 seconds)
- **Production:** 30 minutes (1800 seconds) or 1 hour (3600 seconds)
- **High-traffic:** 15 minutes (900 seconds)

### Retention Policy

**Default:** 7 days

Old backups are automatically deleted based on file modification time.

**Recommended retention:**

- **Development:** 7 days
- **Production:** 14-30 days
- **Compliance:** As required by regulations

### Storage Requirements

**Typical database size:** 1-50 MB (depends on number of contacts and messages)

**Storage calculation:**

```
Storage = (Database Size) × (Backups per Day) × (Retention Days)

Example (1 hour interval, 7 days retention):
Storage = 10 MB × 24 × 7 = 1.68 GB
```

## Monitoring

### Health Checks

The backup service includes a health check that verifies:

- Last backup file exists
- Last backup was created within 2× the backup interval

**Check health status:**

```bash
docker compose ps whatsapp-backup-dev
```

### Backup Verification

Each backup is automatically verified using SQLite's integrity check:

```sql
PRAGMA integrity_check;
```

If verification fails, the backup is deleted and an error is logged.

### Metrics to Monitor

1. **Backup Success Rate**
   - Monitor logs for "Backup completed successfully"
   - Alert on consecutive failures

2. **Backup Size**
   - Track database growth over time
   - Alert on unexpected size changes

3. **Backup Duration**
   - Monitor time taken for backups
   - Alert on slow backups (may indicate issues)

4. **Storage Usage**
   - Monitor backup volume usage
   - Alert when approaching capacity

## Disaster Recovery

### Scenario 1: Container Recreated

**Impact:** None - data persists on volume

**Recovery:** Automatic - container reconnects to existing volume

### Scenario 2: Volume Deleted

**Impact:** Session lost - requires QR re-authentication

**Recovery:**

1. Restore from backup (see "Restoring from Backup")
2. If no backup available, re-authenticate with QR code

### Scenario 3: Database Corruption

**Impact:** Service may fail to start or crash

**Recovery:**

1. Check logs for corruption errors
2. Restore from most recent valid backup
3. If all backups corrupted, re-authenticate with QR code

### Scenario 4: Host Machine Failure

**Impact:** All data lost if volumes not backed up externally

**Recovery:**

1. Restore volumes from host backup
2. Or restore database from exported backups
3. Or re-authenticate with QR code

## Best Practices

### 1. Regular Backup Exports

Export backups to external storage regularly:

```bash
# Weekly backup export (add to cron)
docker compose cp whatsapp-backup:/backups/. /external/storage/whatsapp-backups/
```

### 2. Test Restore Procedure

Periodically test the restore procedure in a development environment:

```bash
# 1. Stop service
docker compose stop whatsapp-dev

# 2. Restore from backup
docker compose exec whatsapp-backup-dev cp /backups/whatsmeow_LATEST.db /data/whatsmeow.db

# 3. Start service and verify
docker compose start whatsapp-dev
docker compose logs whatsapp-dev
```

### 3. Monitor Backup Health

Set up alerts for:

- Backup failures
- Missing backups
- Storage capacity warnings
- Integrity check failures

### 4. Secure Backup Storage

- Encrypt backups at rest
- Restrict access to backup volumes
- Use separate volumes for backups
- Export critical backups to off-site storage

### 5. Document Recovery Procedures

Maintain runbooks for:

- Routine restore procedures
- Emergency recovery steps
- Contact information for support
- Escalation procedures

## Troubleshooting

### Issue: Backup Service Not Running

**Symptoms:**

- No new backups created
- Health check failing

**Solution:**

```bash
# Check service status
docker compose ps whatsapp-backup-dev

# Check logs
docker compose logs whatsapp-backup-dev

# Restart service
docker compose restart whatsapp-backup-dev
```

### Issue: Backup Failures

**Symptoms:**

- Error logs in backup service
- "VACUUM INTO failed" messages

**Possible Causes:**

1. Database locked by WhatsApp service
2. Insufficient disk space
3. Permission issues

**Solution:**

```bash
# Check disk space
docker compose exec whatsapp-backup-dev df -h

# Check database file
docker compose exec whatsapp-backup-dev ls -lh /data/whatsmeow.db

# Check permissions
docker compose exec whatsapp-backup-dev stat /data/whatsmeow.db
```

### Issue: Database Corruption

**Symptoms:**

- WhatsApp service crashes on startup
- "database disk image is malformed" errors

**Solution:**

```bash
# 1. Stop service
docker compose stop whatsapp-dev

# 2. Check database integrity
docker compose exec whatsapp-backup-dev sqlite3 /data/whatsmeow.db "PRAGMA integrity_check;"

# 3. If corrupted, restore from backup
docker compose exec whatsapp-backup-dev cp /backups/whatsmeow_LATEST.db /data/whatsmeow.db

# 4. Restart service
docker compose start whatsapp-dev
```

### Issue: Out of Disk Space

**Symptoms:**

- Backup failures
- "No space left on device" errors

**Solution:**

```bash
# Check volume usage
docker system df -v

# Reduce retention period
# Edit docker-compose.yml:
WHATSAPP_BACKUP_RETENTION_DAYS: 3

# Manually cleanup old backups
docker compose exec whatsapp-backup-dev find /backups -name "whatsmeow_*.db" -mtime +3 -delete

# Restart backup service
docker compose restart whatsapp-backup-dev
```

## Security Considerations

### 1. Access Control

- Backup service has **read-only** access to database
- Only WhatsApp service can write to database
- Backup volume is separate from data volume

### 2. Encryption

The session database contains sensitive data:

- Authentication tokens
- Encryption keys
- Contact information

**Recommendations:**

- Encrypt backup volume at rest
- Use encrypted external storage for exports
- Secure backup transfer channels

### 3. Compliance

Ensure backup strategy complies with:

- Data retention policies
- Privacy regulations (GDPR, HIPAA, etc.)
- Industry standards

## Related Documentation

- [WhatsApp Service Architecture](./docs/ARCHITECTURE.md)
- [Docker Deployment Guide](../../DOCKER.md)
- [Monitoring Guide](./docs/MONITORING.md)

## Support

For issues or questions:

1. Check logs: `docker compose logs whatsapp-backup-dev`
2. Review this documentation
3. Check GitHub issues
4. Contact development team
