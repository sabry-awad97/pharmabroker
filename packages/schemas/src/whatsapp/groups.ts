/**
 * WhatsApp Groups Schemas
 *
 * Schemas for WhatsApp group management matching the database models.
 * Uses Zod for runtime validation and TypeScript type inference.
 */

import { z } from 'zod';
import { unbranded } from '../common';

// ============================================================================
// Enums
// ============================================================================

/** Participant role in a WhatsApp group */
export const participantRole = z.enum(['member', 'admin', 'superadmin']);

/** Filter options for groups list */
export const groupFilterType = z.enum(['all', 'admin', 'archived', 'muted']);

// ============================================================================
// Output Schemas (unbranded for validation of plain data from DB)
// ============================================================================

/** WhatsApp group participant entity */
export const whatsAppGroupParticipant = z.object({
  id: unbranded.uuid,
  jid: z.string(),
  role: participantRole,
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  groupId: unbranded.uuid,
  joinedAt: z.coerce.date(),
  addedBy: z.string().nullable(),
  updatedAt: z.coerce.date(),
});

/** WhatsApp group entity */
export const whatsAppGroup = z.object({
  id: unbranded.uuid,
  jid: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isAnnounce: z.boolean(),
  isLocked: z.boolean(),
  isEphemeral: z.boolean(),
  ephemeralTime: z.number().nullable(),
  ownerJid: z.string().nullable(),
  sessionId: unbranded.uuid,
  // Filter support fields
  isArchived: z.boolean(),
  isMuted: z.boolean(),
  mutedUntil: z.coerce.date().nullable(),
  // Metadata
  memberCount: z.number().int().min(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  groupCreatedAt: z.coerce.date().nullable(),
  lastSyncAt: z.coerce.date().nullable(),
});

/** WhatsApp group with participants */
export const whatsAppGroupWithParticipants = whatsAppGroup.extend({
  participants: z.array(whatsAppGroupParticipant),
});

/** Group list response */
export const groupList = z.array(whatsAppGroup);

// ============================================================================
// Input Schemas
// ============================================================================

/** Group filter input for list queries */
export const groupFilterInput = z.object({
  sessionId: z.string().uuid().optional(),
  search: z.string().optional(),
  filter: groupFilterType.optional().default('all'),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

/** Get single group input */
export const groupIdInput = z.object({
  groupId: z.string().uuid(),
});

/** Sync groups input */
export const syncGroupsInput = z.object({
  sessionId: z.string().uuid(),
});

/** Participant filter input */
export const participantFilterInput = z.object({
  groupId: z.string().uuid(),
  search: z.string().optional(),
  role: participantRole.optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().optional(),
});

/** Filter counts input */
export const filterCountsInput = z.object({
  sessionId: z.string().uuid().optional(),
});

// ============================================================================
// Response Schemas
// ============================================================================

/** Paginated groups response */
export const groupsListResponse = z.object({
  groups: z.array(whatsAppGroup),
  nextCursor: z.string().optional(),
});

/** Paginated participants response */
export const participantsListResponse = z.object({
  participants: z.array(whatsAppGroupParticipant),
  nextCursor: z.string().optional(),
});

/** Sync groups response */
export const syncGroupsResponse = z.object({
  synced: z.number().int().min(0),
  errors: z.array(z.string()),
});

/** Filter counts response */
export const filterCountsResponse = z.object({
  all: z.number().int().min(0),
  admin: z.number().int().min(0),
  archived: z.number().int().min(0),
  muted: z.number().int().min(0),
});

// ============================================================================
// Types
// ============================================================================

export type ParticipantRole = z.infer<typeof participantRole>;
export type GroupFilterType = z.infer<typeof groupFilterType>;
export type WhatsAppGroup = z.infer<typeof whatsAppGroup>;
export type WhatsAppGroupParticipant = z.infer<typeof whatsAppGroupParticipant>;
export type WhatsAppGroupWithParticipants = z.infer<
  typeof whatsAppGroupWithParticipants
>;
export type GroupFilterInput = z.infer<typeof groupFilterInput>;
export type GroupIdInput = z.infer<typeof groupIdInput>;
export type SyncGroupsInput = z.infer<typeof syncGroupsInput>;
export type ParticipantFilterInput = z.infer<typeof participantFilterInput>;
export type GroupsListResponse = z.infer<typeof groupsListResponse>;
export type ParticipantsListResponse = z.infer<typeof participantsListResponse>;
export type SyncGroupsResponse = z.infer<typeof syncGroupsResponse>;
export type FilterCountsInput = z.infer<typeof filterCountsInput>;
export type FilterCountsResponse = z.infer<typeof filterCountsResponse>;
