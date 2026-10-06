import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { Circle, Diamond, Eraser, Hand, MousePointer2, MoveUpRight, PaintBucket, PenTool, Redo2, Square, Trash2, Type, Undo2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import type { BoardElement, BoardShape, ID, InkPoint, PenKind, ShapeKind, Stroke } from '@/store/types';
import { useHistory } from '@/hooks/useHistory';
import { isMod } from '@/components/ui/Kbd';
import { spring } from '@/lib/motion';
import { cameraStyles, useCamera } from '@/features/canvas/useCamera';
import { ZoomControls } from '@/features/canvas/ZoomControls';
import { InkDefs, StrokePath, inkFill } from '@/features/ink/InkLayer';
import { INK_COLORS, PENS, PEN_ORDER } from '@/features/ink/pens';
import { unionBounds } from '@/features/ink/geometry';
import { useInkTool } from '@/features/ink/toolStore';
import { TEXT_LINE, boxesIntersect, diamondPath, elementBounds, hitElement, normaliseShape, translateElement } from './boardModel';
import '@/features/canvas/canvas.css';
import './board.css';

type Tool = 'select' | 'hand' | 'pen' | 'eraser' | ShapeKind | 'arrow' | 'text';

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof Hand }[] = [
  { id: 'select', label: 'Select', key: 'v', Icon: MousePointer2 },
  { id: 'hand', label: 'Hand', key: 'h', Icon: Hand },
  { id: 'pen', label: 'Draw', key: 'p', Icon: PenTool },
  { id: 'eraser', label: 'Eraser', key: 'e', Icon: Eraser },
  { id: 'rect', label: 'Rectangle', key: 'r', Icon: Square },
  { id: 'ellipse', label: 'Ellipse', key: 'o', Icon: Circle },
  { id: 'diamond', label: 'Diamond', key: 'd', Icon: Diamond },
  { id: 'arrow', label: 'Arrow', key: 'a', Icon: MoveUpRight },
  { id: 'text', label: 'Text', key: 't', Icon: Type },
];

interface Gesture {
  kind: 'draw' | 'erase' | 'shape' | 'move' | 'marquee' | 'resize' | 'arrow-end';
  start: [number, number];
  before: BoardElement[];
  changed: boolean;
  points?: InkPoint[];
  origin?: BoardElement[];
  end?: 1 | 2;
}

/**
 * The whiteboard: an infinite canvas mixing pressure-sensitive ink with
 * vector shapes, arrows and text — think Apple Freeform or Excalidraw.
 *
 * Everything is rendered into ONE world-space SVG. Pointer events are
 * handled once on the viewport; we find which element was hit by walking up
 * from `event.target` to the nearest `[data-el]` attribute ("event
 * delegation"), which is cheaper than attaching handlers to every element.
 */
export function BoardPage({ pageId }: { pageId: ID }) {
  const board = useWorkspace((s) => s.pages[pageId]?.board);
  const mutatePage = useWorkspace((s) => s.mutatePage);
  const pen = useInkTool((s) => s.pen);
  const setPen = useInkTool((s) => s.setPen);
  const filterId = `board-${useId().replace(/:/g, '')}`;

  // an empty board invites drawing; one with content opens ready to select
  const [tool, setTool] = useState<Tool>(() => (board?.elements.length ? 'select' : 'pen'));
  const [color, setColor] = useState('#1d1d1f');
  const [size, setSize] = useState(2);
  const [fill, setFill] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoardElement | null>(null);
  const [marquee, setMarquee] = useState<[number, number, number, number] | null>(null);
  const [eraserAt, setEraserAt] = useState<[number, number] | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const history = useHistory<BoardElement[]>();

  const onSettle = useCallback((c: { x: number; y: number; z: number }) => mutatePage(pageId, (p) => void (p.board!.camera = c)), [mutatePage, pageId]);
  const cam = useCamera({ initial: board?.camera ?? { x: 0, y: 0, z: 1 }, onSettle });
  const z = cam.camera.z;

  const elements = board?.elements ?? [];
  const current = () => useWorkspace.getState().pages[pageId].board!.elements;
  const setElements = useCallback(
    (next: BoardElement[]) =>
      mutatePage(pageId, (p) => {
        p.board!.elements = next;
      }),
    [mutatePage, pageId],
  );
  const commit = (next: BoardElement[]) => {
    history.record(current());
    setElements(next);
  };

  const selBox = useMemo(() => unionBounds(elements.filter((e) => selected.has(e.id)).map(elementBounds)), [elements, selected]);
  const single = selected.size === 1 ? elements.find((e) => selected.has(e.id)) : undefined;

  /* ---------------- pointer handling ---------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (cam.handlePointerDown(e, tool === 'hand')) return;
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-chrome]')) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const [x, y] = cam.toWorld(e);
    const before = current();
    setEditing(null);

    if (tool === 'pen') {
      const p: InkPoint = [x, y, e.pointerType === 'pen' ? e.pressure : 0.5];
      gesture.current = { kind: 'draw', start: [x, y], before, changed: true, points: [p] };
      setDraft({ id: nanoid(8), type: 'stroke', stroke: { id: nanoid(8), pen, color, size, points: [p] } });
      return;
    }
    if (tool === 'eraser') {
      gesture.current = { kind: 'erase', start: [x, y], before, changed: false };
      eraseAt(x, y);
      return;
    }
    if (tool === 'rect' || tool === 'ellipse' || tool === 'diamond') {
      gesture.current = { kind: 'shape', start: [x, y], before, changed: true };
      setDraft({ id: nanoid(8), type: 'shape', shape: tool, x, y, w: 0, h: 0, color, fill });
      return;
    }
    if (tool === 'arrow') {
      gesture.current = { kind: 'shape', start: [x, y], before, changed: true };
      setDraft({ id: nanoid(8), type: 'arrow', x1: x, y1: y, x2: x, y2: y, color });
      return;
    }
    if (tool === 'text') {
      // stop the browser's mousedown default from moving focus to <body>,
      // which would immediately blur the text editor we're about to open
      e.preventDefault();
      const el: BoardElement = { id: nanoid(8), type: 'text', x, y: y - 14, text: '', color, size: 24 };
      commit([...before, el]);
      setSelected(new Set([el.id]));
      setEditing(el.id);
      setTool('select');
      return;
    }

    // select tool
    const target = (e.target as Element).closest<SVGElement>('[data-el]');
    const handle = (e.target as Element).closest<SVGElement>('[data-handle]')?.dataset.handle;
    if (handle) {
      gesture.current = handle === 'resize' ? { kind: 'resize', start: [x, y], before, changed: false, origin: before } : { kind: 'arrow-end', start: [x, y], before, changed: false, end: handle === 'a1' ? 1 : 2 };
      return;
    }
    if (target) {
      const id = target.dataset.el!;
      let next = selected;
      if (e.shiftKey) {
        next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else if (!selected.has(id)) next = new Set([id]);
      setSelected(next);
      gesture.current = { kind: 'move', start: [x, y], before, changed: false, origin: before };
      return;
    }
    if (!e.shiftKey) setSelected(new Set());
    gesture.current = { kind: 'marquee', start: [x, y], before, changed: false };
    setMarquee([x, y, x, y]);
  };

  const eraseAt = (x: number, y: number) => {
    const g = gesture.current!;
    const now = current();
    const next = now.filter((el) => !hitElement(el, x, y, 6 / z));
    if (next.length !== now.length) {
      if (!g.changed) history.record(g.before);
      g.changed = true;
      setElements(next);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (cam.handlePointerMove(e)) return;
    const [x, y] = cam.toWorld(e);
    if (tool === 'eraser') setEraserAt([x, y]);
    const g = gesture.current;
    if (!g) return;
    const dx = x - g.start[0];
    const dy = y - g.start[1];

    switch (g.kind) {
      case 'draw': {
        const native = e.nativeEvent as PointerEvent;
        const evs = native.getCoalescedEvents?.() ?? [];
        for (const ev of evs.length ? evs : [native]) {
          const [px, py] = cam.toWorld(ev);
          g.points!.push([px, py, ev.pointerType === 'pen' ? ev.pressure : 0.5]);
        }
        setDraft((d) => (d?.type === 'stroke' ? { ...d, stroke: { ...d.stroke, points: g.points!.slice() } } : d));
        break;
      }
      case 'erase':
        eraseAt(x, y);
        break;
      case 'shape':
        setDraft((d) => {
          if (d?.type === 'shape') {
            let w = dx;
            let h = dy;
            if (e.shiftKey) w = h = Math.sign(dx || 1) * Math.max(Math.abs(dx), Math.abs(dy)) || 0;
            return { ...d, w, h: e.shiftKey ? Math.sign(dy || 1) * Math.abs(w) : h };
          }
          if (d?.type === 'arrow') return { ...d, x2: x, y2: y };
          return d;
        });
        break;
      case 'marquee': {
        setMarquee([g.start[0], g.start[1], x, y]);
        const box = { x: Math.min(g.start[0], x), y: Math.min(g.start[1], y), w: Math.abs(dx), h: Math.abs(dy) };
        setSelected(new Set(current().filter((el) => boxesIntersect(box, elementBounds(el))).map((el) => el.id)));
        break;
      }
      case 'move':
        if (!g.changed && Math.hypot(dx, dy) * z < 3) return;
        if (!g.changed) history.record(g.before);
        g.changed = true;
        setElements(g.origin!.map((el) => (selected.has(el.id) ? translateElement(el, dx, dy) : el)));
        break;
      case 'resize':
        if (!g.changed) history.record(g.before);
        g.changed = true;
        setElements(
          g.origin!.map((el) => {
            if (!selected.has(el.id)) return el;
            if (el.type === 'shape') return { ...el, w: Math.max(12, el.w + dx), h: Math.max(12, el.h + dy) };
            if (el.type === 'text') return { ...el, size: Math.max(10, Math.round(el.size * (1 + dy / Math.max(40, el.size * 2)))) };
            return el;
          }),
        );
        break;
      case 'arrow-end':
        if (!g.changed) history.record(g.before);
        g.changed = true;
        setElements(g.before.map((el) => (selected.has(el.id) && el.type === 'arrow' ? (g.end === 1 ? { ...el, x1: x, y1: y } : { ...el, x2: x, y2: y }) : el)));
        break;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    cam.handlePointerUp(e);
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (!g) return;
    if (g.kind === 'draw' && draft?.type === 'stroke') {
      commit([...g.before, { ...draft, stroke: { ...draft.stroke, points: g.points! } }]);
    } else if (g.kind === 'shape' && draft) {
      const big = draft.type === 'shape' ? Math.abs(draft.w) > 4 || Math.abs(draft.h) > 4 : draft.type === 'arrow' && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 6;
      if (big) {
        const el = draft.type === 'shape' ? normaliseShape(draft) : draft;
        commit([...g.before, el]);
        setSelected(new Set([el.id]));
        setTool('select');
      }
    }
    setDraft(null);
  };

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') || useWorkspace.getState().paletteOpen) return;
      const key = e.key.toLowerCase();
      if (isMod(e)) {
        if (key === 'z') {
          e.preventDefault();
          const v = e.shiftKey ? history.redo(current()) : history.undo(current());
          if (v) setElements(v);
        } else if (key === 'a') {
          e.preventDefault();
          setSelected(new Set(current().map((el) => el.id)));
        } else if (key === 'd' && selected.size) {
          e.preventDefault();
          const copies = current()
            .filter((el) => selected.has(el.id))
            .map((el) => ({ ...translateElement(el, 24, 24), id: nanoid(8) }));
          commit([...current(), ...copies]);
          setSelected(new Set(copies.map((c) => c.id)));
        } else if (key === '0') {
          e.preventDefault();
          cam.resetZoom();
        } else if (key === '1') {
          e.preventDefault();
          cam.fit(unionBounds(current().map(elementBounds)));
        }
        return;
      }
      if ((key === 'backspace' || key === 'delete') && selected.size) {
        e.preventDefault();
        commit(current().filter((el) => !selected.has(el.id)));
        setSelected(new Set());
      } else if (key === 'escape') {
        setSelected(new Set());
        setTool('select');
      } else if (key === 'enter' && single && (single.type === 'shape' || single.type === 'text')) {
        e.preventDefault();
        setEditing(single.id);
      } else {
        const t = TOOLS.find((x) => x.key === key);
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** recolour / restyle the selection, or set the colour for new elements */
  const applyColor = (c: string) => {
    setColor(c);
    if (selected.size)
      commit(
        current().map((el) => {
          if (!selected.has(el.id)) return el;
          if (el.type === 'stroke') return { ...el, stroke: { ...el.stroke, color: c } };
          return { ...el, color: c };
        }),
      );
  };

  if (!board) return null;
  const styles = cameraStyles(cam.camera);
  const editingEl = editing ? elements.find((el) => el.id === editing) : undefined;

  return (
    <div className="board">
      <div
        ref={cam.viewport}
        className={`canvas-viewport board__viewport tool-${tool} ${cam.spaceDown ? 'is-space' : ''} ${cam.panning ? 'is-panning' : ''}`}
        style={styles.background}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setEraserAt(null)}
        onDoubleClick={(e) => {
          // Pointer capture retargets click events to the viewport, so we hit
          // test geometrically instead of reading event.target. Search from the
          // end: later elements are drawn on top.
          const [x, y] = cam.toWorld(e);
          const el = [...elements].reverse().find((x2) => (x2.type === 'shape' || x2.type === 'text') && hitElement(x2, x, y, 4 / z));
          if (el) {
            setSelected(new Set([el.id]));
            setEditing(el.id);
          } else if (tool === 'select') {
            // double-click on empty canvas drops a text element, like Freeform
            const t: BoardElement = { id: nanoid(8), type: 'text', x, y: y - 14, text: '', color, size: 24 };
            commit([...current(), t]);
            setSelected(new Set([t.id]));
            setEditing(t.id);
          }
        }}
      >
        <div className="canvas-world" style={styles.world}>
          <svg className="board__svg" width="1" height="1">
            <InkDefs id={filterId} />
            {elements.map((el) => (
              <ElementView key={el.id} el={el} selected={selected.has(el.id)} filterId={filterId} hideText={editing === el.id} />
            ))}
            {draft && <ElementView el={draft} selected={false} filterId={filterId} live />}

            {/* selection chrome, drawn in world space but kept a constant screen size */}
            {selBox && tool === 'select' && (
              <g className="board__selection">
                <rect x={selBox.x - 6 / z} y={selBox.y - 6 / z} width={selBox.w + 12 / z} height={selBox.h + 12 / z} rx={6 / z} strokeWidth={1.5 / z} />
                {single?.type === 'arrow' ? (
                  <>
                    <circle data-handle="a1" cx={single.x1} cy={single.y1} r={6 / z} strokeWidth={2 / z} />
                    <circle data-handle="a2" cx={single.x2} cy={single.y2} r={6 / z} strokeWidth={2 / z} />
                  </>
                ) : (
                  single &&
                  single.type !== 'stroke' && <rect data-handle="resize" x={selBox.x + selBox.w + 6 / z - 6 / z} y={selBox.y + selBox.h + 6 / z - 6 / z} width={12 / z} height={12 / z} rx={3 / z} strokeWidth={2 / z} />
                )}
              </g>
            )}
            {marquee && <rect className="board__marquee" x={Math.min(marquee[0], marquee[2])} y={Math.min(marquee[1], marquee[3])} width={Math.abs(marquee[2] - marquee[0])} height={Math.abs(marquee[3] - marquee[1])} strokeWidth={1 / z} />}
            {eraserAt && tool === 'eraser' && <circle className="ink-eraser" cx={eraserAt[0]} cy={eraserAt[1]} r={6 / z} />}
          </svg>

          {editingEl && (editingEl.type === 'text' || editingEl.type === 'shape') && (
            <TextEditor
              el={editingEl}
              onChange={(text) => setElements(current().map((x) => (x.id === editingEl.id ? ({ ...x, text } as BoardElement) : x)))}
              onDone={() => {
                setEditing(null);
                // an emptied text element disappears
                if (editingEl.type === 'text') setElements(current().filter((x) => !(x.id === editingEl.id && x.type === 'text' && !x.text.trim())));
              }}
              onStart={() => history.record(current())}
            />
          )}
        </div>

        {elements.length === 0 && !draft && (
          <div className="board__empty">
            <p className="board__empty-title">A blank whiteboard</p>
            <p>Draw with the pen, or press R, O, D, A, T for shapes, arrows and text.</p>
          </div>
        )}
      </div>

      {/* ---------------- floating chrome ---------------- */}
      <div className="canvas-chrome canvas-chrome--top board__chrome" data-chrome onPointerDown={(e) => e.stopPropagation()}>
        <div className="glass-bar" role="toolbar" aria-label="Whiteboard tools">
          {TOOLS.map(({ id, label, key, Icon }) => (
            <button key={id} type="button" className={`glass-bar__btn ${tool === id ? 'is-active' : ''}`} aria-label={label} title={`${label} (${key.toUpperCase()})`} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {tool === id && <motion.span layoutId="board-tool" className="glass-bar__pill" transition={spring.snappy} />}
              <Icon width={18} height={18} />
            </button>
          ))}
          <span className="glass-bar__sep" />
          {INK_COLORS.slice(0, 7).map((c) => (
            <button key={c} type="button" className={`board__swatch ${color === c ? 'is-active' : ''}`} style={{ background: inkFill(c) }} aria-label={`Color ${c}`} onClick={() => applyColor(c)} />
          ))}
          <span className="glass-bar__sep" />
          <button type="button" className={`glass-bar__btn ${fill ? 'is-on' : ''}`} aria-label="Fill shapes" title="Fill shapes" aria-pressed={fill} onClick={() => setFill(!fill)}>
            <PaintBucket width={17} height={17} />
          </button>
          <button
            type="button"
            className="glass-bar__btn"
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={!history.canUndo}
            onClick={() => {
              const v = history.undo(current());
              if (v) setElements(v);
            }}
          >
            <Undo2 width={17} height={17} />
          </button>
          <button
            type="button"
            className="glass-bar__btn"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={!history.canRedo}
            onClick={() => {
              const v = history.redo(current());
              if (v) setElements(v);
            }}
          >
            <Redo2 width={17} height={17} />
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              className="glass-bar__btn"
              aria-label="Delete selection"
              title="Delete"
              onClick={() => {
                commit(current().filter((el) => !selected.has(el.id)));
                setSelected(new Set());
              }}
            >
              <Trash2 width={17} height={17} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {tool === 'pen' && (
            <motion.div className="glass-bar board__pens" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={spring.snappy}>
              {PEN_ORDER.map((p: PenKind) => (
                <button key={p} type="button" className={`board__pen ${pen === p ? 'is-active' : ''}`} onClick={() => setPen(p)} title={PENS[p].label}>
                  {PENS[p].label}
                </button>
              ))}
              <span className="glass-bar__sep" />
              {[1, 2, 4, 7].map((s) => (
                <button key={s} type="button" className={`board__size ${size === s ? 'is-active' : ''}`} aria-label={`Size ${s}`} onClick={() => setSize(s)}>
                  <span style={{ width: 3 + s * 2, height: 3 + s * 2, background: inkFill(color) }} />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="canvas-chrome canvas-chrome--bl" data-chrome>
        <ZoomControls zoom={z} onZoomIn={() => cam.zoomBy(1.25)} onZoomOut={() => cam.zoomBy(0.8)} onReset={cam.resetZoom} onFit={() => cam.fit(unionBounds(elements.map(elementBounds)))} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ElementView({ el, selected, filterId, live, hideText }: { el: BoardElement; selected: boolean; filterId: string; live?: boolean; hideText?: boolean }) {
  const cls = `board-el ${selected ? 'is-selected' : ''}`;
  switch (el.type) {
    case 'stroke':
      return (
        <g data-el={el.id} className={cls}>
          <StrokePath stroke={el.stroke as Stroke} complete={!live} filterId={filterId} />
        </g>
      );
    case 'shape': {
      const s = normaliseShape(el as BoardShape);
      const stroke = inkFill(el.color);
      const fill = el.fill ? `color-mix(in srgb, ${stroke} 16%, transparent)` : 'transparent';
      const common = { stroke, strokeWidth: 2.5, fill, strokeLinejoin: 'round' as const, className: 'board-shape' };
      return (
        <g data-el={el.id} className={cls}>
          {el.shape === 'rect' && <rect x={s.x} y={s.y} width={s.w} height={s.h} rx={Math.min(14, s.w / 4, s.h / 4)} {...common} />}
          {el.shape === 'ellipse' && <ellipse cx={s.x + s.w / 2} cy={s.y + s.h / 2} rx={s.w / 2} ry={s.h / 2} {...common} />}
          {el.shape === 'diamond' && <path d={diamondPath(s.x, s.y, s.w, s.h)} {...common} />}
          {el.text && !hideText && (
            <text x={s.x + s.w / 2} y={s.y + s.h / 2} className="board-shape__label" fill={stroke} textAnchor="middle" dominantBaseline="central">
              {el.text}
            </text>
          )}
        </g>
      );
    }
    case 'arrow': {
      const stroke = inkFill(el.color);
      // arrowhead: two short lines at ±28° from the shaft, drawn by hand so
      // they always match the arrow's colour (SVG markers can't inherit it)
      const ang = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
      const head = (da: number) => `${el.x2 - 16 * Math.cos(ang + da)},${el.y2 - 16 * Math.sin(ang + da)}`;
      return (
        <g data-el={el.id} className={cls}>
          <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} className="board-arrow__hit" />
          <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={stroke} strokeWidth={2.5} strokeLinecap="round" />
          <polyline points={`${head(0.5)} ${el.x2},${el.y2} ${head(-0.5)}`} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    }
    case 'text': {
      if (hideText) return null;
      const b = elementBounds(el);
      return (
        <g data-el={el.id} className={cls}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
          <text x={el.x} y={el.y} fill={inkFill(el.color)} fontSize={el.size} className="board-text">
            {el.text.split('\n').map((line, i) => (
              <tspan key={i} x={el.x} dy={i === 0 ? el.size : el.size * TEXT_LINE}>
                {line || ' '}
              </tspan>
            ))}
          </text>
        </g>
      );
    }
  }
}

/** A textarea laid over the element in world space while editing text. */
function TextEditor({ el, onChange, onDone, onStart }: { el: BoardElement & { type: 'text' | 'shape' }; onChange: (t: string) => void; onDone: () => void; onStart: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    onStart();
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const isText = el.type === 'text';
  const b = elementBounds(el);
  const style: React.CSSProperties = isText
    ? { left: el.x, top: el.y, fontSize: el.size, minWidth: 120, color: inkFill(el.color), lineHeight: TEXT_LINE }
    : { left: b.x, top: b.y + b.h / 2 - 14, width: b.w, fontSize: 18, textAlign: 'center', color: inkFill(el.color) };
  return (
    <textarea
      ref={ref}
      className={`board__editor ${isText ? '' : 'is-label'}`}
      style={style}
      value={el.text ?? ''}
      rows={Math.max(1, (el.text ?? '').split('\n').length)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (!isText && e.key === 'Enter')) onDone();
      }}
    />
  );
}
