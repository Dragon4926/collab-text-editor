import { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWorkspace } from '@/store/workspace';
import { pageFade } from '@/lib/motion';
import { Home } from '@/features/home/Home';

/**
 * Code splitting: each surface is loaded on demand with `React.lazy` +
 * dynamic `import()`. Vite turns every dynamic import into a separate chunk,
 * so the editor (TipTap + syntax highlighting) isn't downloaded until you
 * open a document, and the canvas code isn't downloaded until you open a
 * canvas. `Suspense` shows a fallback while a chunk loads.
 */
const DocPage = lazy(() => import('@/features/doc/DocPage').then((m) => ({ default: m.DocPage })));
const NotebookPage = lazy(() => import('@/features/notebook/NotebookPage').then((m) => ({ default: m.NotebookPage })));
const SpacePage = lazy(() => import('@/features/space/SpacePage').then((m) => ({ default: m.SpacePage })));
const BoardPage = lazy(() => import('@/features/board/BoardPage').then((m) => ({ default: m.BoardPage })));
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
        {!activeId || !kind ? (
          <Home />
        ) : (
          <Suspense fallback={<div className="page-view__loading" aria-label="Loading" />}>
            <Surface id={activeId} kind={kind} />
          </Suspense>
        )}
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
    case 'board':
      return <BoardPage pageId={id} />;
    case 'notebook':
      return <NotebookPage pageId={id} />;
    default:
      return null;
  }
}
