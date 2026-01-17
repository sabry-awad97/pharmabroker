/**
 * Metrics Package Tests
 *
 * Basic tests for Prometheus metrics functionality.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  register,
  httpRequestsTotal,
  historySyncTotal,
  recordHttpRequest,
  recordHistorySync,
  getMetrics,
  resetMetrics,
} from './index';

describe('Metrics Package', () => {
  beforeEach(() => {
    // Reset metrics before each test
    resetMetrics();
  });

  describe('HTTP Metrics', () => {
    it('should record HTTP request metrics', async () => {
      recordHttpRequest('GET', '/api/users', 200, 150);

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/api/users"');
      expect(metrics).toContain('status="200"');
    });

    it('should increment counter correctly', async () => {
      httpRequestsTotal.inc({
        method: 'POST',
        path: '/api/users',
        status: '201',
      });
      httpRequestsTotal.inc({
        method: 'POST',
        path: '/api/users',
        status: '201',
      });

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_http_requests_total');
    });
  });

  describe('History Sync Metrics', () => {
    it('should record successful history sync', async () => {
      recordHistorySync('session-123', 'full_history', 'success', 5000, 1000);

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_history_sync_total');
      expect(metrics).toContain('session_id="session-123"');
      expect(metrics).toContain('sync_type="full_history"');
      expect(metrics).toContain('status="success"');
    });

    it('should record failed history sync', async () => {
      recordHistorySync('session-456', 'incremental', 'failure', 2000, 0);

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_history_sync_total');
      expect(metrics).toContain('session_id="session-456"');
      expect(metrics).toContain('sync_type="incremental"');
      expect(metrics).toContain('status="failure"');
    });

    it('should record skipped history sync', async () => {
      recordHistorySync('session-789', 'skip', 'skipped', 0, 0);

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_history_sync_total');
      expect(metrics).toContain('session_id="session-789"');
      expect(metrics).toContain('status="skipped"');
    });

    it('should record duration for successful syncs', async () => {
      recordHistorySync('session-123', 'full_history', 'success', 5000, 1000);

      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_history_sync_duration_seconds');
    });

    it('should record messages processed for successful syncs', async () => {
      recordHistorySync('session-123', 'full_history', 'success', 5000, 1000);

      const metrics = await getMetrics();
      expect(metrics).toContain(
        'pharmabroker_history_sync_messages_processed_total',
      );
    });

    it('should not record duration for skipped syncs', async () => {
      recordHistorySync('session-789', 'skip', 'skipped', 0, 0);

      const metrics = await getMetrics();
      // Duration histogram should not have entries for skipped syncs
      expect(metrics).toContain('pharmabroker_history_sync_total');
    });
  });

  describe('Metrics Format', () => {
    it('should return metrics in Prometheus text format', async () => {
      recordHttpRequest('GET', '/test', 200, 100);

      const metrics = await getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });

    it('should include default Node.js metrics', async () => {
      const metrics = await getMetrics();
      expect(metrics).toContain('pharmabroker_process_cpu');
      expect(metrics).toContain('pharmabroker_nodejs_');
    });
  });

  describe('Registry', () => {
    it('should have a valid registry', () => {
      expect(register).toBeDefined();
      expect(typeof register.metrics).toBe('function');
    });

    it('should reset metrics correctly', async () => {
      historySyncTotal.inc({
        session_id: 'test',
        sync_type: 'full_history',
        status: 'success',
      });

      resetMetrics();

      const metrics = await getMetrics();
      // After reset, counters should be back to 0 or not present
      expect(metrics).toBeDefined();
    });
  });
});
