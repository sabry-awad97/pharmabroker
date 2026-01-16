/**
 * Messages Data Table Component
 *
 * TanStack Table implementation for WhatsApp messages with
 * sorting, pagination, row selection, and beautiful actions.
 */

import type {
  ColumnDef,
  SortingState,
  PaginationState,
  RowSelectionState,
} from '@tanstack/react-table';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
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
  Trash2,
  Reply,
  Forward,
  Users,
} from 'lucide-react';
import { useState } from 'react';
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
  onDelete?: (message: WhatsAppMessageWithGroup) => void;
  onBulkProcess?: (messages: WhatsAppMessageWithGroup[]) => void;
  onBulkDelete?: (messages: WhatsAppMessageWithGroup[]) => void;
  pageSize?: number;
  isProcessing?: boolean;
}

export function MessagesDataTable({
  data,
  onView,
  onProcessAI,
  onRetryAI,
  onDelete,
  onBulkProcess,
  onBulkDelete,
  pageSize = 20,
  isProcessing = false,
}: MessagesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'messageTimestamp', desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

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
      onClick: row => onProcessAI?.(row),
    },
    {
      id: 'retry',
      label: 'Retry AI Processing',
      icon: RotateCcw,
      hidden: row => row.aiStatus !== 'failed',
      onClick: row => onRetryAI?.(row),
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
      pagination,
      rowSelection,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableRowSelection: true,
  });

  const selectedRows = table.getFilteredSelectedRowModel().rows;
  const hasSelection = selectedRows.length > 0;

  return (
    <div className="space-y-4">
      {/* Bulk actions bar */}
      {hasSelection && (
        <div className="bg-muted/50 border-border flex items-center justify-between rounded-lg border px-4 py-2">
          <span className="text-sm">
            <span className="font-medium">{selectedRows.length}</span> message
            {selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkProcess?.(selectedRows.map(r => r.original))}
              disabled={isProcessing}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Process with AI
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onBulkDelete?.(selectedRows.map(r => r.original))}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="border-border overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
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
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
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
      <DataTablePagination table={table} />
    </div>
  );
}

function DataTablePagination<TData>({
  table,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-xs">
        {table.getFilteredRowModel().rows.length} message(s) total
      </p>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Rows per page</span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className="border-border bg-background h-8 rounded-md border px-2 text-xs"
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        <span className="text-xs">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
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
