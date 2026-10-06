import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/store/workspace';
import { spring, withFocus } from '@/lib/motion';
import { Aurora } from './Aurora';
import './AppShell.css';

const SIDEBAR_W = 260; // keep in sync with --sidebar-w

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
}

/**
 * The window frame: aurora backdrop, a glass sidebar and an opaque content
 * area. The sidebar's width is animated with a spring rather than a CSS
 * transition so that toggling it repeatedly never "jumps".
 */
export function AppShell({ sidebar, children }: Props) {
  const open = useWorkspace((s) => s.sidebarOpen);
  const activeId = useWorkspace((s) => s.activeId);
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen);
  const narrow = useNarrow();

  // On phones the sidebar is a sheet over the content: start closed, and
  // close it once a page has been chosen.
  useEffect(() => {
    if (narrow) setSidebarOpen(false);
  }, [narrow, activeId, setSidebarOpen]);

  return (
    <>
      <Aurora />
      <div className="shell">
        <motion.aside
          className="shell__sidebar"
          initial={false}
          // the sidebar defocuses as it folds away, and sharpens as it returns
          animate={{ width: open ? SIDEBAR_W : 0, opacity: open ? 1 : 0, filter: open ? 'blur(0px)' : 'blur(8px)', transitionEnd: open ? { filter: 'none' } : undefined }}
          transition={withFocus(spring.smooth)}
          aria-hidden={!open}
        >
          <div className="shell__sidebar-inner">{sidebar}</div>
        </motion.aside>
        <main className="shell__main">{children}</main>
        <AnimatePresence>
          {narrow && open && (
            <motion.div
              className="shell__scrim"
              initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              animate={{ opacity: 1, backdropFilter: 'blur(4px)' }}
              exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function useNarrow() {
  const query = '(max-width: 760px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
