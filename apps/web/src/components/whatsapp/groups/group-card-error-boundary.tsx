/**
 * GroupCardErrorBoundary Component
 *
 * Error boundary wrapper for GroupCard components.
 * Prevents a single card failure from breaking the entire list.
 *
 * Requirements: 9.1, 9.2
 */

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { sanitizeErrorForLogging } from './group-error-state';

interface GroupCardErrorBoundaryProps {
  /** The child component to render */
  children: ReactNode;
  /** Fallback group ID for error display */
  groupId?: string;
  /** Callback when retry is clicked */
  onRetry?: () => void;
  /** Additional CSS classes */
  className?: string;
}

interface GroupCardErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary specifically for GroupCard components.
 * Catches rendering errors and displays a compact error state.
 */
export class GroupCardErrorBoundary extends Component<
  GroupCardErrorBoundaryProps,
  GroupCardErrorBoundaryState
> {
  constructor(props: GroupCardErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GroupCardErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log sanitized error for debugging (Requirements 9.4)
    const sanitizedMessage = sanitizeErrorForLogging(error);
    console.error('[GroupCard Error]', {
      message: sanitizedMessage,
      componentStack: errorInfo.componentStack,
      groupId: this.props.groupId,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Card
          className={cn(
            'border-destructive/20 bg-destructive/5',
            this.props.className,
          )}
        >
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <AlertTriangle className="text-destructive mb-2 size-8" />
            <p className="text-destructive text-sm font-medium">
              Failed to load group
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              An error occurred while rendering this group
            </p>
            <Button
              variant="ghost"
              size="xs"
              onClick={this.handleRetry}
              className="mt-3"
            >
              <RefreshCw className="mr-1 size-3" />
              Retry
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap GroupCard with error boundary
 */
export function withGroupCardErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  getGroupId?: (props: P) => string | undefined,
): React.FC<P & { onRetry?: () => void; className?: string }> {
  return function WithErrorBoundary(props) {
    const groupId = getGroupId?.(props);
    return (
      <GroupCardErrorBoundary
        groupId={groupId}
        onRetry={props.onRetry}
        className={props.className}
      >
        <WrappedComponent {...props} />
      </GroupCardErrorBoundary>
    );
  };
}
