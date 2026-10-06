import { useCallback, useRef } from 'react';
import type { Stroke } from '@/store/types';
import { useHistory } from '@/hooks/useHistory';

/**
 * Glue between an ink surface and wherever its strokes are stored.
 *
 * `useInkCapture` calls `commit(next, before)` many times during a gesture
 * (an eraser swipe removes strokes as it goes). We only want ONE undo step
 * per gesture, so we record `before` the first time we see it and ignore
 * repeats with the same reference.
 */
export function useInkDocument(strokes: Stroke[], save: (next: Stroke[]) => void) {
  const history = useHistory<Stroke[]>();
  const lastBefore = useRef<Stroke[] | null>(null);

  const commit = useCallback(
    (next: Stroke[], before: Stroke[]) => {
      if (lastBefore.current !== before) {
        history.record(before);
        lastBefore.current = before;
      }
      save(next);
    },
    [history, save],
  );

  const undo = useCallback(() => {
    const prev = history.undo(strokes);
    if (prev) {
      lastBefore.current = null;
      save(prev);
    }
  }, [history, strokes, save]);

  const redo = useCallback(() => {
    const next = history.redo(strokes);
    if (next) {
      lastBefore.current = null;
      save(next);
    }
  }, [history, strokes, save]);

  const clear = useCallback(() => {
    if (strokes.length) commit([], strokes);
    lastBefore.current = null;
  }, [strokes, commit]);

  return { commit, undo, redo, clear, canUndo: history.canUndo, canRedo: history.canRedo };
}
