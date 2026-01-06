'use client';

import type { ErrorComponentProps } from '@tanstack/react-router';

import { Link } from '@tanstack/react-router';
import { Home, RefreshCw, AlertTriangle, Bug, Copy, Check } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function ErrorBoundary({ error, reset }: ErrorComponentProps) {
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const errorMessage =
    error instanceof Error ? error.message : 'An unexpected error occurred';
  const errorStack = error instanceof Error ? error.stack : undefined;

  const copyError = async () => {
    const text = `Error: ${errorMessage}\n\nStack:\n${errorStack || 'No stack trace available'}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      {/* Animated error visual */}
      <div className="relative mb-8">
        {/* Glitch effect background */}
        <div className="absolute inset-0 flex items-center justify-center opacity-20">
          <div className="text-destructive animate-pulse text-[8rem] font-black">
            !
          </div>
        </div>

        {/* Main icon container */}
        <div className="relative">
          {/* Orbiting elements */}
          <div className="absolute inset-0 animate-spin [animation-duration:8s]">
            <div className="bg-destructive/40 absolute -top-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full" />
          </div>
          <div className="absolute inset-0 animate-spin [animation-direction:reverse] [animation-duration:6s]">
            <div className="bg-destructive/30 absolute top-1/2 -right-2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" />
          </div>
          <div className="absolute inset-0 animate-spin [animation-duration:10s]">
            <div className="bg-destructive/50 absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" />
          </div>

          {/* Central icon */}
          <div className="bg-destructive/10 border-destructive/20 relative rounded-2xl border p-8">
            <AlertTriangle className="text-destructive h-16 w-16" />
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="mb-6 max-w-lg text-center">
        <h1 className="mb-2 text-2xl font-bold">Something went wrong</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          We encountered an unexpected error. Don't worry, our team has been
          notified and is working on it.
        </p>

        {/* Error message box */}
        <div className="bg-muted/50 border-border rounded-lg border p-4 text-left">
          <div className="flex items-start gap-3">
            <Bug className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-mono text-sm break-words">
                {errorMessage}
              </p>
            </div>
          </div>

          {errorStack && (
            <div className="border-border mt-3 border-t pt-3">
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                {showDetails ? 'Hide' : 'Show'} technical details
              </button>

              {showDetails && (
                <pre className="text-muted-foreground bg-background mt-2 max-h-32 overflow-auto rounded p-2 text-xs">
                  {errorStack}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={reset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
        <Button size="sm" asChild>
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>

      {/* Copy error button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={copyError}
        className="text-muted-foreground"
      >
        {copied ? (
          <>
            <Check className="mr-2 h-3.5 w-3.5 text-green-500" />
            Copied!
          </>
        ) : (
          <>
            <Copy className="mr-2 h-3.5 w-3.5" />
            Copy error details
          </>
        )}
      </Button>

      {/* Decorative bottom element */}
      <div className="text-muted-foreground mt-12 flex items-center gap-2 text-xs">
        <div className="bg-border h-px w-12" />
        <span>PharmaBroker</span>
        <div className="bg-border h-px w-12" />
      </div>
    </div>
  );
}
