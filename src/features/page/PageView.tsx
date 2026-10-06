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
const loaders = {
  doc: () => import('@/features/doc/DocPage'),
  notebook: () => import('@/features/notebook/NotebookPage'),
  space: () => import('@/features/space/SpacePage'),
  board: () => import('@/features/board/BoardPage'),
};
const DocPage = lazy(() => loaders.doc().then((m) => ({ default: m.DocPage })));
const NotebookPage = lazy(() => loaders.notebook().then((m) => ({ default: m.NotebookPage })));
const SpacePage = lazy(() => loaders.space().then((m) => ({ default: m.SpacePage })));
const BoardPage = lazy(() => loaders.board().then((m) => ({ default: m.BoardPage })));

/**
 * Warm the chunks once the app is idle, so the first visit to each surface
 * doesn't wait on the network mid-transition. The initial load stays small;
 * the rest arrives while the user is reading.
 */
export function preloadSurfaces() {
  const run = () => Object.values(loaders).forEach((load) => void load());
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}
import './PageView.css';

/**
 * Chooses the surface for the active page.
 *
 * Keying the motion.div by page id tells framer-motion "this is a different
 * page". `AnimatePresence mode="popLayout"` keeps the outgoing page mounted
 * for its exit animation but *pops it out of the layout* (absolutely
 * positioned where it was), so the incoming page can animate in at the same
 * time. Overlapping the two — one defocusing, one sharpening — gives a true
 * crossfade instead of a fade-out-then-fade-in, and halves the wait.
 */
export function PageView() {
  const activeId = useWorkspace((s) => s.activeId);
  const kind = useWorkspace((s) => (s.activeId ? s.pages[s.activeId]?.kind : undefined));

  return (
    <AnimatePresence mode="popLayout" initial={false}>
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
