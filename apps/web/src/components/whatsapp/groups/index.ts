/**
 * WhatsApp Groups Components
 *
 * Barrel export for all group-related components.
 */

// Avatar component
export { GroupAvatar, type GroupAvatarProps } from './group-avatar';

// Status badges component
export {
  GroupStatusBadges,
  hasActiveSettings,
  getActiveSettingNames,
  type GroupSettings,
  type GroupStatusBadgesProps,
} from './group-status-badges';

// Group card component
export {
  GroupCard,
  extractGroupCardData,
  isGroupCardDataComplete,
  shouldShowSessionIndicator,
  isGroupStale,
  type GroupCardProps,
  type GroupQuickAction,
  type SessionInfo,
} from './group-card';

// Filter panel component
export {
  GroupFilterPanel,
  filterGroupsBySearch,
  filterGroupsBySession,
  calculateFilterCounts,
  applyGroupFilters,
  type GroupFilterPanelProps,
  type FilterCounts,
} from './group-filter-panel';

// Empty state component
export {
  GroupsEmptyState,
  type GroupsEmptyStateProps,
  type EmptyStateVariant,
} from './groups-empty-state';

// Skeleton component
export {
  GroupsSkeleton,
  GroupCardSkeleton,
  type GroupsSkeletonProps,
} from './groups-skeleton';

// Participant card component
export {
  ParticipantCard,
  getParticipantDisplayName,
  getRoleLabel,
  isParticipantOwner,
  sortParticipantsByRole,
  groupParticipantsByRole,
  type ParticipantCardProps,
} from './participant-card';

// Participant list component
export {
  ParticipantList,
  ParticipantListSkeleton,
  ParticipantCardSkeleton,
  filterParticipantsBySearch,
  type ParticipantListProps,
} from './participant-list';

// Group detail header component
export {
  GroupDetailHeader,
  type GroupDetailHeaderProps,
} from './group-detail-header';

// Sync groups dialog component
export {
  SyncGroupsDialog,
  type SyncGroupsDialogProps,
  type SyncStatus,
  type SyncResult,
} from './sync-groups-dialog';

// Error state component
export {
  GroupErrorState,
  getErrorType,
  sanitizeErrorForLogging,
  type GroupErrorStateProps,
  type GroupErrorType,
} from './group-error-state';

// Error boundary component
export {
  GroupCardErrorBoundary,
  withGroupCardErrorBoundary,
} from './group-card-error-boundary';

// Data table component
export { GroupsDataTable } from './groups-data-table';

// Grid view component
export { GroupsGridView } from './groups-grid-view';

// View toggle component
export { GroupsViewToggle, type ViewMode } from './groups-view-toggle';

// Faceted filter component
export { GroupsFacetedFilter } from './groups-faceted-filter';
