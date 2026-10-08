import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/store/workspace';
import { spring } from '@/lib/motion';
import './AppShell.css';

const SIDEBAR_W = 260; // keep in sync with --sidebar-w

interface Props {
  sidebar: ReactNode;
  children: ReactNode;
}

/**
 * The window frame: a sidebar tinted with a soft aurora, and an opaque
 * content area. Both paint their own solid backgrounds — see AppShell.css. The sidebar's width is animated with a spring rather than a CSS
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
      <div className="shell">
        <motion.aside
          className="shell__sidebar"
          initial={false}
          // only width animates on the panel itself. A blur filter here would
          // put the whole sidebar on a fresh compositing layer every frame of
          // the spring — the source of the open/close flicker on Windows.
          animate={{ width: open ? SIDEBAR_W : 0 }}
          transition={spring.smooth}
          // closed: out of the tab order and the accessibility tree
          inert={!open}
        >
          <motion.div className="shell__sidebar-inner" initial={false} animate={{ opacity: open ? 1 : 0 }} transition={{ duration: open ? 0.24 : 0.12 }}>
            {sidebar}
          </motion.div>
        </motion.aside>
        <main className="shell__main">{children}</main>
        <AnimatePresence>
          {narrow && open && (
            <motion.div
              className="shell__scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
