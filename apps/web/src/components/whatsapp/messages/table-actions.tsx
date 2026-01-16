/**
 * Reusable Table Actions Component
 *
 * A beautiful, reusable actions column for TanStack tables.
 * Supports icons, labels, variants, and keyboard shortcuts.
 */

import { MoreHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface TableAction<T = unknown> {
  /** Unique identifier for the action */
  id: string;
  /** Display label */
  label: string;
  /** Icon component */
  icon?: React.ComponentType<{ className?: string }>;
  /** Action variant for styling */
  variant?: 'default' | 'destructive';
  /** Keyboard shortcut display */
  shortcut?: string;
  /** Whether the action is disabled */
  disabled?: boolean | ((row: T) => boolean);
  /** Whether to show this action */
  hidden?: boolean | ((row: T) => boolean);
  /** Click handler */
  onClick: (row: T) => void;
}

export interface TableActionsProps<T = unknown> {
  /** The row data */
  row: T;
  /** Array of actions to display */
  actions: TableAction<T>[];
  /** Actions to show as inline buttons (by id) */
  inlineActions?: string[];
  /** Menu label */
  menuLabel?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Reusable table actions component with inline buttons and dropdown menu
 */
export function TableActions<T>({
  row,
  actions,
  inlineActions = [],
  menuLabel = 'Actions',
  className,
}: TableActionsProps<T>) {
  // Separate inline and menu actions
  const visibleActions = actions.filter(action => {
    const hidden =
      typeof action.hidden === 'function' ? action.hidden(row) : action.hidden;
    return !hidden;
  });

  const inline = visibleActions.filter(a => inlineActions.includes(a.id));
  const menu = visibleActions.filter(a => !inlineActions.includes(a.id));

  // Group menu actions by separator
  const menuGroups: TableAction<T>[][] = [];
  let currentGroup: TableAction<T>[] = [];

  menu.forEach((action, index) => {
    currentGroup.push(action);
    // Add separator after destructive actions or at natural breaks
    if (
      action.variant === 'destructive' ||
      (index < menu.length - 1 && menu[index + 1].variant === 'destructive')
    ) {
      if (currentGroup.length > 0) {
        menuGroups.push(currentGroup);
        currentGroup = [];
      }
    }
  });
  if (currentGroup.length > 0) {
    menuGroups.push(currentGroup);
  }

  return (
    <div
      className={cn('flex items-center justify-end gap-1', className)}
      onClick={e => e.stopPropagation()}
    >
      {/* Inline actions */}
      {inline.map(action => {
        const Icon = action.icon;
        const disabled =
          typeof action.disabled === 'function'
            ? action.disabled(row)
            : action.disabled;

        return (
          <Tooltip key={action.id}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={disabled}
                onClick={() => action.onClick(row)}
                className={cn(
                  action.variant === 'destructive' &&
                    'hover:bg-destructive/10 hover:text-destructive',
                )}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{action.label}</TooltipContent>
          </Tooltip>
        );
      })}

      {/* Dropdown menu for remaining actions */}
      {menu.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs">
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span className="sr-only">{menuLabel}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
              {menuGroups.map((group, groupIndex) => (
                <div key={groupIndex}>
                  {groupIndex > 0 && <DropdownMenuSeparator />}
                  {group.map(action => {
                    const Icon = action.icon;
                    const disabled =
                      typeof action.disabled === 'function'
                        ? action.disabled(row)
                        : action.disabled;

                    return (
                      <DropdownMenuItem
                        key={action.id}
                        disabled={disabled}
                        variant={action.variant}
                        onClick={() => action.onClick(row)}
                      >
                        {Icon && <Icon className="mr-2 h-4 w-4" />}
                        {action.label}
                        {action.shortcut && (
                          <DropdownMenuShortcut>
                            {action.shortcut}
                          </DropdownMenuShortcut>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
