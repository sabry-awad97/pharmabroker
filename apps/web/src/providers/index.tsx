import { ConnectionStatusIndicator } from '../components/connection-status-indicator';
import { useAutoSelectSession } from '../hooks/use-auto-select-session';
import { DevtoolsProvider } from './devtools-provider';
import { RealtimeProvider } from './realtime-provider';
import { ThemeProvider } from './theme-provider';

export { useTheme } from './theme-provider';
export { useRealtimeStatus } from './realtime-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Auto-select session component
 * Runs the auto-select hook within the provider tree
 */
function AutoSelectSession({ children }: { children: React.ReactNode }) {
  useAutoSelectSession();
  return <>{children}</>;
}

/**
 * Root providers component that wraps the entire application.
 *
 * Provider order (outer to inner):
 * 1. ThemeProvider - Theme management
 * 2. RealtimeProvider - Real-time SSE connection (requires QueryClientProvider)
 * 3. AutoSelectSession - Auto-selects session if only one exists
 * 4. Children (app content)
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      <RealtimeProvider>
        <AutoSelectSession>
          {children}
          <ConnectionStatusIndicator />
        </AutoSelectSession>
      </RealtimeProvider>
      <DevtoolsProvider />
    </ThemeProvider>
  );
}
