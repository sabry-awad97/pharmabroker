/**
 * Messages Filter Panel Component
 *
 * Provides search and filter controls for the messages table.
 */

import { Search, X, Filter, SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import type { MessageType } from './message-type-badge';
import type { AIStatus } from './ai-status-badge';

export type MessageSource = 'all' | 'realtime' | 'history';

interface MessagesFilterPanelProps {
  search: string;
  messageType: MessageType | 'all';
  aiStatus: AIStatus | 'all';
  source: MessageSource;
  onSearchChange: (value: string) => void;
  onMessageTypeChange: (value: MessageType | 'all') => void;
  onAIStatusChange: (value: AIStatus | 'all') => void;
  onSourceChange: (value: MessageSource) => void;
  onClear: () => void;
  totalCount?: number;
  filteredCount?: number;
  className?: string;
}

const messageTypes: { value: MessageType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Document' },
  { value: 'sticker', label: 'Sticker' },
  { value: 'location', label: 'Location' },
  { value: 'contact', label: 'Contact' },
  { value: 'poll', label: 'Poll' },
];

const aiStatuses: { value: AIStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'skipped', label: 'Skipped' },
];

const sources: { value: MessageSource; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'realtime', label: 'Real-time' },
  { value: 'history', label: 'History Sync' },
];

export function MessagesFilterPanel({
  search,
  messageType,
  aiStatus,
  source,
  onSearchChange,
  onMessageTypeChange,
  onAIStatusChange,
  onSourceChange,
  onClear,
  totalCount,
  filteredCount,
  className,
}: MessagesFilterPanelProps) {
  const hasFilters =
    search.length > 0 ||
    messageType !== 'all' ||
    aiStatus !== 'all' ||
    source !== 'all';

  const activeFilterCount = [
    search.length > 0,
    messageType !== 'all',
    aiStatus !== 'all',
    source !== 'all',
  ].filter(Boolean).length;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search and filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative max-w-sm min-w-[200px] flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Search messages..."
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            className="pr-9 pl-9"
          />
          {search && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 right-1.5 -translate-y-1/2"
              onClick={() => onSearchChange('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Message type filter */}
        <Select
          value={messageType}
          onValueChange={v => onMessageTypeChange(v as MessageType | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {messageTypes.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* AI status filter */}
        <Select
          value={aiStatus}
          onValueChange={v => onAIStatusChange(v as AIStatus | 'all')}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aiStatuses.map(status => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source filter */}
        <Select
          value={source}
          onValueChange={v => onSourceChange(v as MessageSource)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map(s => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Clear filters */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-muted-foreground"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Results count */}
      {totalCount !== undefined && (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {hasFilters ? (
            <span>
              Showing{' '}
              <span className="text-foreground font-medium">
                {filteredCount ?? 0}
              </span>{' '}
              of{' '}
              <span className="text-foreground font-medium">{totalCount}</span>{' '}
              messages
            </span>
          ) : (
            <span>
              <span className="text-foreground font-medium">{totalCount}</span>{' '}
              messages total
            </span>
          )}
        </div>
      )}
    </div>
  );
}
