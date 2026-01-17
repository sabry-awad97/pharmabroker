#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
#  WhatsApp Session Backup Script
# ═══════════════════════════════════════════════════════════════════════════════
#  Performs periodic backups of the WhatsApp session database (whatsmeow.db)
#  Uses SQLite's VACUUM INTO for safe online backups
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# Configuration from environment variables
BACKUP_INTERVAL="${BACKUP_INTERVAL:-3600}"  # Default: 1 hour
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"  # Default: 7 days
DB_PATH="${DB_PATH:-/data/whatsmeow.db}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOG_LEVEL="${LOG_LEVEL:-info}"

# Logging functions
log_info() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $*"
}

log_warn() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [WARN] $*" >&2
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2
}

# Backup function using SQLite VACUUM INTO for safe online backup
perform_backup() {
    local timestamp=$(date +'%Y%m%d_%H%M%S')
    local backup_file="${BACKUP_DIR}/whatsmeow_${timestamp}.db"
    local temp_backup="${backup_file}.tmp"
    
    log_info "Starting backup: ${backup_file}"
    
    # Check if source database exists
    if [ ! -f "${DB_PATH}" ]; then
        log_warn "Source database not found: ${DB_PATH}"
        return 1
    fi
    
    # Check database file size
    local db_size=$(stat -c%s "${DB_PATH}" 2>/dev/null || echo "0")
    log_info "Database size: ${db_size} bytes"
    
    # Perform backup using VACUUM INTO (safe for online databases)
    # This creates a clean copy without WAL files
    if sqlite3 "${DB_PATH}" "VACUUM INTO '${temp_backup}';" 2>&1; then
        # Move temp backup to final location
        mv "${temp_backup}" "${backup_file}"
        
        # Verify backup integrity
        if sqlite3 "${backup_file}" "PRAGMA integrity_check;" | grep -q "ok"; then
            local backup_size=$(stat -c%s "${backup_file}")
            log_info "Backup completed successfully: ${backup_file} (${backup_size} bytes)"
            
            # Update last backup timestamp for health check
            touch "${BACKUP_DIR}/.last_backup"
            
            # Cleanup old backups
            cleanup_old_backups
            
            return 0
        else
            log_error "Backup integrity check failed: ${backup_file}"
            rm -f "${backup_file}"
            return 1
        fi
    else
        log_error "Backup failed: VACUUM INTO command failed"
        rm -f "${temp_backup}"
        return 1
    fi
}

# Cleanup old backups based on retention policy
cleanup_old_backups() {
    log_info "Cleaning up backups older than ${BACKUP_RETENTION_DAYS} days"
    
    # Find and delete old backup files
    local deleted_count=0
    while IFS= read -r -d '' backup_file; do
        rm -f "${backup_file}"
        deleted_count=$((deleted_count + 1))
        log_info "Deleted old backup: $(basename "${backup_file}")"
    done < <(find "${BACKUP_DIR}" -name "whatsmeow_*.db" -type f -mtime +${BACKUP_RETENTION_DAYS} -print0)
    
    if [ ${deleted_count} -gt 0 ]; then
        log_info "Deleted ${deleted_count} old backup(s)"
    fi
    
    # Log current backup count
    local backup_count=$(find "${BACKUP_DIR}" -name "whatsmeow_*.db" -type f | wc -l)
    log_info "Current backup count: ${backup_count}"
}

# List all backups
list_backups() {
    log_info "Available backups:"
    find "${BACKUP_DIR}" -name "whatsmeow_*.db" -type f -printf "%T@ %p\n" | \
        sort -rn | \
        while read -r timestamp path; do
            local size=$(stat -c%s "${path}")
            local date=$(date -d "@${timestamp}" +'%Y-%m-%d %H:%M:%S')
            log_info "  ${date} - $(basename "${path}") (${size} bytes)"
        done
}

# Restore from backup
restore_backup() {
    local backup_file="$1"
    
    if [ ! -f "${backup_file}" ]; then
        log_error "Backup file not found: ${backup_file}"
        return 1
    fi
    
    log_warn "Restoring from backup: ${backup_file}"
    log_warn "This will overwrite the current database!"
    
    # Verify backup integrity before restore
    if ! sqlite3 "${backup_file}" "PRAGMA integrity_check;" | grep -q "ok"; then
        log_error "Backup integrity check failed, aborting restore"
        return 1
    fi
    
    # Create a safety backup of current database
    if [ -f "${DB_PATH}" ]; then
        local safety_backup="${DB_PATH}.before_restore_$(date +'%Y%m%d_%H%M%S')"
        cp "${DB_PATH}" "${safety_backup}"
        log_info "Created safety backup: ${safety_backup}"
    fi
    
    # Restore the backup
    cp "${backup_file}" "${DB_PATH}"
    log_info "Restore completed successfully"
    
    return 0
}

# Main backup loop
main() {
    log_info "WhatsApp Session Backup Service started"
    log_info "Configuration:"
    log_info "  Database path: ${DB_PATH}"
    log_info "  Backup directory: ${BACKUP_DIR}"
    log_info "  Backup interval: ${BACKUP_INTERVAL} seconds"
    log_info "  Retention period: ${BACKUP_RETENTION_DAYS} days"
    
    # Ensure backup directory exists
    mkdir -p "${BACKUP_DIR}"
    
    # Perform initial backup
    log_info "Performing initial backup..."
    if perform_backup; then
        log_info "Initial backup completed"
    else
        log_warn "Initial backup failed, will retry on next interval"
    fi
    
    # Main loop
    while true; do
        log_info "Sleeping for ${BACKUP_INTERVAL} seconds until next backup..."
        sleep "${BACKUP_INTERVAL}"
        
        log_info "Backup interval elapsed, starting backup..."
        if perform_backup; then
            log_info "Scheduled backup completed"
        else
            log_error "Scheduled backup failed"
        fi
    done
}

# Handle signals for graceful shutdown
trap 'log_info "Received shutdown signal, exiting..."; exit 0' SIGTERM SIGINT

# Run main function
main
