import { Suspense, use, type ComponentType } from 'react';
import { useWorkspace } from '@/store/workspace';
import { registerSurfaceLoader } from '@/lib/viewTransition';
import { Home } from '@/features/home/Home';
import './PageView.css';

/**
 * Code splitting: each surface is loaded on demand with a dynamic
 * `import()`. Vite turns every dynamic import into a separate chunk, so the
 * editor (TipTap + syntax highlighting) isn't downloaded until you open a
 * document, and the canvas code isn't downloaded until you open a canvas.
 */
type Surface = ComponentType<{ pageId: string }>;
const loaders: Record<string, () => Promise<Surface>> = {
  doc: () => import('@/features/doc/DocPage').then((m) => m.DocPage),
  notebook: () => import('@/features/notebook/NotebookPage').then((m) => m.NotebookPage),
  space: () => import('@/features/space/SpacePage').then((m) => m.SpacePage),
  board: () => import('@/features/board/BoardPage').then((m) => m.BoardPage),
  pdf: () => import('@/features/pdf/PdfPage').then((m) => m.PdfPage),
};

/*
 * Loaded surfaces are kept here, so once a chunk has arrived the surface
 * renders synchronously. (`React.lazy` suspends for a tick on its first
 * render even when the code is already loaded — and a page switch would then
 * cross-fade into a spinner.)
 */
const surfaces: Record<string, Surface> = {};
const pending: Record<string, Promise<Surface>> = {};

function loadSurface(kind: string): Promise<Surface> {
  pending[kind] ??= loaders[kind]().then((s) => (surfaces[kind] = s));
  return pending[kind];
}
// page switches wait for the next surface's code before cross-fading
registerSurfaceLoader((kind) => (loaders[kind] ? loadSurface(kind) : Promise.resolve()));

/**
 * Warm the chunks once the app is idle, so the first visit to each surface
 * doesn't wait on the network. The initial load stays small; the rest
 * arrives while the user is reading.
 */
export function preloadSurfaces() {
  const run = () => Object.keys(loaders).forEach((k) => void loadSurface(k));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
}

/**
 * Chooses the surface for the active page.
 *
 * Switching pages is animated by a view transition (lib/viewTransition.ts):
 * the page area carries `view-transition-name: page`, so the browser
 * cross-fades just that region with a blur while the sidebar stays put.
 */
export function PageView() {
  const activeId = useWorkspace((s) => s.activeId);
  const kind = useWorkspace((s) => (s.activeId ? s.pages[s.activeId]?.kind : undefined));

  return (
    <div key={activeId ?? 'home'} className="page-view">
      {!activeId || !kind ? (
        <Home />
      ) : (
        <Suspense fallback={<div className="page-view__loading" aria-label="Loading" />}>
          <SurfaceFor id={activeId} kind={kind} />
        </Suspense>
      )}
    </div>
  );
}

function SurfaceFor({ id, kind }: { id: string; kind: string }) {
  if (!loaders[kind]) return null;
  const Surface = surfaces[kind] ?? use(loadSurface(kind));
  return <Surface pageId={id} />;
}
