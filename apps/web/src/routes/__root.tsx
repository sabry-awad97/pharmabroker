import type { AppRouterClient } from '@pharmabroker/api/routers/index';
import type { QueryClient } from '@tanstack/react-query';

import { createORPCClient } from '@orpc/client';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router';
import { useState } from 'react';

import { Header, Sidebar } from '@/components/layout';
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
      <div className="bg-background flex h-screen flex-col overflow-hidden">
        <Header />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <ScrollArea className="bg-background flex-1">
            <Outlet />
          </ScrollArea>
        </div>
      </div>
      <Toaster richColors />
    </>
  );
}
