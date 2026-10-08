import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { nanoid } from 'nanoid';
import type { InkPoint, Stroke } from '@/store/types';
import { strokeBounds, strokeInLasso, sweepHitsStroke, translateStroke, unionBounds, type Box } from './geometry';
import { useInkTool } from './toolStore';
import { recognizeShape } from './shapes';

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
 *
 * • **Preview, then commit.** While erasing or moving, the working strokes
 *   live in local state (repainted at most once per frame) and are written
 *   to the owner only on pointer-up. Writing on every hit used to run a
 *   store update — and for sketch blocks a whole ProseMirror transaction —
 *   several times per pointermove, which is what made the eraser lag.
 *
 * • The eraser cursor is moved by writing straight to the SVG circle's
 *   attributes, so hovering doesn't re-render the surface at all.
 */
export function useInkCapture({ strokes, commit, toLocal, eraserRadius = 8 }: Options) {
  const tool = useInkTool();
  const [live, setLive] = useState<Stroke | null>(null);
  const [lasso, setLasso] = useState<number[][] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Strokes shown during an erase / move gesture, before they're committed,
   * tagged with the strokes they were derived from. The preview stays up
   * after pointer-up until the owner's new strokes arrive — a sketch block
   * commits through ProseMirror and re-renders a tick later, and clearing
   * the preview early would flash the erased strokes back for a frame.
   */
  const [preview, setPreview] = useState<{ base: Stroke[]; strokes: Stroke[] } | null>(null);
  const eraserRef = useRef<SVGCircleElement>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const gesture = useRef<{
    kind: 'draw' | 'erase' | 'lasso' | 'move' | null;
    before: Stroke[];
    working: Stroke[];
    start: [number, number];
    /** last eraser position, so each move erases along the swept path */
    last: [number, number];
    points: InkPoint[];
    /** draw-and-hold: where the pen last "settled", and the pending timer */
    anchor: [number, number];
    hold?: ReturnType<typeof setTimeout>;
    snapped: boolean;
  }>({ kind: null, before: [], working: [], start: [0, 0], last: [0, 0], points: [], anchor: [0, 0], snapped: false });

  /**
   * Draw-and-hold. Every time the pen moves more than a couple of units we
   * restart a 550 ms timer; if it fires, the pen has been still — try to
   * recognise the stroke as a line, rectangle or ellipse and swap it in.
   */
  const armHold = (x: number, y: number) => {
    const g = gesture.current;
    if (Math.hypot(x - g.anchor[0], y - g.anchor[1]) < 2.5 && g.hold) return;
    g.anchor = [x, y];
    clearTimeout(g.hold);
    g.hold = setTimeout(() => {
      if (g.kind !== 'draw' || g.snapped) return;
      const shape = recognizeShape(g.points);
      if (!shape) return;
      g.points = shape.points;
      g.snapped = true;
      setLive((l) => (l ? { ...l, points: shape.points } : l));
      navigator.vibrate?.(8); // a tiny haptic tick where supported
    }, 550);
  };

  const shown = preview && preview.base === strokes ? preview.strokes : strokes;
  useEffect(() => {
    if (preview && preview.base !== strokes) setPreview(null);
  }, [preview, strokes]);

  const selectionBox: Box | null = useMemo(() => {
    if (selected.size === 0) return null;
    return unionBounds(shown.filter((s) => selected.has(s.id)).map((s) => strokeBounds(s.points, 6)));
  }, [shown, selected]);

  /** repaint the working strokes on the next frame (coalescing many moves) */
  const schedulePreview = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      setPreview({ base: gesture.current.before, strokes: gesture.current.working });
    });
  };

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
        g.snapped = false;
        armHold(pt[0], pt[1]);
        const { color, size } = tool.settings[tool.pen];
        setLive({ id: nanoid(8), pen: tool.pen, color, size, points: [pt] });
      } else if (mode === 'erase') {
        g.kind = 'erase';
        g.last = [pt[0], pt[1]];
        eraseAlong(pt[0], pt[1]);
      } else if (mode === 'lasso') {
        g.kind = 'lasso';
        setLasso([[pt[0], pt[1]]]);
      }
    },
    [strokes, tool, selectionBox, toLocal],
  );

  /** erase everything the eraser touched on its way from the last sample to (x, y) */
  const eraseAlong = (x: number, y: number) => {
    const g = gesture.current;
    const [lx, ly] = g.last;
    g.last = [x, y];
    const next = g.working.filter((s) => !sweepHitsStroke(s, lx, ly, x, y, eraserRadius));
    if (next.length !== g.working.length) {
      g.working = next;
      schedulePreview();
    }
  };

  const moveEraserCursor = (x: number, y: number) => {
    const c = eraserRef.current;
    if (!c) return;
    c.setAttribute('cx', String(x));
    c.setAttribute('cy', String(y));
    c.style.visibility = 'visible';
  };

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const g = gesture.current;
      if (tool.mode === 'erase' || g.kind === 'erase') {
        const [x, y] = toLocal(e);
        moveEraserCursor(x, y);
      }
      if (!g.kind) return;
      const native = e.nativeEvent as PointerEvent;
      const events = native.getCoalescedEvents?.() ?? [native];

      if (g.kind === 'draw') {
        if (g.snapped) return; // the perfected shape stays put until pen-up
        for (const ev of events.length ? events : [native]) g.points.push(pointFrom(ev));
        const lastPt = g.points[g.points.length - 1];
        armHold(lastPt[0], lastPt[1]);
        setLive((l) => (l ? { ...l, points: g.points.slice() } : l));
      } else if (g.kind === 'erase') {
        for (const ev of events.length ? events : [native]) {
          const [x, y] = toLocal(ev);
          eraseAlong(x, y);
        }
      } else if (g.kind === 'lasso') {
        const [x, y] = toLocal(e);
        setLasso((l) => (l ? [...l, [x, y]] : l));
      } else if (g.kind === 'move') {
        const [x, y] = toLocal(e);
        const dx = x - g.start[0];
        const dy = y - g.start[1];
        g.working = g.before.map((s) => (selected.has(s.id) ? translateStroke(s, dx, dy) : s));
        schedulePreview();
      }
    },
    [tool.mode, toLocal, selected],
  );

  const onPointerUp = useCallback(() => {
    const g = gesture.current;
    clearTimeout(g.hold);
    g.hold = undefined;
    if (g.kind === 'draw' && live) {
      const stroke = { ...live, points: g.points };
      commit([...g.before, stroke], g.before);
      setLive(null);
    } else if (g.kind === 'lasso' && lasso) {
      setSelected(new Set(strokes.filter((s) => strokeInLasso(s, lasso)).map((s) => s.id)));
      setLasso(null);
    } else if (g.kind === 'erase' || g.kind === 'move') {
      // one write for the whole gesture
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (g.working !== g.before) commit(g.working, g.before);
      else setPreview(null);
    }
    g.kind = null;
  }, [live, lasso, strokes, commit]);

  const onPointerLeave = useCallback(() => {
    if (eraserRef.current) eraserRef.current.style.visibility = 'hidden';
  }, []);

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
    /** what to draw: the in-progress gesture's strokes, or the committed ones */
    strokes: shown,
    live,
    lasso,
    selected,
    selectionBox,
    eraserRef,
    mode: tool.mode,
    deleteSelection,
    recolorSelection,
    duplicateSelection,
    clearSelection,
  };
}
