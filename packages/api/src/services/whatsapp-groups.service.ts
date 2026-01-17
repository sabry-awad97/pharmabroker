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
  FilterCountsResponse,
} from '@pharmabroker/schemas/whatsapp';
import { escapeSqlWildcards } from '../utils/prisma';
import { logger } from '@pharmabroker/logger';
import {
  whatsappGroupsSynced,
  whatsappSyncDuration,
  recordError,
} from '@pharmabroker/metrics';

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

/**
 * Sanitize string for Prisma WASM query compiler
 * Removes problematic Unicode characters that cause "Out of bounds memory access" errors
 * This is a workaround for a known Prisma bug with the WASM-based query engine
 */
function sanitizeForPrisma(str: string | null | undefined): string | null {
  if (str == null) return null;
  // Normalize Unicode and remove zero-width characters that can cause issues
  return (
    str
      .normalize('NFC')
      // Remove zero-width characters
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove other problematic invisible characters
      .replace(/[\u2060-\u206F]/g, '')
      // Trim whitespace
      .trim()
  );
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
  private log = logger.child('whatsapp-groups');

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
        contains: escapeSqlWildcards(search),
        mode: 'insensitive',
      };
    }

    // Apply filter type
    switch (filter) {
      case 'admin':
        // Groups where the current user (session owner) is admin or superadmin
        // Need to match session JID against participant JIDs
        const sessionsQuery: { userId: string; id?: string } = { userId };
        if (sessionId) {
          sessionsQuery.id = sessionId;
        }
        const sessions = await prisma.whatsAppSession.findMany({
          where: sessionsQuery,
          select: { id: true, jid: true },
        });

        // Build OR conditions for each session's JID
        const adminConditions: Array<{
          sessionId: string;
          participants: {
            some: { jid: { startsWith: string }; role: { in: string[] } };
          };
        }> = [];

        for (const session of sessions) {
          if (!session.jid) continue;
          // Normalize JID (remove device suffix)
          const jidParts = session.jid.split(':');
          const baseJid = jidParts[0] ?? session.jid;

          adminConditions.push({
            sessionId: session.id,
            participants: {
              some: {
                jid: { startsWith: baseJid },
                role: { in: ['admin', 'superadmin'] },
              },
            },
          });
        }

        // If no sessions have JIDs, return empty result
        if (adminConditions.length === 0) {
          return { groups: [], nextCursor: undefined };
        }

        // Add OR conditions to where clause
        (where as any).OR = adminConditions;
        break;
      case 'archived':
        // Groups that are archived
        (where as any).isArchived = true;
        break;
      case 'muted':
        // Groups that are muted
        (where as any).isMuted = true;
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
      const escapedSearch = escapeSqlWildcards(search);
      where.OR = [
        { displayName: { contains: escapedSearch, mode: 'insensitive' } },
        { jid: { contains: escapedSearch, mode: 'insensitive' } },
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
   * Get filter counts for groups
   * Returns counts for all, admin, archived, and muted filters
   * Only counts groups belonging to sessions owned by the user
   */
  async getFilterCounts(
    userId: string,
    sessionId?: string,
  ): Promise<FilterCountsResponse> {
    // Build base where clause for user's sessions
    const baseWhere: { session: { userId: string }; sessionId?: string } = {
      session: { userId },
    };

    // Filter by specific session if provided
    if (sessionId) {
      baseWhere.sessionId = sessionId;
    }

    // Get all groups count
    const allCount = await prisma.whatsAppGroup.count({
      where: baseWhere,
    });

    // Get archived groups count
    const archivedCount = await prisma.whatsAppGroup.count({
      where: {
        ...baseWhere,
        isArchived: true,
      },
    });

    // Get muted groups count
    const mutedCount = await prisma.whatsAppGroup.count({
      where: {
        ...baseWhere,
        isMuted: true,
      },
    });

    // Get admin groups count
    // Need to find groups where the session's JID matches a participant with admin/superadmin role
    let adminCount = 0;

    // Get sessions with their JIDs
    const sessionsQuery: { userId: string; id?: string } = { userId };
    if (sessionId) {
      sessionsQuery.id = sessionId;
    }

    const sessions = await prisma.whatsAppSession.findMany({
      where: sessionsQuery,
      select: { id: true, jid: true },
    });

    // For each session with a JID, count groups where user is admin
    for (const session of sessions) {
      if (!session.jid) continue;

      // Normalize JID for matching (remove device suffix if present)
      // JID format: "1234567890:123@s.whatsapp.net" or "1234567890@s.whatsapp.net"
      const jidParts = session.jid.split(':');
      const baseJid = jidParts[0] ?? session.jid; // Get the phone number part

      const sessionAdminCount = await prisma.whatsAppGroup.count({
        where: {
          sessionId: session.id,
          participants: {
            some: {
              jid: {
                startsWith: baseJid,
              },
              role: {
                in: ['admin', 'superadmin'],
              },
            },
          },
        },
      });

      adminCount += sessionAdminCount;
    }

    return {
      all: allCount,
      admin: adminCount,
      archived: archivedCount,
      muted: mutedCount,
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
        this.log.warn('Performance warning: sync took too long', {
          duration,
          groupCount: groups.length,
          method: 'syncGroups',
        });
      }

      // Record metrics
      whatsappSyncDuration.observe(
        { session_id: sessionId, sync_type: 'groups' },
        duration / 1000,
      );
      whatsappGroupsSynced.inc({ session_id: sessionId }, totalSynced);

      this.log.info('Groups synced successfully', {
        sessionId,
        userId,
        synced: totalSynced,
        duration,
      });

      return {
        synced: totalSynced,
        errors,
      };
    } catch (error) {
      recordError('group_sync', 'high');
      this.log.error('Failed to sync groups', {
        sessionId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

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

    // Sanitize string fields to prevent Prisma WASM query compiler issues
    const sanitizedName = sanitizeForPrisma(group.name) ?? 'Unnamed Group';
    const sanitizedDescription = sanitizeForPrisma(group.description);

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
        name: sanitizedName,
        description: sanitizedDescription,
        avatarUrl: group.avatar_url ?? null,
        isAnnounce: group.is_announce ?? false,
        isLocked: group.is_locked ?? false,
        isEphemeral: group.is_ephemeral ?? false,
        ephemeralTime: group.ephemeral_time ?? null,
        ownerJid: group.owner_jid ?? null,
        // Filter support fields
        isArchived: group.is_archived ?? false,
        isMuted: group.is_muted ?? false,
        mutedUntil: group.muted_until ? new Date(group.muted_until) : null,
        // Metadata
        memberCount: group.member_count ?? 0,
        groupCreatedAt: group.group_created_at
          ? new Date(group.group_created_at)
          : null,
        lastSyncAt: now,
        sessionId,
      },
      update: {
        name: sanitizedName,
        description: sanitizedDescription,
        avatarUrl: group.avatar_url ?? null,
        isAnnounce: group.is_announce ?? false,
        isLocked: group.is_locked ?? false,
        isEphemeral: group.is_ephemeral ?? false,
        ephemeralTime: group.ephemeral_time ?? null,
        ownerJid: group.owner_jid ?? null,
        // Filter support fields - preserve existing values if not provided
        // This allows the API to manage these fields independently
        ...(group.is_archived !== undefined && {
          isArchived: group.is_archived,
        }),
        ...(group.is_muted !== undefined && { isMuted: group.is_muted }),
        ...(group.muted_until !== undefined && {
          mutedUntil: group.muted_until ? new Date(group.muted_until) : null,
        }),
        // Metadata
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
            displayName: sanitizeForPrisma(p.display_name),
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
              displayName: sanitizeForPrisma(p.display_name),
              avatarUrl: p.avatar_url ?? null,
              addedBy: p.added_by ?? null,
              updatedAt: now,
            },
          });
        }
      });
    }
  }

  /**
   * Internal sync groups method - bypasses user authentication
   * Used by WhatsAppWebSocketService for auto-sync on session connection
   * @param sessionId The session ID to sync groups for
   * @returns Sync result with count and errors
   */
  async syncGroupsInternal(sessionId: string): Promise<SyncGroupsResponse> {
    const startTime = Date.now();

    // Verify session exists (no user check)
    const session = await prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
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
        this.log.warn('Performance warning: sync took too long', {
          duration,
          groupCount: groups.length,
          method: 'syncGroupsInternal',
        });
      }

      // Record metrics
      whatsappSyncDuration.observe(
        { session_id: sessionId, sync_type: 'groups' },
        duration / 1000,
      );
      whatsappGroupsSynced.inc({ session_id: sessionId }, totalSynced);

      this.log.info('Groups synced successfully (internal)', {
        sessionId,
        synced: totalSynced,
        duration,
      });

      return {
        synced: totalSynced,
        errors,
      };
    } catch (error) {
      recordError('group_sync_internal', 'high');
      this.log.error('Failed to sync groups (internal)', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ORPCError) {
        throw error;
      }
      throw new ORPCError('SYNC_FAILED', {
        message:
          error instanceof Error ? error.message : 'Failed to sync groups',
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
  // Filter support fields
  is_archived?: boolean;
  is_muted?: boolean;
  muted_until?: string | null;
  // Metadata
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
