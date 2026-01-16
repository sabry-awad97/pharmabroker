/**
 * Confirm Dialog Component
 *
 * Reusable confirmation dialogs for destructive actions.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  isLoading = false,
  icon,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            {icon}
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={e => {
              e.preventDefault();
              onConfirm();
            }}
            disabled={isLoading}
            className={cn(
              variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Pre-configured dialogs for common actions

interface DeleteMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  count?: number;
}

export function DeleteMessageDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  count = 1,
}: DeleteMessageDialogProps) {
  const isMultiple = count > 1;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={isMultiple ? `Delete ${count} messages?` : 'Delete message?'}
      description={
        isMultiple
          ? `This will permanently delete ${count} messages. This action cannot be undone.`
          : 'This will permanently delete this message. This action cannot be undone.'
      }
      confirmLabel={isMultiple ? `Delete ${count} messages` : 'Delete'}
      variant="destructive"
      isLoading={isLoading}
      icon={<Trash2 className="text-destructive h-5 w-5" />}
    />
  );
}

interface BulkProcessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  count: number;
}

export function BulkProcessDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  count,
}: BulkProcessDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
      title={`Process ${count} messages with AI?`}
      description={`This will send ${count} messages to the AI for processing. This may take a while depending on the queue.`}
      confirmLabel={`Process ${count} messages`}
      isLoading={isLoading}
      icon={<Sparkles className="h-5 w-5 text-violet-500" />}
    />
  );
}

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (format: 'csv' | 'json') => void;
  isLoading?: boolean;
  count: number;
}

export function ExportDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading = false,
  count,
}: ExportDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Export {count} messages</AlertDialogTitle>
          <AlertDialogDescription>
            Choose the format for exporting your messages.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-3 py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onConfirm('csv')}
            disabled={isLoading}
          >
            Export as CSV
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onConfirm('json')}
            disabled={isLoading}
          >
            Export as JSON
          </Button>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
