import { useHydrated } from '@/hooks/useHydrated';
import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/shell/AppShell';

export function App() {
  const hydrated = useHydrated();
  useTheme();

  if (!hydrated) return null;

  return (
    <AppShell sidebar={<div />}>
      <div />
    </AppShell>
  );
}
