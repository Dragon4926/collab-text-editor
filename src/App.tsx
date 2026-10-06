import { useHydrated } from '@/hooks/useHydrated';
import { useTheme } from '@/hooks/useTheme';
import { AppShell } from '@/components/shell/AppShell';
import { Titlebar } from '@/components/shell/Titlebar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PageView } from '@/features/page/PageView';

export function App() {
  const hydrated = useHydrated();
  useTheme();

  if (!hydrated) return null;

  return (
    <AppShell sidebar={<Sidebar />}>
      <Titlebar />
      <PageView />
    </AppShell>
  );
}
