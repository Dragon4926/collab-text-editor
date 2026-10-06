import { useEffect } from 'react';
import { useHydrated } from '@/hooks/useHydrated';
import { seedWorkspace } from '@/store/seed';
import { useTheme } from '@/hooks/useTheme';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { AppShell } from '@/components/shell/AppShell';
import { Titlebar } from '@/components/shell/Titlebar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PageView } from '@/features/page/PageView';
import { CommandPalette } from '@/features/command/CommandPalette';

export function App() {
  const hydrated = useHydrated();
  useTheme();
  useGlobalShortcuts();

  // populate a tour on the very first launch
  useEffect(() => {
    if (hydrated) seedWorkspace();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <AppShell sidebar={<Sidebar />}>
      <Titlebar />
      <PageView />
      <CommandPalette />
    </AppShell>
  );
}
