/**
 * WhatsApp Groups Router
 *
 * Type-safe oRPC router for WhatsApp group management.
 * Delegates business logic to WhatsAppGroupsService.
 * Groups are stored in PostgreSQL via Prisma.
 * Sync operations are proxied to Go microservice.
 */

import {
  groupFilterInput,
  groupIdInput,
  groupsListResponse,
  participantFilterInput,
  participantsListResponse,
  syncGroupsInput,
  syncGroupsResponse,
  whatsAppGroupWithParticipants,
  filterCountsInput,
  filterCountsResponse,
} from '@pharmabroker/schemas/whatsapp';

import { o, protectedProcedure } from '..';
import { whatsappGroupsService } from '../services/whatsapp-groups.service';

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
      return whatsappGroupsService.listGroups(userId, input);
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
      return whatsappGroupsService.getGroup(userId, input.groupId);
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
      return whatsappGroupsService.listParticipants(userId, input);
    }),

  counts: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/whatsapp/groups/counts',
        tags: ['WhatsApp Groups'],
        summary: 'Get filter counts',
        description:
          'Returns counts for each filter type (all, admin, archived, muted).',
      },
    })
    .input(filterCountsInput)
    .output(filterCountsResponse)
    .handler(async ({ input, context }) => {
      const userId = context.session!.user.id;
      return whatsappGroupsService.getFilterCounts(userId, input.sessionId);
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
      return whatsappGroupsService.syncGroups(userId, input.sessionId);
    }),
});
