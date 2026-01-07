import { ConnectionStatusIndicator } from '../components/connection-status-indicator';
import { DevtoolsProvider } from './devtools-provider';
import { RealtimeProvider } from './realtime-provider';
import { ThemeProvider } from './theme-provider';

export { useTheme } from './theme-provider';
export { useRealtimeStatus } from './realtime-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Root providers component that wraps the entire application.
 *
 * Provider order (outer to inner):
 * 1. ThemeProvider - Theme management
 * 2. RealtimeProvider - Real-time SSE connection (requires QueryClientProvider)
 * 3. Children (app content)
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
        {children}
        <ConnectionStatusIndicator />
      </RealtimeProvider>
      <DevtoolsProvider />
    </ThemeProvider>
  );
}
