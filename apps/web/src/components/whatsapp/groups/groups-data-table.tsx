/**
 * Groups Data Table
 *
 * TanStack Table implementation for WhatsApp groups with
 * sorting, pagination, and row selection support.
 */

import type { WhatsAppGroup } from '@pharmabroker/schemas/whatsapp';
import type {
  ColumnDef,
  SortingState,
  PaginationState,
} from '@tanstack/react-table';

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Archive,
  ArrowUpDown,
  BellOff,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Eye,
  Lock,
  Megaphone,
  Timer,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface GroupsDataTableProps {
  data: WhatsAppGroup[];
  onRowClick?: (group: WhatsAppGroup) => void;
  onCopyJid?: (jid: string) => void;
  pageSize?: number;
}

export function GroupsDataTable({
  data,
  onRowClick,
  onCopyJid,
  pageSize = 10,
}: GroupsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const columns: ColumnDef<WhatsAppGroup>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Group
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const group = row.original;
        const isMutedOrArchived = group.isMuted || group.isArchived;
        return (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar
                className={cn('h-9 w-9', isMutedOrArchived && 'grayscale-30')}
              >
                <AvatarImage
                  src={group.avatarUrl || getAvatarUrl(group.name)}
                  alt={group.name}
                />
                <AvatarFallback className="text-xs">
                  {getInitials(group.name)}
                </AvatarFallback>
              </Avatar>
              {/* Status overlay icon */}
              {isMutedOrArchived && (
                <div
                  className={cn(
                    'border-background absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2',
                    group.isArchived ? 'bg-slate-500' : 'bg-rose-500',
                  )}
                >
                  {group.isArchived ? (
                    <Archive className="h-2 w-2 text-white" />
                  ) : (
                    <BellOff className="h-2 w-2 text-white" />
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'truncate font-medium',
                  isMutedOrArchived && 'text-muted-foreground',
                )}
              >
                {group.name}
              </p>
              {group.description && (
                <p className="text-muted-foreground max-w-[200px] truncate text-[11px]">
                  {group.description}
                </p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'memberCount',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          Members
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{row.original.memberCount}</span>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const group = row.original;

        if (!group.isMuted && !group.isArchived) {
          return (
            <Badge
              variant="secondary"
              className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
            >
              <span className="mr-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Active
            </Badge>
          );
        }

        if (group.isArchived) {
          return (
            <Badge
              variant="secondary"
              className="border-slate-500/20 bg-slate-500/10 text-slate-500"
            >
              <Archive className="mr-1.5 h-3 w-3" />
              Archived
            </Badge>
          );
        }

        if (group.isMuted) {
          return (
            <Tooltip>
              <TooltipTrigger>
                <Badge
                  variant="secondary"
                  className="border-rose-500/20 bg-rose-500/10 text-rose-500"
                >
                  <BellOff className="mr-1.5 h-3 w-3" />
                  Muted
                  {group.mutedUntil && (
                    <span className="ml-1 opacity-70">
                      ({formatMutedUntil(group.mutedUntil)})
                    </span>
                  )}
                </Badge>
              </TooltipTrigger>
              {group.mutedUntil && (
                <TooltipContent>
                  Muted until {new Date(group.mutedUntil).toLocaleString()}
                </TooltipContent>
              )}
            </Tooltip>
          );
        }

        return null;
      },
    },
    {
      id: 'settings',
      header: 'Settings',
      cell: ({ row }) => {
        const group = row.original;
        return (
          <div className="flex items-center gap-1">
            {group.isAnnounce && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="secondary"
                    className="h-6 w-6 justify-center p-0"
                  >
                    <Megaphone className="h-3 w-3" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Announcement only</TooltipContent>
              </Tooltip>
            )}
            {group.isLocked && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="secondary"
                    className="h-6 w-6 justify-center p-0"
                  >
                    <Lock className="h-3 w-3" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>Locked</TooltipContent>
              </Tooltip>
            )}
            {group.isEphemeral && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="secondary"
                    className="h-6 w-6 justify-center p-0"
                  >
                    <Timer className="h-3 w-3" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Disappearing messages
                  {group.ephemeralTime &&
                    ` (${formatEphemeralTime(group.ephemeralTime)})`}
                </TooltipContent>
              </Tooltip>
            )}
            {!group.isAnnounce && !group.isLocked && !group.isEphemeral && (
              <span className="text-muted-foreground text-xs">—</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'updatedAt',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Last Updated
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = row.original.lastSyncAt || row.original.updatedAt;
        return (
          <span className="text-muted-foreground text-xs">
            {formatRelativeTime(date)}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const group = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={e => {
                    e.stopPropagation();
                    onRowClick?.(group);
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View details</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={e => {
                    e.stopPropagation();
                    onCopyJid?.(group.jid);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy JID</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    },
  ];

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4">
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
                  className="cursor-pointer"
                  onClick={() => onRowClick?.(row.original)}
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
                  No groups found
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

/**
 * Pagination component for the data table
 */
function DataTablePagination<TData>({
  table,
}: {
  table: ReturnType<typeof useReactTable<TData>>;
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-xs">
        {table.getFilteredRowModel().rows.length} group(s) total
      </p>

      <div className="flex items-center gap-6">
        {/* Page size selector */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Rows per page</span>
          <select
            value={table.getState().pagination.pageSize}
            onChange={e => table.setPageSize(Number(e.target.value))}
            className="border-border bg-background h-8 rounded-md border px-2 text-xs"
          >
            {[5, 10, 20, 50].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {/* Page info */}
        <span className="text-xs">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>

        {/* Navigation buttons */}
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

/**
 * Format ephemeral time for display
 */
function formatEphemeralTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/**
 * Format muted until time for display
 */
function formatMutedUntil(date: Date | string): string {
  const mutedUntil = new Date(date);
  const now = new Date();
  const diffMs = mutedUntil.getTime() - now.getTime();

  if (diffMs <= 0) return 'Expired';

  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffHours < 1) return '<1h';
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.floor(diffDays / 7)}w`;
  return '∞';
}

/**
 * Format relative time
 */
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
