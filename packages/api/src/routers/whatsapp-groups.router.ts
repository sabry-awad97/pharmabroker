/**
 * WhatsApp Groups Router
 *
 * Type-safe oRPC router for WhatsApp group management.
 * Groups are stored in PostgreSQL via Prisma.
 * Sync operations are proxied to Go microservice.
 */

import { ORPCError } from '@orpc/server';
import prisma from '@pharmabroker/db';
import { env } from '@pharmabroker/env/server';
import {
  groupFilterInput,
  groupIdInput,
  groupsListResponse,
  participantFilterInput,
  participantsListResponse,
  syncGroupsInput,
  syncGroupsResponse,
  whatsAppGroupWithParticipants,
} from '@pharmabroker/schemas/whatsapp';

import { o, protectedProcedure } from '..';

// ============================================================================
// WhatsApp Groups Router
// ============================================================================

export const whatsappGroupsRouter = o.router({
  // ─────────────────────────────────────────────────────────────────────────
  // Group Queries
  // ─────────────────────────────────────────────────────────────────────────

  list: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/groups',
        tags: ['WhatsApp Groups'],
        summary: 'List WhatsApp groups',
        description:
          'Returns a paginated list of WhatsApp groups with optional filtering by session, search term, and group type.',
      },
    })
    .input(groupFilterInput)
    .output(groupsListResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      const { sessionId, search, filter, limit, cursor } = input;

      // Build where clause
      const where: {
        session?: { userId: string };
        sessionId?: string;
        name?: { contains: string; mode: 'insensitive' };
        participants?: { some: { role: { in: ('admin' | 'superadmin')[] } } };
      } = {
        session: {
          userId,
        },
      };

      // Filter by session if provided
      if (sessionId) {
        where.sessionId = sessionId;
      }

      // Search by name
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
          // For now, we don't have archived status - this is a placeholder
          // In future, we could add an isArchived field
          break;
        case 'muted':
          // For now, we don't have muted status - this is a placeholder
          // In future, we could add an isMuted field
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
    }),

  get: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/groups/{groupId}',
        tags: ['WhatsApp Groups'],
        summary: 'Get a WhatsApp group',
        description:
          'Returns details of a specific WhatsApp group including its participants.',
      },
    })
    .input(groupIdInput)
    .output(whatsAppGroupWithParticipants)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      const group = await prisma.whatsAppGroup.findFirst({
        where: {
          id: input.groupId,
          session: {
            userId,
          },
        },
        include: {
          participants: {
            orderBy: [
              // Order by role priority: superadmin > admin > member
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
    }),

  participants: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/groups/{groupId}/participants',
        tags: ['WhatsApp Groups'],
        summary: 'List group participants',
        description:
          'Returns a paginated list of participants for a specific group.',
      },
    })
    .input(participantFilterInput)
    .output(participantsListResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      const { groupId, search, role, limit, cursor } = input;

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
      const where: {
        groupId: string;
        role?: 'member' | 'admin' | 'superadmin';
        OR?: Array<{
          displayName?: { contains: string; mode: 'insensitive' };
          jid?: { contains: string; mode: 'insensitive' };
        }>;
      } = {
        groupId,
      };

      // Filter by role
      if (role) {
        where.role = role;
      }

      // Search by name or JID
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
          // Order by role priority: superadmin > admin > member
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
    }),

  // ─────────────────────────────────────────────────────────────────────────
  // Sync Operations (Go Service)
  // ─────────────────────────────────────────────────────────────────────────

  sync: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/whatsapp/groups/sync',
        tags: ['WhatsApp Groups'],
        summary: 'Sync groups from WhatsApp',
        description:
          'Triggers a sync operation to fetch the latest group data from WhatsApp.',
      },
    })
    .input(syncGroupsInput)
    .output(syncGroupsResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;

      // Verify session belongs to user
      const session = await prisma.whatsAppSession.findFirst({
        where: {
          id: input.sessionId,
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
          `${baseUrl}/api/sessions/${input.sessionId}/groups/sync`,
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
    }),
});
