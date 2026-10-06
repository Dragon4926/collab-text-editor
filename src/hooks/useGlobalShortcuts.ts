import { useEffect } from 'react';
import { useWorkspace } from '@/store/workspace';
import { isMod } from '@/components/ui/Kbd';

/**
 * App-wide keyboard shortcuts, registered once on `window`.
 *
 *   ⌘K        command palette
 *   ⌘N / ⌥N   new document (browsers reserve ⌘N, so ⌥N is the fallback)
 *   ⌘\        toggle sidebar
 *   ⌘⇧L       toggle light / dark
 *
 * We read the store with getState() inside the handler instead of
 * subscribing, so the listener never needs to be re-registered.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkspace.getState();
      const key = e.key.toLowerCase();

      if (isMod(e) && key === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
      } else if ((isMod(e) && key === 'n') || (e.altKey && e.code === 'KeyN')) {
        e.preventDefault();
        s.setActive(s.createPage('doc'));
      } else if (isMod(e) && key === '\\') {
        e.preventDefault();
        s.setSidebarOpen(!s.sidebarOpen);
      } else if (isMod(e) && e.shiftKey && key === 'l') {
        e.preventDefault();
        const dark = document.documentElement.dataset.theme === 'dark';
        s.setTheme(dark ? 'light' : 'dark');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
