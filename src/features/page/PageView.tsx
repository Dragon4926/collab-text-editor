import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/store/workspace';
import { pageFade } from '@/lib/motion';
import { Home } from '@/features/home/Home';
import { DocPage } from '@/features/doc/DocPage';
import { NotebookPage } from '@/features/notebook/NotebookPage';
import { SpacePage } from '@/features/space/SpacePage';
import './PageView.css';

/**
 * Chooses the surface for the active page.
 *
 * `AnimatePresence mode="wait"` keeps the outgoing page mounted until its
 * exit animation finishes, then mounts the next one. Keying the motion.div
 * by page id is what tells framer-motion "this is a different page".
 */
export function PageView() {
  const activeId = useWorkspace((s) => s.activeId);
  const kind = useWorkspace((s) => (s.activeId ? s.pages[s.activeId]?.kind : undefined));

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={activeId ?? 'home'} className="page-view" variants={pageFade} initial="initial" animate="animate" exit="exit">
        {!activeId || !kind ? <Home /> : <Surface id={activeId} kind={kind} />}
      </motion.div>
    </AnimatePresence>
  );
}

function Surface({ id, kind }: { id: string; kind: string }) {
  switch (kind) {
    case 'doc':
      return <DocPage pageId={id} />;
    case 'space':
      return <SpacePage pageId={id} />;
    case 'notebook':
      return <NotebookPage pageId={id} />;
    default:
      return <div className="page-view__todo">{kind} surface coming soon</div>;
  }
}
