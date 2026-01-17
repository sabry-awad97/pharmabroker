/**
 * Keyboard Shortcuts Dialog
 *
 * Displays all available keyboard shortcuts for the messages page.
 * Accessible via the keyboard icon or pressing '?'
 */

import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface KeyboardShortcutsDialogProps {
  trigger?: React.ReactNode;
}

export function KeyboardShortcutsDialog({
  trigger,
}: KeyboardShortcutsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Speed up your workflow with these keyboard shortcuts
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Selection */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Selection</h3>
            <div className="space-y-2">
              <ShortcutRow
                keys={['Ctrl', 'A']}
                description="Select all messages on current page"
              />
              <ShortcutRow
                keys={['Esc']}
                description="Clear selection and close dialogs"
              />
            </div>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Navigation</h3>
            <div className="space-y-2">
              <ShortcutRow
                keys={['←']}
                description="Go to previous page"
                disabled="When on first page"
              />
              <ShortcutRow
                keys={['→']}
                description="Go to next page"
                disabled="When on last page"
              />
            </div>
          </div>

          {/* Actions */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Actions</h3>
            <div className="space-y-2">
              <ShortcutRow keys={['Ctrl', 'E']} description="Export messages" />
              <ShortcutRow
                keys={['Ctrl', 'R']}
                description="Refresh messages"
              />
            </div>
          </div>

          {/* Help */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Help</h3>
            <div className="space-y-2">
              <ShortcutRow
                keys={['?']}
                description="Show this keyboard shortcuts dialog"
              />
            </div>
          </div>

          {/* Tips */}
          <div className="bg-muted/50 rounded-lg p-4">
            <h3 className="mb-2 text-sm font-semibold">💡 Pro Tips</h3>
            <ul className="text-muted-foreground space-y-1 text-xs">
              <li>
                • Use <kbd className="bg-muted rounded px-1">Ctrl+A</kbd> then
                click "Select all X messages" for bulk operations
              </li>
              <li>
                • Press <kbd className="bg-muted rounded px-1">Esc</kbd> to
                quickly close any open dialog
              </li>
              <li>
                • Arrow keys work even when a dialog is open for quick
                navigation
              </li>
              <li>
                • Keyboard shortcuts are disabled when typing in input fields
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ShortcutRowProps {
  keys: string[];
  description: string;
  disabled?: string;
}

function ShortcutRow({ keys, description, disabled }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {keys.map((key, index) => (
          <span key={index} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground text-xs">+</span>
            )}
            <kbd className="bg-muted border-border inline-flex h-6 min-w-[24px] items-center justify-center rounded border px-2 text-xs font-medium">
              {key}
            </kbd>
          </span>
        ))}
      </div>
      <div className="flex-1 pl-4">
        <p className="text-sm">{description}</p>
        {disabled && (
          <p className="text-muted-foreground text-xs italic">{disabled}</p>
        )}
      </div>
    </div>
  );
}
