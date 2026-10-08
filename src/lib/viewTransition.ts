import { flushSync } from 'react-dom';

/**
 * Cross-fades driven by the View Transitions API.
 *
 * Why not animate the React tree (framer-motion) when switching pages?
 * Mounting a page is heavy — an editor, an infinite canvas, a PDF renderer —
 * and that work runs on the main thread exactly when the animation should
 * start. The first ~150 ms of the fade are lost and the rest stutters.
 *
 * A view transition instead freezes the screen, lets React render the new
 * page, then animates *snapshots* of the old and new page on the compositor.
 * Whatever the main thread does next (drawing PDF pages, laying out cards)
 * cannot drop a frame of the fade.
 *
 * `kind` lands on <html data-vt="…"> for the duration, so global.css can give
 * each kind of transition its own choreography.
 */
export type TransitionKind = 'page' | 'theme';

let running: ViewTransition | null = null;

export function withViewTransition(kind: TransitionKind, update: () => void, prepare?: () => Promise<unknown> | undefined) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || document.hidden) {
    update();
    return;
  }
  // a second click mid-flight: jump to the end of the first one
  running?.skipTransition();
  const root = document.documentElement;
  root.dataset.vt = kind;
  const t = document.startViewTransition(async () => {
    // e.g. fetch the code for the next surface, so the "after" snapshot is
    // the real page rather than a loading spinner
    await prepare?.()?.catch(() => undefined);
    flushSync(update);
  });
  running = t;
  t.finished.finally(() => {
    if (running !== t) return;
    running = null;
    delete root.dataset.vt;
  });
}

/* Page surfaces register a loader so a transition can wait for their code. */
let surfaceLoader: ((kind: string) => Promise<unknown>) | null = null;
export const registerSurfaceLoader = (fn: (kind: string) => Promise<unknown>) => void (surfaceLoader = fn);
export const loadSurfaceFor = (kind: string | undefined) => (kind && surfaceLoader ? surfaceLoader(kind) : undefined);
