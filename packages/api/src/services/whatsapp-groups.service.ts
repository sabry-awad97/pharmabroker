/**
 * WhatsApp Groups Service
 *
 * Service layer for WhatsApp group management.
 * Handles business logic, authorization, and Go service communication.
 *
 * Performance Optimizations:
 * - Batch processing: Groups processed in batches of 50, participants in batches of 500
 * - Parallel execution: Up to 5 groups processed concurrently
 * - Transaction batching: Database operations grouped for efficiency
 * - Performance monitoring: Warnings logged if sync exceeds 30 seconds
 */

import { ORPCError } from '@orpc/server';
import prisma from '@pharmabroker/db';
import { env } from '@pharmabroker/env/server';
import type {
  GroupFilterInput,
  GroupsListResponse,
  WhatsAppGroupWithParticipants,
  ParticipantFilterInput,
  ParticipantsListResponse,
  SyncGroupsResponse,
} from '@pharmabroker/schemas/whatsapp';

// ============================================================================
// Sync Configuration
// ============================================================================

const SYNC_CONFIG = {
  /** Maximum groups to process in a single batch */
  GROUP_BATCH_SIZE: 50,
  /** Maximum participants to upsert in a single transaction */
  PARTICIPANT_BATCH_SIZE: 500,
  /** Maximum groups to process concurrently */
  PARALLEL_GROUPS: 5,
  /** Log warning if sync exceeds this duration (ms) */
  PERFORMANCE_WARN_MS: 30000,
} as const;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Split an array into chunks of specified size
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  if (size <= 0) return [array];
  if (array.length === 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// ============================================================================
// Types
// ============================================================================

type GroupWhereClause = {
  session?: { userId: string };
  sessionId?: string;
  name?: { contains: string; mode: 'insensitive' };
  participants?: { some: { role: { in: ('admin' | 'superadmin')[] } } };
};

type ParticipantWhereClause = {
  groupId: string;
  role?: 'member' | 'admin' | 'superadmin';
  OR?: Array<{
    displayName?: { contains: string; mode: 'insensitive' };
    jid?: { contains: string; mode: 'insensitive' };
  }>;
};

// ============================================================================
// WhatsApp Groups Service
// ============================================================================

class WhatsAppGroupsService {
  /**
   * List groups for a user with filtering and pagination
   * Only returns groups belonging to sessions owned by the user
   */
  async listGroups(
    userId: string,
    filters: GroupFilterInput,
  ): Promise<GroupsListResponse> {
    const { sessionId, search, filter, limit = 50, cursor } = filters;

    // Build where clause - always filter by user's sessions
    const where: GroupWhereClause = {
      session: {
        userId,
      },
    };

    // Filter by specific session if provided
    if (sessionId) {
      where.sessionId = sessionId;
    }

    // Search by name (case-insensitive)
    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Apply filter type
    switch (filter) {
      case 'admin':
        // Groups where user is admin or superadmin
        where.participants = {
          some: {
            role: { in: ['admin', 'superadmin'] },
          },
        };
        break;
      case 'archived':
      case 'muted':
        // Placeholder for future implementation
        break;
      // 'all' - no additional filter
    }

    // Cursor-based pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const groups = await prisma.whatsAppGroup.findMany({
      where,
      take: limit + 1, // Fetch one extra to determine if there's a next page
      cursor: cursorObj,
      skip: cursor ? 1 : 0, // Skip the cursor item itself
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    // Determine if there's a next page
    const hasNextPage = groups.length > limit;
    const resultGroups = hasNextPage ? groups.slice(0, limit) : groups;
    const nextCursor = hasNextPage
      ? resultGroups[resultGroups.length - 1]?.id
      : undefined;

    return {
      groups: resultGroups,
      nextCursor,
    };
  }

  /**
   * Get a single group with participants
   * Returns GROUP_NOT_FOUND if group doesn't exist or belongs to another user
   */
  async getGroup(
    userId: string,
    groupId: string,
  ): Promise<WhatsAppGroupWithParticipants> {
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        id: groupId,
        session: {
          userId,
        },
      },
      include: {
        participants: {
          orderBy: [
            // Order by role priority: superadmin > admin > member
            // Alphabetically: admin < member < superadmin
            { role: 'asc' },
            { displayName: 'asc' },
          ],
        },
      },
    });

    if (!group) {
      throw new ORPCError('GROUP_NOT_FOUND', {
        message: 'Group not found',
      });
    }

    return group;
  }

  /**
   * List participants for a group with filtering and pagination
   * Verifies group belongs to user before returning participants
   */
  async listParticipants(
    userId: string,
    filters: ParticipantFilterInput,
  ): Promise<ParticipantsListResponse> {
    const { groupId, search, role, limit = 50, cursor } = filters;

    // Verify group belongs to user
    const group = await prisma.whatsAppGroup.findFirst({
      where: {
        id: groupId,
        session: {
          userId,
        },
      },
      select: { id: true },
    });

    if (!group) {
      throw new ORPCError('GROUP_NOT_FOUND', {
        message: 'Group not found',
      });
    }

    // Build where clause
    const where: ParticipantWhereClause = {
      groupId,
    };

    // Filter by role
    if (role) {
      where.role = role;
    }

    // Search by name or JID (case-insensitive)
    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { jid: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Cursor-based pagination
    const cursorObj = cursor ? { id: cursor } : undefined;

    const participants = await prisma.whatsAppGroupParticipant.findMany({
      where,
      take: limit + 1,
      cursor: cursorObj,
      skip: cursor ? 1 : 0,
      orderBy: [
        // Order by role priority
        { role: 'asc' },
        { displayName: 'asc' },
      ],
    });

    // Determine if there's a next page
    const hasNextPage = participants.length > limit;
    const resultParticipants = hasNextPage
      ? participants.slice(0, limit)
      : participants;
    const nextCursor = hasNextPage
      ? resultParticipants[resultParticipants.length - 1]?.id
      : undefined;

    return {
      participants: resultParticipants,
      nextCursor,
    };
  }

  /**
   * Sync groups from WhatsApp via Go service
   * Verifies session belongs to user and is connected before syncing
   * Uses batch processing and parallel execution for performance
   */
  async syncGroups(
    userId: string,
    sessionId: string,
  ): Promise<SyncGroupsResponse> {
    const startTime = Date.now();

    // Verify session belongs to user
    const session = await prisma.whatsAppSession.findFirst({
      where: {
        id: sessionId,
        userId,
      },
    });

    if (!session) {
      throw new ORPCError('SESSION_NOT_FOUND', {
        message: 'Session not found',
      });
    }

    // Check if session is connected
    if (session.status !== 'connected') {
      throw new ORPCError('SESSION_NOT_CONNECTED', {
        message: 'Session must be connected to sync groups',
      });
    }

    try {
      // Call Go service to sync groups
      const baseUrl = env.WHATSAPP_SERVICE_URL.replace(/\/$/, '');
      const response = await fetch(
        `${baseUrl}/api/sessions/${sessionId}/groups/sync`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const json = (await response.json()) as {
        success: boolean;
        data?: {
          groups: GoGroupData[];
          synced: number;
          errors: string[];
        };
        error?: { code: string; message: string };
      };

      if (!json.success) {
        throw new ORPCError(json.error?.code || 'SYNC_FAILED', {
          message: json.error?.message || 'Failed to sync groups',
        });
      }

      const groups = json.data?.groups ?? [];
      const errors: string[] = [...(json.data?.errors ?? [])];

      // Process groups in batches with parallel execution
      const groupBatches = chunkArray(groups, SYNC_CONFIG.GROUP_BATCH_SIZE);
      let totalSynced = 0;

      for (const batch of groupBatches) {
        const result = await this.syncGroupsBatch(sessionId, batch);
        totalSynced += result.synced;
        errors.push(...result.errors);
      }

      // Log performance warning if sync took too long
      const duration = Date.now() - startTime;
      if (duration > SYNC_CONFIG.PERFORMANCE_WARN_MS) {
        console.warn(
          `[WhatsApp Groups Sync] Performance warning: sync took ${duration}ms for ${groups.length} groups`,
        );
      }

      return {
        synced: totalSynced,
        errors,
      };
    } catch (error) {
      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError('SYNC_FAILED', {
        message:
          error instanceof Error ? error.message : 'Failed to sync groups',
      });
    }
  }

  /**
   * Process a batch of groups in parallel
   */
  private async syncGroupsBatch(
    sessionId: string,
    groups: GoGroupData[],
  ): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    // Process groups in parallel chunks
    const parallelChunks = chunkArray(groups, SYNC_CONFIG.PARALLEL_GROUPS);

    for (const chunk of parallelChunks) {
      const results = await Promise.allSettled(
        chunk.map(group => this.upsertGroupOptimized(sessionId, group)),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const group = chunk[i];

        if (result?.status === 'fulfilled') {
          synced++;
        } else if (result?.status === 'rejected') {
          const errorMsg =
            result.reason instanceof Error
              ? result.reason.message
              : 'Unknown error';
          errors.push(
            `Failed to save group ${group?.name ?? 'unknown'}: ${errorMsg}`,
          );
        }
      }
    }

    return { synced, errors };
  }

  /**
   * Upsert a single group with optimized participant batching
   */
  private async upsertGroupOptimized(
    sessionId: string,
    group: GoGroupData,
  ): Promise<void> {
    const now = new Date();

    // Upsert the group
    const dbGroup = await prisma.whatsAppGroup.upsert({
      where: {
        sessionId_jid: {
          sessionId,
          jid: group.jid,
        },
      },
      create: {
        jid: group.jid,
        name: group.name,
        description: group.description ?? null,
        avatarUrl: group.avatar_url ?? null,
        isAnnounce: group.is_announce ?? false,
        isLocked: group.is_locked ?? false,
        isEphemeral: group.is_ephemeral ?? false,
        ephemeralTime: group.ephemeral_time ?? null,
        ownerJid: group.owner_jid ?? null,
        memberCount: group.member_count ?? 0,
        groupCreatedAt: group.group_created_at
          ? new Date(group.group_created_at)
          : null,
        lastSyncAt: now,
        sessionId,
      },
      update: {
        name: group.name,
        description: group.description ?? null,
        avatarUrl: group.avatar_url ?? null,
        isAnnounce: group.is_announce ?? false,
        isLocked: group.is_locked ?? false,
        isEphemeral: group.is_ephemeral ?? false,
        ephemeralTime: group.ephemeral_time ?? null,
        ownerJid: group.owner_jid ?? null,
        memberCount: group.member_count ?? 0,
        groupCreatedAt: group.group_created_at
          ? new Date(group.group_created_at)
          : null,
        lastSyncAt: now,
        updatedAt: now,
      },
      select: { id: true },
    });

    // Batch upsert participants
    const participants = group.participants ?? [];
    if (participants.length > 0) {
      await this.batchUpsertParticipants(dbGroup.id, participants);
    }

    // Remove stale participants
    const currentJids = participants.map(p => p.jid);
    if (currentJids.length > 0) {
      await prisma.whatsAppGroupParticipant.deleteMany({
        where: {
          groupId: dbGroup.id,
          jid: { notIn: currentJids },
        },
      });
    } else {
      // If no participants in sync data, remove all
      await prisma.whatsAppGroupParticipant.deleteMany({
        where: { groupId: dbGroup.id },
      });
    }
  }

  /**
   * Batch upsert participants using transactions
   */
  private async batchUpsertParticipants(
    groupId: string,
    participants: GoParticipantData[],
  ): Promise<void> {
    const batches = chunkArray(
      participants,
      SYNC_CONFIG.PARTICIPANT_BATCH_SIZE,
    );
    const now = new Date();

    for (const batch of batches) {
      await prisma.$transaction(async tx => {
        // First, try to create all new participants (skip duplicates)
        await tx.whatsAppGroupParticipant.createMany({
          data: batch.map(p => ({
            jid: p.jid,
            role: p.role ?? 'member',
            displayName: p.display_name ?? null,
            avatarUrl: p.avatar_url ?? null,
            addedBy: p.added_by ?? null,
            groupId,
          })),
          skipDuplicates: true,
        });

        // Then update existing participants
        for (const p of batch) {
          await tx.whatsAppGroupParticipant.updateMany({
            where: {
              groupId,
              jid: p.jid,
            },
            data: {
              role: p.role ?? 'member',
              displayName: p.display_name ?? null,
              avatarUrl: p.avatar_url ?? null,
              addedBy: p.added_by ?? null,
              updatedAt: now,
            },
          });
        }
      });
    }
  }
}

// ============================================================================
// Go Service Response Types
// ============================================================================

interface GoGroupData {
  id?: string;
  jid: string;
  name: string;
  description?: string | null;
  avatar_url?: string | null;
  is_announce?: boolean;
  is_locked?: boolean;
  is_ephemeral?: boolean;
  ephemeral_time?: number | null;
  owner_jid?: string | null;
  session_id?: string;
  member_count?: number;
  created_at?: string;
  updated_at?: string;
  group_created_at?: string | null;
  last_sync_at?: string | null;
  participants?: GoParticipantData[];
}

interface GoParticipantData {
  id?: string;
  jid: string;
  role?: 'member' | 'admin' | 'superadmin';
  display_name?: string | null;
  avatar_url?: string | null;
  group_id?: string;
  joined_at?: string;
  added_by?: string | null;
  updated_at?: string;
}

/** Singleton WhatsApp Groups service */
export const whatsappGroupsService = new WhatsAppGroupsService();

export { WhatsAppGroupsService };
