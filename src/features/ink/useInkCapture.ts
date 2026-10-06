import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { nanoid } from 'nanoid';
import type { InkPoint, Stroke } from '@/store/types';
import { hitStroke, strokeBounds, strokeInLasso, translateStroke, unionBounds, type Box } from './geometry';
import { useInkTool } from './toolStore';

interface Options {
  strokes: Stroke[];
  /** replace the strokes; `before` is the value prior to the gesture, for undo */
  commit: (next: Stroke[], before: Stroke[]) => void;
  /** map a pointer event to this surface's local coordinates */
  toLocal: (e: { clientX: number; clientY: number }) => [number, number];
  /** eraser radius in local units */
  eraserRadius?: number;
}

/**
 * Pointer handling for every ink surface: drawing, erasing and lasso
 * selection.
 *
 * Key ideas:
 *
 * • **Pointer Events** unify mouse, touch and stylus. `pointerType` tells
 *   them apart and `pressure` gives stylus force (mice report 0.5).
 *
 * • **Pointer capture** (`setPointerCapture`) keeps delivering move events to
 *   us even when the pointer leaves the element mid-stroke.
 *
 * • **Coalesced events**: browsers fire at most one pointermove per frame, but
 *   a stylus samples at 120–240 Hz. `getCoalescedEvents()` returns the
 *   in-between samples, giving much smoother curves on fast strokes.
 *
 * • **Palm rejection**: once a pen has been seen, `penOnly` makes touch input
 *   ignored for drawing, so a resting palm doesn't leave marks.
 *
 * • A whole gesture (one erase swipe, one lasso drag) is committed as *one*
 *   history entry, so undo reverses the gesture, not each pointermove.
 */
export function useInkCapture({ strokes, commit, toLocal, eraserRadius = 8 }: Options) {
  const tool = useInkTool();
  const [live, setLive] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<number[][] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [eraserAt, setEraserAt] = useState<[number, number] | null>(null);

  const gesture = useRef<{
    kind: 'draw' | 'erase' | 'lasso' | 'move' | null;
    before: Stroke[];
    working: Stroke[];
    start: [number, number];
    points: InkPoint[];
  }>({ kind: null, before: [], working: [], start: [0, 0], points: [] });

  const selectionBox: Box | null = useMemo(() => {
    if (selected.size === 0) return null;
    return unionBounds(strokes.filter((s) => selected.has(s.id)).map((s) => strokeBounds(s.points, 6)));
  }, [strokes, selected]);

  const pointFrom = (e: { clientX: number; clientY: number; pressure: number; pointerType: string }): InkPoint => {
    const [x, y] = toLocal(e);
    // a mouse reports 0.5 (or 0 on hover); keep 0.5 so we know to simulate pressure
    const p = e.pointerType === 'pen' ? Math.max(0.05, e.pressure) : 0.5;
    return [x, y, p];
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.pointerType === 'pen' && !tool.penOnly) tool.setPenOnly(true);
      if (tool.penOnly && e.pointerType === 'touch') return; // palm rejection
      if (tool.mode === 'pan') return;

      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      e.preventDefault();
      const pt = pointFrom(e);
      const g = gesture.current;
      g.before = strokes;
      g.working = strokes;
      g.start = [pt[0], pt[1]];

      // stylus barrel button or right-click-drag acts as an eraser
      const mode = e.button === 5 || e.buttons === 32 ? 'erase' : tool.mode;

      if (mode === 'lasso' && selectionBox && pt[0] >= selectionBox.x && pt[0] <= selectionBox.x + selectionBox.w && pt[1] >= selectionBox.y && pt[1] <= selectionBox.y + selectionBox.h) {
        g.kind = 'move';
        return;
      }
      setSelected(new Set());

      if (mode === 'draw') {
        g.kind = 'draw';
        g.points = [pt];
        const { color, size } = tool.settings[tool.pen];
        setLive({ id: nanoid(8), pen: tool.pen, color, size, points: [pt] });
      } else if (mode === 'erase') {
        g.kind = 'erase';
        eraseAt(pt[0], pt[1]);
      } else if (mode === 'lasso') {
        g.kind = 'lasso';
        setLasso([[pt[0], pt[1]]]);
      }
    },
    [strokes, tool, selectionBox, toLocal],
  );

  const eraseAt = (x: number, y: number) => {
    const g = gesture.current;
    const next = g.working.filter((s) => !hitStroke(s, x, y, eraserRadius));
    if (next.length !== g.working.length) {
      g.working = next;
      commit(next, g.before);
    }
  };

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gesture.current;
      if (tool.mode === 'erase' || g.kind === 'erase') {
        const [x, y] = toLocal(e);
        setEraserAt([x, y]);
      }
      if (!g.kind) return;
      const native = e.nativeEvent as PointerEvent;
      const events = native.getCoalescedEvents?.() ?? [native];

      if (g.kind === 'draw') {
        for (const ev of events.length ? events : [native]) g.points.push(pointFrom(ev));
        setLive((l) => (l ? { ...l, points: g.points.slice() } : l));
      } else if (g.kind === 'erase') {
        for (const ev of events.length ? events : [native]) {
          const [x, y] = toLocal(ev);
          eraseAt(x, y);
        }
      } else if (g.kind === 'lasso') {
        const [x, y] = toLocal(e);
        setLasso((l) => (l ? [...l, [x, y]] : l));
      } else if (g.kind === 'move') {
        const [x, y] = toLocal(e);
        const dx = x - g.start[0];
        const dy = y - g.start[1];
        g.working = g.before.map((s) => (selected.has(s.id) ? translateStroke(s, dx, dy) : s));
        commit(g.working, g.before);
      }
    },
    [tool.mode, toLocal, selected],
  );

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    if (g.kind === 'draw' && live) {
      const stroke = { ...live, points: g.points };
      commit([...g.before, stroke], g.before);
      setLive(null);
    } else if (g.kind === 'lasso' && lasso) {
      setSelected(new Set(strokes.filter((s) => strokeInLasso(s, lasso)).map((s) => s.id)));
      setLasso(null);
    }
    g.kind = null;
  }, [live, lasso, strokes, commit]);

  const onPointerLeave = useCallback(() => setEraserAt(null), []);

  /* ----- selection actions ----- */
  const deleteSelection = () => {
    commit(
      strokes.filter((s) => !selected.has(s.id)),
      strokes,
    );
    setSelected(new Set());
  };
  const recolorSelection = (color: string) =>
    commit(
      strokes.map((s) => (selected.has(s.id) ? { ...s, color } : s)),
      strokes,
    );
  const duplicateSelection = () => {
    const copies = strokes.filter((s) => selected.has(s.id)).map((s) => ({ ...translateStroke(s, 20, 20), id: nanoid(8) }));
    commit([...strokes, ...copies], strokes);
    setSelected(new Set(copies.map((c) => c.id)));
  };
  const clearSelection = () => setSelected(new Set());

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onPointerLeave },
    live,
    lasso,
    selected,
    selectionBox,
    eraserAt,
    mode: tool.mode,
    deleteSelection,
    recolorSelection,
    duplicateSelection,
    clearSelection,
  };
}
