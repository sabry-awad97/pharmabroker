/**
 * History Sync Service Tests
 *
 * Unit tests for history sync decision logic and orchestration.
 */

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { historySyncService } from './history-sync.service';

// Mock Prisma
vi.mock('@pharmabroker/db', () => ({
  default: {
    whatsAppSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock event publisher
vi.mock('../routers/whatsapp.router', () => ({
  whatsappEventPublisher: {
    publish: vi.fn(),
  },
}));

// Mock metrics
vi.mock('@pharmabroker/metrics', () => ({
  recordHistorySync: vi.fn(),
}));

import prisma from '@pharmabroker/db';
import { whatsappEventPublisher } from '../routers/whatsapp.router';
import { recordHistorySync } from '@pharmabroker/metrics';

describe('HistorySyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('determineSyncStrategy', () => {
    it('should return "full_history" for first connection with history enabled', () => {
      const session = {
        id: 'test-session-id',
        enableHistorySync: true,
        firstConnectedAt: null,
        lastDisconnectedAt: null,
      };

      const strategy = historySyncService.determineSyncStrategy(session);

      expect(strategy).toBe('full_history');
    });

    it('should return "skip" for first connection with history disabled', () => {
      const session = {
        id: 'test-session-id',
        enableHistorySync: false,
        firstConnectedAt: null,
        lastDisconnectedAt: null,
      };

      const strategy = historySyncService.determineSyncStrategy(session);

      expect(strategy).toBe('skip');
    });

    it('should return "incremental" for reconnection regardless of history setting', () => {
      const session = {
        id: 'test-session-id',
        enableHistorySync: false, // Even with false
        firstConnectedAt: new Date('2024-01-01'),
        lastDisconnectedAt: new Date('2024-01-02'),
      };

      const strategy = historySyncService.determineSyncStrategy(session);

      expect(strategy).toBe('incremental');
    });

    it('should return "skip" for already connected session', () => {
      const session = {
        id: 'test-session-id',
        enableHistorySync: true,
        firstConnectedAt: new Date('2024-01-01'),
        lastDisconnectedAt: null, // No disconnection
      };

      const strategy = historySyncService.determineSyncStrategy(session);

      expect(strategy).toBe('skip');
    });
  });

  describe('updateConnectionTimestamps', () => {
    it('should update lastConnectedAt and firstConnectedAt on first connection', async () => {
      const sessionId = 'test-session-id';
      const mockSession = { firstConnectedAt: null };

      (prisma.whatsAppSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.updateConnectionTimestamps(
        sessionId,
        'connected',
      );

      expect(prisma.whatsAppSession.findUnique).toHaveBeenCalledWith({
        where: { id: sessionId },
        select: { firstConnectedAt: true },
      });

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          lastConnectedAt: expect.any(Date),
          firstConnectedAt: expect.any(Date),
        }),
      });
    });

    it('should only update lastConnectedAt on subsequent connections', async () => {
      const sessionId = 'test-session-id';
      const mockSession = { firstConnectedAt: new Date('2024-01-01') };

      (prisma.whatsAppSession.findUnique as any).mockResolvedValue(mockSession);
      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.updateConnectionTimestamps(
        sessionId,
        'connected',
      );

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          lastConnectedAt: expect.any(Date),
        },
      });
    });

    it('should update lastDisconnectedAt on disconnection', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.updateConnectionTimestamps(
        sessionId,
        'disconnected',
      );

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          lastDisconnectedAt: expect.any(Date),
        },
      });
    });
  });

  describe('updateSyncStatus', () => {
    it('should update sync status with all provided data', async () => {
      const sessionId = 'test-session-id';
      const startedAt = new Date();

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.updateSyncStatus(sessionId, 'in_progress', {
        progress: 100,
        total: 1000,
        startedAt,
      });

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          historySyncStatus: 'in_progress',
          historySyncProgress: 100,
          historySyncTotal: 1000,
          historySyncStartedAt: startedAt,
        },
      });
    });

    it('should update only status when no additional data provided', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.updateSyncStatus(sessionId, 'completed');

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          historySyncStatus: 'completed',
        },
      });
    });
  });

  describe('triggerFullHistorySync', () => {
    it('should update status to in_progress and publish sync.started event', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.triggerFullHistorySync(sessionId);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'in_progress',
          historySyncProgress: 0,
          historySyncStartedAt: expect.any(Date),
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.started',
          session_id: sessionId,
        }),
      );
    });
  });

  describe('triggerIncrementalSync', () => {
    it('should update status and publish sync.started event with since timestamp', async () => {
      const sessionId = 'test-session-id';
      const since = new Date('2024-01-01');

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.triggerIncrementalSync(sessionId, since);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'in_progress',
          historySyncProgress: 0,
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.started',
          session_id: sessionId,
        }),
      );
    });
  });

  describe('skipHistorySync', () => {
    it('should update status to skipped and publish sync.skipped event', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.skipHistorySync(sessionId);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'skipped',
          historySyncCompletedAt: expect.any(Date),
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.skipped',
          session_id: sessionId,
        }),
      );
    });
  });

  describe('completeSync', () => {
    it('should update status to completed with stats and publish event', async () => {
      const sessionId = 'test-session-id';
      const stats = { stored: 1000, dropped: 50 };

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.completeSync(sessionId, stats);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'completed',
          historySyncProgress: 1000,
          historySyncTotal: 1050,
          historySyncCompletedAt: expect.any(Date),
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.completed',
          session_id: sessionId,
          data: {
            messagesProcessed: 1000,
            messagesDropped: 50,
          },
        }),
      );
    });
  });

  describe('failSync', () => {
    it('should update status to failed and publish sync.failed event', async () => {
      const sessionId = 'test-session-id';
      const error = 'Connection timeout';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.failSync(sessionId, error);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'failed',
          historySyncCompletedAt: expect.any(Date),
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.failed',
          session_id: sessionId,
          data: { error },
        }),
      );
    });
  });

  describe('cancelSync', () => {
    it('should update status to cancelled and publish sync.cancelled event', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.cancelSync(sessionId);

      expect(prisma.whatsAppSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: expect.objectContaining({
          historySyncStatus: 'cancelled',
          historySyncCompletedAt: expect.any(Date),
        }),
      });

      expect(whatsappEventPublisher.publish).toHaveBeenCalledWith(
        'whatsapp-event',
        expect.objectContaining({
          type: 'sync.cancelled',
          session_id: sessionId,
        }),
      );
    });
  });

  describe('Metrics Tracking', () => {
    it('should record metrics for successful full history sync', async () => {
      const sessionId = 'test-session-id';
      const stats = { stored: 1000, dropped: 50 };

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Start sync
      await historySyncService.triggerFullHistorySync(sessionId);

      // Complete sync
      await historySyncService.completeSync(sessionId, stats);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'full_history',
        'success',
        expect.any(Number), // duration
        1000, // messages processed
      );
    });

    it('should record metrics for successful incremental sync', async () => {
      const sessionId = 'test-session-id';
      const since = new Date('2024-01-01');
      const stats = { stored: 100, dropped: 5 };

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Start sync
      await historySyncService.triggerIncrementalSync(sessionId, since);

      // Complete sync
      await historySyncService.completeSync(sessionId, stats);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'incremental',
        'success',
        expect.any(Number), // duration
        100, // messages processed
      );
    });

    it('should record metrics for failed sync', async () => {
      const sessionId = 'test-session-id';
      const error = 'Connection timeout';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Start sync
      await historySyncService.triggerFullHistorySync(sessionId);

      // Fail sync
      await historySyncService.failSync(sessionId, error);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'full_history',
        'failure',
        expect.any(Number), // duration
        0, // no messages processed
      );
    });

    it('should record metrics for cancelled sync', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Start sync
      await historySyncService.triggerFullHistorySync(sessionId);

      // Cancel sync
      await historySyncService.cancelSync(sessionId);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'full_history',
        'cancelled',
        expect.any(Number), // duration
        0, // no messages processed
      );
    });

    it('should record metrics for skipped sync', async () => {
      const sessionId = 'test-session-id';

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      await historySyncService.skipHistorySync(sessionId);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'skip',
        'skipped',
        0, // no duration for skipped
        0, // no messages processed
      );
    });

    it('should track sync duration accurately', async () => {
      const sessionId = 'test-session-id';
      const stats = { stored: 500, dropped: 10 };

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Start sync
      await historySyncService.triggerFullHistorySync(sessionId);

      // Wait a bit to simulate sync duration
      await new Promise(resolve => setTimeout(resolve, 100));

      // Complete sync
      await historySyncService.completeSync(sessionId, stats);

      expect(recordHistorySync).toHaveBeenCalledWith(
        sessionId,
        'full_history',
        'success',
        expect.any(Number),
        500,
      );

      // Verify duration is at least 100ms
      const callArgs = (recordHistorySync as any).mock.calls[0];
      const duration = callArgs[3];
      expect(duration).toBeGreaterThanOrEqual(100);
    });

    it('should not record metrics if sync was never started', async () => {
      const sessionId = 'test-session-id';
      const stats = { stored: 100, dropped: 5 };

      (prisma.whatsAppSession.update as any).mockResolvedValue({});

      // Complete sync without starting it first
      await historySyncService.completeSync(sessionId, stats);

      // Should not call recordHistorySync since no metadata exists
      expect(recordHistorySync).not.toHaveBeenCalled();
    });
  });
});
