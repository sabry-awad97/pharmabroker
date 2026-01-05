import type { AppRouterClient } from '@pharmabroker/api/routers/index';
import type { QueryClient } from '@tanstack/react-query';

import { createORPCClient } from '@orpc/client';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useState } from 'react';

import Header from '@/components/header';
import Sidebar from '@/components/sidebar';
import { ThemeProvider } from '@/components/theme-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { link } from '@/utils/orpc';

import '../index.css';

export interface RouterAppContext {
  orpc: ReturnType<typeof createTanstackQueryUtils<AppRouterClient>>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: 'PharmaBroker',
      },
      {
        name: 'description',
        content: 'AI-Powered Pharmaceutical Trading Platform',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
    ],
  }),
});

function RootComponent() {
  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [_orpcUtils] = useState(() => createTanstackQueryUtils(client));

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        {/* Windows-style layout: Title bar + Sidebar + Content */}
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          {/* Title Bar */}
          <Header />

          {/* Main Area: Sidebar + Content */}
          <div className="flex min-h-0 flex-1">
            {/* Sidebar Navigation */}
            <Sidebar />

            {/* Content Area */}
            <ScrollArea className="flex-1 bg-background">
              <Outlet />
            </ScrollArea>
          </div>
        </div>
        <Toaster richColors />
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
      <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
    </>
  );
}
