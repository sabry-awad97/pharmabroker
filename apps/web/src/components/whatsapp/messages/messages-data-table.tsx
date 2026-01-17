/**
 * Messages Data Table Component
 *
 * TanStack Table implementation for WhatsApp messages with
 * sorting, pagination, row selection, virtualization, and beautiful actions.
 *
 * Features:
 * - Row virtualization for performance with large datasets
 * - "Select all X messages" across all pages
 * - Optimistic UI updates
 */

import type {
  ColumnDef,
  SortingState,
  RowSelectionState,
} from '@tanstack/react-table';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Copy,
  Sparkles,
  RotateCcw,
  RefreshCw,
  Trash2,
  Reply,
  Forward,
  Users,
  Loader2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { WhatsAppMessageWithGroup } from '@pharmabroker/schemas/whatsapp';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getAvatarUrl, getInitials } from '@/utils/avatar';

import { TableActions, type TableAction } from './table-actions';
import { MessageTypeBadge, type MessageType } from './message-type-badge';
import { AIStatusBadge, type AIStatus } from './ai-status-badge';
import { MessagePreview } from './message-preview';

// Re-export the type for backward compatibility
export type WhatsAppMessage = WhatsAppMessageWithGroup;

interface MessagesDataTableProps {
  data: WhatsAppMessageWithGroup[];
  onView?: (message: WhatsAppMessageWithGroup) => void;
  onProcessAI?: (message: WhatsAppMessageWithGroup) => void;
  onRetryAI?: (message: WhatsAppMessageWithGroup) => void;
  onReprocessAI?: (message: WhatsAppMessageWithGroup) => void;
  onDelete?: (message: WhatsAppMessageWithGroup) => void;
  onBulkProcess?: (messages: WhatsAppMessageWithGroup[]) => void;
  onBulkDelete?: (messages: WhatsAppMessageWithGroup[]) => void;
  onScheduleAI?: (messages: WhatsAppMessageWithGroup[]) => void;
  onSelectAll?: () => Promise<WhatsAppMessageWithGroup[]>; // NEW: Fetch all messages for selection
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  totalCount?: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  onNextPage?: () => void;
  onPreviousPage?: () => void;
  isLoadingPage?: boolean;
  isProcessing?: boolean;
  processingMessageId?: string | null;
  enableVirtualization?: boolean; // NEW: Toggle virtualization
}

type SelectionMode = 'page' | 'all';

export function MessagesDataTable({
  data,
  onView,
  onProcessAI,
  onRetryAI,
  onReprocessAI,
  onDelete,
  onBulkProcess,
  onBulkDelete,
  onScheduleAI,
  onSelectAll,
  pageSize = 20,
  onPageSizeChange,
  totalCount = 0,
  hasNextPage = false,
  hasPreviousPage = false,
  onNextPage,
  onPreviousPage,
  isLoadingPage = false,
  isProcessing = false,
  processingMessageId = null,
  enableVirtualization = pageSize >= 50, // Auto-enable for large page sizes
}: MessagesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'messageTimestamp', desc: true },
  ]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('page');
  const [allMessages, setAllMessages] = useState<WhatsAppMessageWithGroup[]>(
    [],
  );
  const [isLoadingAll, setIsLoadingAll] = useState(false);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Define actions for each row
  const getRowActions = (
    message: WhatsAppMessageWithGroup,
  ): TableAction<WhatsAppMessageWithGroup>[] => [
    {
      id: 'view',
      label: 'View Details',
      icon: Eye,
      onClick: row => onView?.(row),
    },
    {
      id: 'copy',
      label: 'Copy Text',
      icon: Copy,
      disabled: row => !row.text && !row.caption,
      onClick: row => {
        const text = row.text || row.caption || '';
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard');
      },
    },
    {
      id: 'process',
      label: 'Process with AI',
      icon: Sparkles,
      hidden: row =>
        row.aiStatus === 'completed' || row.aiStatus === 'processing',
      disabled: isProcessing,
      onClick: row => onProcessAI?.(row),
    },
    {
      id: 'schedule',
      label: 'Schedule AI Processing',
      icon: Clock,
      hidden: row =>
        row.aiStatus === 'completed' ||
        row.aiStatus === 'processing' ||
        row.aiStatus === 'scheduled',
      onClick: row => onScheduleAI?.([row]),
    },
    {
      id: 'retry',
      label: 'Retry AI Processing',
      icon: RotateCcw,
      hidden: row => row.aiStatus !== 'failed',
      disabled: isProcessing,
      onClick: row => onRetryAI?.(row),
    },
    {
      id: 'reprocess',
      label: 'Reprocess with AI',
      icon: RefreshCw,
      hidden: row => row.aiStatus !== 'completed',
      disabled: isProcessing,
      onClick: row => onReprocessAI?.(row),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      variant: 'destructive',
      onClick: row => onDelete?.(row),
    },
  ];

  const columns: ColumnDef<WhatsAppMessageWithGroup>[] = [
    // Selection column
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={value => row.toggleSelected(!!value)}
          aria-label="Select row"
          onClick={e => e.stopPropagation()}
        />
      ),
      enableSorting: false,
    },
    // Sender column
    {
      accessorKey: 'senderPushName',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Sender
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const message = row.original;
        const name = message.senderPushName || message.senderJid.split('@')[0];
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarImage src={getAvatarUrl(name)} alt={name} />
              <AvatarFallback className="text-[10px]">
                {getInitials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{name}</p>
              {message.isFromMe && (
                <Badge
                  variant="secondary"
                  className="mt-0.5 h-4 px-1 text-[10px]"
                >
                  You
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    // Message content column
    {
      accessorKey: 'text',
      header: 'Message',
      cell: ({ row }) => {
        const message = row.original;
        return (
          <div className="max-w-[300px] space-y-1">
            <MessagePreview
              text={message.text}
              caption={message.caption}
              filename={message.filename}
              messageType={message.messageType}
            />
            <div className="flex items-center gap-1.5">
              {message.isForwarded && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      className="h-4 gap-0.5 px-1 text-[10px]"
                    >
                      <Forward className="h-2.5 w-2.5" />
                      Fwd
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Forwarded message</TooltipContent>
                </Tooltip>
              )}
              {message.quotedMessageId && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="secondary"
                      className="h-4 gap-0.5 px-1 text-[10px]"
                    >
                      <Reply className="h-2.5 w-2.5" />
                      Reply
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>Reply to another message</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        );
      },
    },
    // Type column
    {
      accessorKey: 'messageType',
      header: 'Type',
      cell: ({ row }) => (
        <MessageTypeBadge type={row.original.messageType} showLabel={false} />
      ),
    },
    // Group column
    {
      accessorKey: 'group.name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Group
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground max-w-[150px] truncate text-xs">
          {row.original.group.name}
        </span>
      ),
    },
    // AI Status column
    {
      accessorKey: 'aiStatus',
      header: 'AI',
      cell: ({ row }) => {
        const message = row.original;
        return (
          <AIStatusBadge
            status={message.aiStatus}
            model={message.aiModel}
            error={message.aiError}
          />
        );
      },
    },
    // Source column
    {
      accessorKey: 'source',
      header: 'Source',
      cell: ({ row }) => {
        const source = row.original.source;
        return (
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px]',
              source === 'realtime'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600'
                : 'border-blue-500/20 bg-blue-500/10 text-blue-600',
            )}
          >
            {source === 'realtime' ? 'Live' : 'Sync'}
          </Badge>
        );
      },
    },
    // Timestamp column
    {
      accessorKey: 'messageTimestamp',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Time
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <Tooltip>
          <TooltipTrigger>
            <span className="text-muted-foreground text-xs">
              {formatRelativeTime(row.original.messageTimestamp)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {new Date(row.original.messageTimestamp).toLocaleString()}
          </TooltipContent>
        </Tooltip>
      ),
    },
    // Actions column
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <TableActions
          row={row.original}
          actions={getRowActions(row.original)}
          inlineActions={['view', 'copy']}
          menuLabel="Message Actions"
        />
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    // Server-side pagination - don't use getPaginationRowModel
    manualPagination: true,
    pageCount: -1, // Unknown page count with cursor pagination
  });

  // Virtualization setup
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 60, // Estimated row height in pixels
    overscan: 5,
    enabled: enableVirtualization,
  });

  const virtualRows = enableVirtualization
    ? rowVirtualizer.getVirtualItems()
    : rows.map((_, index) => ({ index, size: 60, start: index * 60 }));

  // Selection handlers
  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const hasSelection = selectedRows.length > 0;
  const isAllPageRowsSelected = table.getIsAllPageRowsSelected();
  const canSelectAll = totalCount > data.length && onSelectAll;

  const handleSelectAllMessages = useCallback(async () => {
    if (!onSelectAll) return;

    setIsLoadingAll(true);
    try {
      const messages = await onSelectAll();
      setAllMessages(messages);
      setSelectionMode('all');

      // Select all rows by ID
      const selection: RowSelectionState = {};
      messages.forEach((_, index) => {
        selection[index] = true;
      });
      setRowSelection(selection);

      toast.success(`Selected all ${messages.length} messages`);
    } catch (error) {
      toast.error('Failed to load all messages');
      console.error('Select all error:', error);
    } finally {
      setIsLoadingAll(false);
    }
  }, [onSelectAll]);

  const handleClearSelection = useCallback(() => {
    setRowSelection({});
    setSelectionMode('page');
    setAllMessages([]);
  }, []);

  // Get selected messages based on selection mode
  const getSelectedMessages = useCallback(() => {
    if (selectionMode === 'all' && allMessages.length > 0) {
      return allMessages.filter((_, index) => rowSelection[index]);
    }
    return selectedRows.map(row => row.original);
  }, [selectionMode, allMessages, rowSelection, selectedRows]);

  const selectedMessages = getSelectedMessages();
  const selectedCount = selectedMessages.length;

  return (
    <div className="space-y-4">
      {/* Select All Banner */}
      {isAllPageRowsSelected && canSelectAll && selectionMode === 'page' && (
        <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-800 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm text-blue-900 dark:text-blue-100">
              All <span className="font-medium">{data.length}</span> messages on
              this page are selected.
            </span>
          </div>
          <Button
            variant="link"
            size="sm"
            onClick={handleSelectAllMessages}
            disabled={isLoadingAll}
            className="h-auto p-0 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {isLoadingAll ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              `Select all ${totalCount.toLocaleString()} messages`
            )}
          </Button>
        </div>
      )}

      {/* Bulk actions bar */}
      {hasSelection && (
        <div className="bg-muted/50 border-border flex items-center justify-between rounded-lg border px-4 py-2">
          <div className="flex items-center gap-3">
            <span className="text-sm">
              <span className="font-medium">{selectedCount}</span> message
              {selectedCount !== 1 ? 's' : ''} selected
              {selectionMode === 'all' && (
                <span className="text-muted-foreground ml-1">
                  (across all pages)
                </span>
              )}
            </span>
            {hasSelection && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearSelection}
                className="h-7 text-xs"
              >
                Clear selection
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkProcess?.(selectedMessages)}
              disabled={isProcessing}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Process with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onScheduleAI?.(selectedMessages)}
            >
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Schedule
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkDelete?.(selectedMessages)}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="border-border overflow-auto rounded-lg border"
        style={{
          maxHeight: enableVirtualization ? '600px' : undefined,
        }}
      >
        <Table>
          <TableHeader className="bg-background sticky top-0 z-10">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow
                key={headerGroup.id}
                className="bg-muted/50 hover:bg-muted/50"
              >
                {headerGroup.headers.map(header => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody
            style={{
              height: enableVirtualization
                ? `${rowVirtualizer.getTotalSize()}px`
                : undefined,
              position: 'relative',
            }}
          >
            {rows.length ? (
              enableVirtualization ? (
                // Virtualized rows
                virtualRows.map(virtualRow => {
                  const row = rows[virtualRow.index];
                  const isRowProcessing =
                    processingMessageId === row.original.id;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(isRowProcessing && 'relative')}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {isRowProcessing && (
                        <td className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                            <span>Processing with AI...</span>
                          </div>
                        </td>
                      )}
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              ) : (
                // Non-virtualized rows
                rows.map(row => {
                  const isRowProcessing =
                    processingMessageId === row.original.id;
                  return (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && 'selected'}
                      className={cn(isRowProcessing && 'relative')}
                    >
                      {isRowProcessing && (
                        <td className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[1px]">
                          <div className="text-muted-foreground flex items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                            <span>Processing with AI...</span>
                          </div>
                        </td>
                      )}
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground h-24 text-center"
                >
                  No messages found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination
        currentPageSize={pageSize}
        onPageSizeChange={onPageSizeChange}
        totalCount={totalCount}
        currentPageCount={data.length}
        hasNextPage={hasNextPage}
        hasPreviousPage={hasPreviousPage}
        onNextPage={onNextPage}
        onPreviousPage={onPreviousPage}
        isLoading={isLoadingPage}
      />
    </div>
  );
}

interface DataTablePaginationProps {
  currentPageSize: number;
  onPageSizeChange?: (pageSize: number) => void;
  totalCount: number;
  currentPageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage?: () => void;
  onPreviousPage?: () => void;
  isLoading: boolean;
}

function DataTablePagination({
  currentPageSize,
  onPageSizeChange,
  totalCount,
  currentPageCount,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  isLoading,
}: DataTablePaginationProps) {
  const pageInfo = hasPreviousPage
    ? 'Page 2+'
    : currentPageCount > 0
      ? 'Page 1'
      : 'No results';

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <p className="text-muted-foreground text-xs">
          Showing {currentPageCount} of {totalCount.toLocaleString()} message(s)
        </p>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-violet-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Loading...</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Rows per page</span>
          <select
            value={currentPageSize}
            onChange={e => onPageSizeChange?.(Number(e.target.value))}
            disabled={isLoading}
            className="border-border bg-background h-8 rounded-md border px-2 text-xs disabled:opacity-50"
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <span className="text-muted-foreground text-xs">{pageInfo}</span>

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onPreviousPage}
                  disabled={!hasPreviousPage || isLoading}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasPreviousPage ? 'First page' : 'Already on first page'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onPreviousPage}
                  disabled={!hasPreviousPage || isLoading}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasPreviousPage ? 'Previous page' : 'Already on first page'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onNextPage}
                  disabled={!hasNextPage || isLoading}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasNextPage ? 'Next page' : 'No more pages'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onNextPage}
                  disabled={!hasNextPage || isLoading}
                  aria-label="Last page (next)"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasNextPage ? 'Next page' : 'No more pages'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString();
}
