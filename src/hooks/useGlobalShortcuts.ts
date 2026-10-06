import { useEffect } from 'react';
import { useWorkspace } from '@/store/workspace';
import { isMod } from '@/components/ui/Kbd';

/**
 * App-wide keyboard shortcuts, registered once on `window`.
 *
 *   Ctrl+K          command palette (Ctrl+P also works)
 *   Alt+N           new document (browsers reserve Ctrl+N for a new window)
 *   Ctrl+\          toggle sidebar
 *   Ctrl+Shift+L    toggle light / dark
 *   F2              rename the current page
 *
 * We read the store with getState() inside the handler instead of
 * subscribing, so the listener never needs to be re-registered.
 */
/** Fired on F2; the page header (documents) or breadcrumb (canvases) listens. */
export const RENAME_EVENT = 'lumen:rename';

export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useWorkspace.getState();
      const key = e.key.toLowerCase();

      if (isMod(e) && (key === 'k' || key === 'p') && !e.shiftKey) {
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
      } else if (e.key === 'F2' && s.activeId) {
        // F2 is the Windows "rename" key, as in File Explorer
        e.preventDefault();
        window.dispatchEvent(new Event(RENAME_EVENT));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
