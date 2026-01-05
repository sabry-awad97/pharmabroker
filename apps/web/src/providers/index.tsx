import { DevtoolsProvider } from './devtools-provider';
import { ThemeProvider } from './theme-provider';

export { useTheme } from './theme-provider';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      disableTransitionOnChange
      storageKey="vite-ui-theme"
    >
      {children}
      <DevtoolsProvider />
    </ThemeProvider>
  );
}
