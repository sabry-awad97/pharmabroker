'use client';

import { Link } from '@tanstack/react-router';
import { Home, Search, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-4">
      {/* Animated 404 */}
      <div className="relative mb-8">
        <div className="from-primary/20 via-primary/10 bg-linear-to-br to-transparent bg-clip-text text-[12rem] leading-none font-black tracking-tighter text-transparent select-none">
          404
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            {/* Floating pills animation */}
            <div className="bg-primary/20 absolute -top-8 -left-12 h-4 w-8 animate-bounce rounded-full [animation-delay:0ms]" />
            <div className="bg-primary/30 absolute -top-4 left-8 h-3 w-6 animate-bounce rounded-full [animation-delay:150ms]" />
            <div className="bg-primary/20 absolute top-0 -right-8 h-4 w-8 animate-bounce rounded-full [animation-delay:300ms]" />
            <div className="bg-primary/25 absolute top-8 -left-6 h-3 w-6 animate-bounce rounded-full [animation-delay:450ms]" />

            {/* Search icon with pulse */}
            <div className="relative">
              <div className="bg-primary/20 absolute inset-0 animate-ping rounded-full" />
              <div className="bg-muted relative rounded-full p-6">
                <Search className="text-muted-foreground h-12 w-12" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      <div className="mb-8 max-w-md text-center">
        <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
        <p className="text-muted-foreground text-sm">
          Looks like this prescription got lost in transit. The page you're
          looking for doesn't exist or has been moved.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.history.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go back
        </Button>
        <Button size="sm" asChild>
          <Link to="/">
            <Home className="mr-2 h-4 w-4" />
            Home
          </Link>
        </Button>
      </div>

      {/* Decorative bottom element */}
      <div className="text-muted-foreground mt-16 flex items-center gap-2 text-xs">
        <div className="bg-border h-px w-12" />
        <span>PharmaBroker</span>
        <div className="bg-border h-px w-12" />
      </div>
    </div>
  );
}
