/**
 * Health Check System
 *
 * Comprehensive health checks for all system components.
 * Supports liveness and readiness probes for Kubernetes.
 */

import prisma from '@pharmabroker/db';
import { whatsappService } from '../services/whatsapp.service';
import { getWhatsAppWebSocketService } from '../services/whatsapp-ws.service';

// ============================================================================
// Types
// ============================================================================

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  lastCheck?: Date;
  metadata?: Record<string, unknown>;
}

export interface HealthReport {
  status: HealthStatus;
  timestamp: Date;
  uptime: number;
  checks: HealthCheck[];
  version?: string;
}

// ============================================================================
// Health Checker
// ============================================================================

class HealthChecker {
  private startTime: Date = new Date();
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();

  constructor() {
    this.registerDefaultChecks();
  }

  /**
   * Register default health checks
   */
  private registerDefaultChecks(): void {
    this.register('database', this.checkDatabase.bind(this));
    this.register('whatsapp-service', this.checkWhatsAppService.bind(this));
    this.register('whatsapp-websocket', this.checkWhatsAppWebSocket.bind(this));
    this.register('memory', this.checkMemory.bind(this));
    this.register('disk', this.checkDisk.bind(this));
  }

  /**
   * Register a custom health check
   */
  register(name: string, check: () => Promise<HealthCheck>): void {
    this.checks.set(name, check);
  }

  /**
   * Run all health checks
   */
  async checkAll(): Promise<HealthReport> {
    const checks: HealthCheck[] = [];
    const checkPromises: Promise<HealthCheck>[] = [];

    for (const [name, check] of this.checks.entries()) {
      checkPromises.push(
        check().catch(error => ({
          name,
          status: 'unhealthy' as HealthStatus,
          message: error instanceof Error ? error.message : String(error),
        })),
      );
    }

    const results = await Promise.all(checkPromises);
    checks.push(...results);

    // Determine overall status
    const status = this.determineOverallStatus(checks);

    return {
      status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      checks,
      version: process.env.npm_package_version,
    };
  }

  /**
   * Run liveness check (is the service alive?)
   */
  async checkLiveness(): Promise<HealthReport> {
    // Liveness only checks if the process is running
    return {
      status: 'healthy',
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      checks: [
        {
          name: 'process',
          status: 'healthy',
          message: 'Process is running',
        },
      ],
    };
  }

  /**
   * Run readiness check (is the service ready to accept traffic?)
   */
  async checkReadiness(): Promise<HealthReport> {
    // Readiness checks critical dependencies
    const criticalChecks = ['database', 'whatsapp-service'];
    const checks: HealthCheck[] = [];

    for (const name of criticalChecks) {
      const check = this.checks.get(name);
      if (check) {
        try {
          checks.push(await check());
        } catch (error) {
          checks.push({
            name,
            status: 'unhealthy',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const status = this.determineOverallStatus(checks);

    return {
      status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      checks,
    };
  }

  /**
   * Determine overall health status from individual checks
   */
  private determineOverallStatus(checks: HealthCheck[]): HealthStatus {
    if (checks.some(c => c.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (checks.some(c => c.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  // ──────────────────────────────────────────────────────────────────────
  // Individual Health Checks
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Check database connectivity
   */
  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      await prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;

      return {
        name: 'database',
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        message: 'Database connection successful',
        latencyMs,
        lastCheck: new Date(),
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'unhealthy',
        message:
          error instanceof Error ? error.message : 'Database connection failed',
        latencyMs: Date.now() - start,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check WhatsApp service connectivity
   */
  private async checkWhatsAppService(): Promise<HealthCheck> {
    const start = Date.now();

    try {
      const health = await whatsappService.health();
      const latencyMs = Date.now() - start;

      return {
        name: 'whatsapp-service',
        status: health.status === 'ok' ? 'healthy' : 'degraded',
        message: 'WhatsApp service is reachable',
        latencyMs,
        lastCheck: new Date(),
        metadata: health,
      };
    } catch (error) {
      return {
        name: 'whatsapp-service',
        status: 'unhealthy',
        message:
          error instanceof Error
            ? error.message
            : 'WhatsApp service unreachable',
        latencyMs: Date.now() - start,
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check WhatsApp WebSocket connection
   */
  private async checkWhatsAppWebSocket(): Promise<HealthCheck> {
    try {
      const wsService = getWhatsAppWebSocketService();
      const status = wsService.getStatus();

      return {
        name: 'whatsapp-websocket',
        status: status.connected ? 'healthy' : 'degraded',
        message: status.connected
          ? 'WebSocket connected'
          : 'WebSocket disconnected',
        lastCheck: new Date(),
        metadata: status,
      };
    } catch (error) {
      return {
        name: 'whatsapp-websocket',
        status: 'unhealthy',
        message:
          error instanceof Error ? error.message : 'WebSocket check failed',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Check memory usage
   */
  private async checkMemory(): Promise<HealthCheck> {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    const heapTotalMB = usage.heapTotal / 1024 / 1024;
    const heapUsagePercent = (heapUsedMB / heapTotalMB) * 100;

    let status: HealthStatus = 'healthy';
    let message = `Memory usage: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB (${heapUsagePercent.toFixed(1)}%)`;

    if (heapUsagePercent > 90) {
      status = 'unhealthy';
      message += ' - CRITICAL: Memory usage above 90%';
    } else if (heapUsagePercent > 75) {
      status = 'degraded';
      message += ' - WARNING: Memory usage above 75%';
    }

    return {
      name: 'memory',
      status,
      message,
      lastCheck: new Date(),
      metadata: {
        heapUsedMB: heapUsedMB.toFixed(2),
        heapTotalMB: heapTotalMB.toFixed(2),
        heapUsagePercent: heapUsagePercent.toFixed(1),
        rss: (usage.rss / 1024 / 1024).toFixed(2) + 'MB',
        external: (usage.external / 1024 / 1024).toFixed(2) + 'MB',
      },
    };
  }

  /**
   * Check disk space (if available)
   */
  private async checkDisk(): Promise<HealthCheck> {
    // Note: Disk space checking requires platform-specific code
    // This is a placeholder that always returns healthy
    // In production, use a library like 'diskusage' or 'check-disk-space'

    return {
      name: 'disk',
      status: 'healthy',
      message: 'Disk space check not implemented',
      lastCheck: new Date(),
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

export const healthChecker = new HealthChecker();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format health report as JSON
 */
export function formatHealthReport(report: HealthReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format health report as plain text
 */
export function formatHealthReportText(report: HealthReport): string {
  const lines: string[] = [];

  lines.push(`Health Status: ${report.status.toUpperCase()}`);
  lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
  lines.push(`Uptime: ${formatUptime(report.uptime)}`);
  if (report.version) {
    lines.push(`Version: ${report.version}`);
  }
  lines.push('');
  lines.push('Component Health:');

  for (const check of report.checks) {
    const icon = getStatusIcon(check.status);
    lines.push(`  ${icon} ${check.name}: ${check.status}`);
    if (check.message) {
      lines.push(`     ${check.message}`);
    }
    if (check.latencyMs !== undefined) {
      lines.push(`     Latency: ${check.latencyMs}ms`);
    }
  }

  return lines.join('\n');
}

/**
 * Get status icon
 */
function getStatusIcon(status: HealthStatus): string {
  switch (status) {
    case 'healthy':
      return '✓';
    case 'degraded':
      return '⚠';
    case 'unhealthy':
      return '✗';
  }
}

/**
 * Format uptime duration
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Check if system is healthy
 */
export async function isHealthy(): Promise<boolean> {
  const report = await healthChecker.checkAll();
  return report.status === 'healthy';
}

/**
 * Check if system is ready
 */
export async function isReady(): Promise<boolean> {
  const report = await healthChecker.checkReadiness();
  return report.status === 'healthy';
}
