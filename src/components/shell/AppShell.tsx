import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useWorkspace } from '@/store/workspace';
import { spring } from '@/lib/motion';
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

  return (
    <>
      <Aurora />
      <div className="shell">
        <motion.aside
          className="shell__sidebar"
          initial={false}
          animate={{ width: open ? SIDEBAR_W : 0, opacity: open ? 1 : 0 }}
          transition={spring.smooth}
          aria-hidden={!open}
        >
          <div className="shell__sidebar-inner">{sidebar}</div>
        </motion.aside>
        <main className="shell__main">{children}</main>
      </div>
    </>
  );
}
