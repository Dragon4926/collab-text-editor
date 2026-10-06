import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useHydrated } from '@/hooks/useHydrated';
import { seedWorkspace } from '@/store/seed';
import { useTheme } from '@/hooks/useTheme';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { AppShell } from '@/components/shell/AppShell';
import { Titlebar } from '@/components/shell/Titlebar';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PageView, preloadSurfaces } from '@/features/page/PageView';
import { CommandPalette } from '@/features/command/CommandPalette';
import { Toaster } from '@/components/ui/Toast';

export function App() {
  const hydrated = useHydrated();
  useTheme();
  useGlobalShortcuts();

  // populate a tour on the very first launch
  useEffect(() => {
    if (!hydrated) return;
    seedWorkspace();
    preloadSurfaces();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    // reducedMotion="user": framer-motion skips transform/blur animations
    // (keeping opacity fades) when the OS asks for reduced motion
    <MotionConfig reducedMotion="user">
      <AppShell sidebar={<Sidebar />}>
        <Titlebar />
        <PageView />
        <CommandPalette />
        <Toaster />
      </AppShell>
    </MotionConfig>
  );
}
