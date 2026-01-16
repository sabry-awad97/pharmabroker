import type { AppRouterClient } from '@pharmabroker/api/routers/index';
import type { QueryClient } from '@tanstack/react-query';

import { createORPCClient } from '@orpc/client';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import { NotFound, ErrorBoundary } from '@/components/errors';
import { Header, Sidebar } from '@/components/layout';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Toaster } from '@/components/ui/sonner';
import { useActiveSession } from '@/stores/active-session.store';
import { link } from '@/utils/orpc';

import '../index.css';

export interface RouterAppContext {
  orpc: ReturnType<typeof createTanstackQueryUtils<AppRouterClient>>;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorBoundary,
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
  const activeSession = useActiveSession();
  const navigate = useNavigate();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Routes that don't require an active session
  const publicRoutes = ['/', '/login', '/sessions/pick'];
  const isPublicRoute = publicRoutes.some(
    route => currentPath === route || currentPath.startsWith('/login'),
  );

  // Redirect to session picker if no active session and trying to access protected routes
  useEffect(() => {
    if (!activeSession && !isPublicRoute) {
      navigate({ to: '/sessions/pick' });
    }
  }, [activeSession, isPublicRoute, navigate]);

  // For session picker route, render without sidebar/header
  if (currentPath === '/sessions/pick') {
    return (
      <>
        <HeadContent />
        <Outlet />
        <Toaster richColors />
      </>
    );
  }

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
