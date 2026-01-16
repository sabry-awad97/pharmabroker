/**
 * Column Visibility Toggle Component
 *
 * Allows users to show/hide table columns.
 */

import { Settings2 } from 'lucide-react';
import type { Table } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from '@/components/ui/dropdown-menu';

interface ColumnVisibilityToggleProps<TData> {
  table: Table<TData>;
}

const columnLabels: Record<string, string> = {
  select: 'Selection',
  senderPushName: 'Sender',
  text: 'Message',
  messageType: 'Type',
  groupName: 'Group',
  aiStatus: 'AI Status',
  source: 'Source',
  messageTimestamp: 'Time',
  actions: 'Actions',
};

export function ColumnVisibilityToggle<TData>({
  table,
}: ColumnVisibilityToggleProps<TData>) {
  const columns = table.getAllColumns().filter(column => column.getCanHide());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 className="mr-2 h-4 w-4" />
            Columns
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {columns.map(column => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={value => column.toggleVisibility(!!value)}
            >
              {columnLabels[column.id] || column.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
