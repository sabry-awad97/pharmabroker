/**
 * WhatsApp Groups Service
 *
 * Service layer for WhatsApp group management.
 * Handles business logic, authorization, and Go service communication.
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
   */
  async syncGroups(
    userId: string,
    sessionId: string,
  ): Promise<SyncGroupsResponse> {
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
        data?: { synced: number; errors: string[] };
        error?: { code: string; message: string };
      };

      if (!json.success) {
        throw new ORPCError(json.error?.code || 'SYNC_FAILED', {
          message: json.error?.message || 'Failed to sync groups',
        });
      }

      return {
        synced: json.data?.synced ?? 0,
        errors: json.data?.errors ?? [],
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
}

/** Singleton WhatsApp Groups service */
export const whatsappGroupsService = new WhatsAppGroupsService();

export { WhatsAppGroupsService };
