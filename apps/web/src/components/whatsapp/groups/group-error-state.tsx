/**
 * GroupErrorState Component
 *
 * Displays error state messages for the groups feature.
 * Handles different error types with appropriate messages and recovery actions.
 *
 * Requirements: 9.1, 9.2
 */

import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  RefreshCw,
  Unplug,
  Search,
  WifiOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

/**
 * Error types that can be displayed
 */
export type GroupErrorType =
  | 'network'
  | 'session-disconnected'
  | 'group-not-found'
  | 'sync-failed'
  | 'rate-limited'
  | 'generic';

/**
 * Error configuration for each error type
 */
interface ErrorConfig {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
  showRetry: boolean;
  showSessionLink: boolean;
  showBackButton: boolean;
}

const ERROR_CONFIGS: Record<GroupErrorType, ErrorConfig> = {
  network: {
    icon: WifiOff,
    title: 'Connection Error',
    message: 'Unable to connect. Check your internet connection.',
    showRetry: true,
    showSessionLink: false,
    showBackButton: false,
  },
  'session-disconnected': {
    icon: Unplug,
    title: 'Session Disconnected',
    message: 'WhatsApp session disconnected. Reconnect to sync groups.',
    showRetry: false,
    showSessionLink: true,
    showBackButton: false,
  },
  'group-not-found': {
    icon: Search,
    title: 'Group Not Found',
    message: 'This group no longer exists or was removed.',
    showRetry: false,
    showSessionLink: false,
    showBackButton: true,
  },
  'sync-failed': {
    icon: RefreshCw,
    title: 'Sync Failed',
    message: 'Failed to sync groups. Please try again.',
    showRetry: true,
    showSessionLink: false,
    showBackButton: false,
  },
  'rate-limited': {
    icon: AlertTriangle,
    title: 'Too Many Requests',
    message: 'Too many requests. Please wait a moment.',
    showRetry: true,
    showSessionLink: false,
    showBackButton: false,
  },
  generic: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
    showRetry: true,
    showSessionLink: false,
    showBackButton: false,
  },
};

export interface GroupErrorStateProps {
  /** The type of error to display */
  errorType?: GroupErrorType;
  /** Custom error message (overrides default) */
  message?: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Whether retry is in progress */
  isRetrying?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Variant for different display contexts */
  variant?: 'page' | 'card' | 'inline';
}

/**
 * Determines the error type from an error object
 */
export function getErrorType(error: unknown): GroupErrorType {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection')
    ) {
      return 'network';
    }
    if (message.includes('disconnected') || message.includes('session')) {
      return 'session-disconnected';
    }
    if (message.includes('not found') || message.includes('404')) {
      return 'group-not-found';
    }
    if (message.includes('sync')) {
      return 'sync-failed';
    }
    if (
      message.includes('rate') ||
      message.includes('429') ||
      message.includes('too many')
    ) {
      return 'rate-limited';
    }
  }

  return 'generic';
}

/**
 * Sanitizes error messages to remove sensitive information
 * Used for logging purposes
 */
export function sanitizeErrorForLogging(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  let message = error.message;

  // Handle empty messages
  if (!message || message.trim().length === 0) {
    return 'Unknown error';
  }

  // Remove JIDs (format: number@s.whatsapp.net or number:device@s.whatsapp.net)
  message = message.replace(/\d+(?::\d+)?@[a-z.]+/gi, '[REDACTED_JID]');

  // Remove phone numbers (various formats)
  message = message.replace(/\+?\d{10,15}/g, '[REDACTED_PHONE]');

  // Remove potential message content (quoted strings longer than 20 chars)
  message = message.replace(/"[^"]{20,}"/g, '"[REDACTED_CONTENT]"');
  message = message.replace(/'[^']{20,}'/g, "'[REDACTED_CONTENT]'");

  return message;
}

/**
 * Page-level error state component
 */
function PageErrorState({
  config,
  message,
  onRetry,
  isRetrying,
  className,
}: {
  config: ErrorConfig;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  const Icon = config.icon;

  return (
    <Empty className={cn('border-border rounded-md border py-12', className)}>
      <EmptyHeader>
        <EmptyMedia>
          <div className="bg-destructive/10 rounded-full p-4">
            <Icon className="text-destructive size-12" />
          </div>
        </EmptyMedia>
        <EmptyTitle className="text-lg">{config.title}</EmptyTitle>
        <EmptyDescription className="text-sm">
          {message || config.message}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex items-center gap-2">
          {config.showRetry && onRetry && (
            <Button
              onClick={onRetry}
              disabled={isRetrying}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={cn('mr-2 size-4', isRetrying && 'animate-spin')}
              />
              {isRetrying ? 'Retrying...' : 'Try Again'}
            </Button>
          )}
          {config.showSessionLink && (
            <Button size="sm" asChild>
              <Link to="/whatsapp/sessions">Go to Sessions</Link>
            </Button>
          )}
          {config.showBackButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.history.back()}
            >
              Go Back
            </Button>
          )}
        </div>
      </EmptyContent>
    </Empty>
  );
}

/**
 * Card-level error state component (compact)
 */
function CardErrorState({
  config,
  message,
  onRetry,
  isRetrying,
  className,
}: {
  config: ErrorConfig;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center rounded-md border p-4 text-center',
        className,
      )}
    >
      <Icon className="text-destructive mb-2 size-8" />
      <p className="text-destructive text-sm font-medium">{config.title}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {message || config.message}
      </p>
      {config.showRetry && onRetry && (
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          size="xs"
          variant="ghost"
          className="mt-2"
        >
          <RefreshCw
            className={cn('mr-1 size-3', isRetrying && 'animate-spin')}
          />
          {isRetrying ? 'Retrying...' : 'Retry'}
        </Button>
      )}
    </div>
  );
}

/**
 * Inline error state component (minimal)
 */
function InlineErrorState({
  config,
  message,
  onRetry,
  isRetrying,
  className,
}: {
  config: ErrorConfig;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}) {
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'text-destructive flex items-center gap-2 text-sm',
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>{message || config.message}</span>
      {config.showRetry && onRetry && (
        <Button
          onClick={onRetry}
          disabled={isRetrying}
          size="xs"
          variant="ghost"
          className="ml-auto"
        >
          <RefreshCw className={cn('size-3', isRetrying && 'animate-spin')} />
        </Button>
      )}
    </div>
  );
}

/**
 * Main error state component that renders the appropriate variant
 */
export function GroupErrorState({
  errorType = 'generic',
  message,
  onRetry,
  isRetrying = false,
  className,
  variant = 'page',
}: GroupErrorStateProps) {
  const config = ERROR_CONFIGS[errorType];

  if (variant === 'card') {
    return (
      <CardErrorState
        config={config}
        message={message}
        onRetry={onRetry}
        isRetrying={isRetrying}
        className={className}
      />
    );
  }

  if (variant === 'inline') {
    return (
      <InlineErrorState
        config={config}
        message={message}
        onRetry={onRetry}
        isRetrying={isRetrying}
        className={className}
      />
    );
  }

  return (
    <PageErrorState
      config={config}
      message={message}
      onRetry={onRetry}
      isRetrying={isRetrying}
      className={className}
    />
  );
}
