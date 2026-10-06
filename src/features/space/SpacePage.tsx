import { isRedo, isTyping, isUndo, withShortcut } from '@/lib/keys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { FilePlus2, Frame, Hand, ImagePlus, MousePointer2, PenLine, StickyNote, Type } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import type { ID, SpaceCard, SpaceCardType, SpaceData, Stroke } from '@/store/types';
import { useHistory } from '@/hooks/useHistory';
import { isMod } from '@/components/ui/Kbd';
import { spring } from '@/lib/motion';
import { PAGE_MIME } from '@/components/sidebar/PageTree';
import { cameraStyles, useCamera } from '@/features/canvas/useCamera';
import { ZoomControls } from '@/features/canvas/ZoomControls';
import { readImageFile } from '@/lib/image';
import { SpaceCardView, type CardHandlers } from './SpaceCard';
import { Edges } from './Edges';
import { Minimap } from './Minimap';
import { NOTE_COLORS, boundsOf, contains, makeCard, rectsOverlap } from './spaceModel';
import '@/features/canvas/canvas.css';
import './space.css';

type Tool = 'select' | 'hand' | SpaceCardType;

const TOOLS: { id: Tool; label: string; key: string; Icon: typeof Hand }[] = [
  { id: 'select', label: 'Select', key: 'v', Icon: MousePointer2 },
  { id: 'hand', label: 'Hand', key: 'h', Icon: Hand },
  { id: 'note', label: 'Sticky note', key: 'n', Icon: StickyNote },
  { id: 'text', label: 'Text', key: 't', Icon: Type },
  { id: 'frame', label: 'Frame', key: 'f', Icon: Frame },
  { id: 'sketch', label: 'Sketch', key: 's', Icon: PenLine },
];

type Snapshot = Pick<SpaceData, 'cards' | 'edges'>;

interface Gesture {
  kind: 'move' | 'resize' | 'marquee' | 'connect';
  start: [number, number];
  origin: Map<string, { x: number; y: number; w: number; h: number }>;
  before: Snapshot;
  moved: boolean;
  additive?: boolean;
}

/**
 * The spatial document space: an infinite canvas where notes, live page
 * previews, sketches, images and frames can be arranged and connected.
 *
 * This component is the *controller*: it owns tools, selection and
 * gestures, and writes card changes to the store. Cards themselves are
 * dumb views (SpaceCardView) that report pointer events upward.
 */
export function SpacePage({ pageId }: { pageId: ID }) {
  const space = useWorkspace((s) => s.pages[pageId]?.space);
  const mutatePage = useWorkspace((s) => s.mutatePage);
  const createPage = useWorkspace((s) => s.createPage);
  const setActive = useWorkspace((s) => s.setActive);

  const [tool, setTool] = useState<Tool>('select');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<[number, number, number, number] | null>(null);
  const [draftEdge, setDraftEdge] = useState<{ from: string; to: [number, number] } | null>(null);
  const [vp, setVp] = useState({ w: 1000, h: 700 });
  const gesture = useRef<Gesture | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const history = useHistory<Snapshot>();

  const onSettle = useCallback((c: SpaceData['camera']) => mutatePage(pageId, (p) => void (p.space!.camera = c)), [mutatePage, pageId]);
  const cam = useCamera({ initial: space?.camera ?? { x: 0, y: 0, z: 1 }, onSettle });

  const cards = space?.cards ?? [];
  const edges = space?.edges ?? [];
  const byId = useMemo(() => Object.fromEntries(cards.map((c) => [c.id, c])), [cards]);
  const maxZ = useMemo(() => cards.reduce((m, c) => Math.max(m, c.z), 0), [cards]);
  // frames first so they sit underneath everything else
  const ordered = useMemo(() => [...cards].sort((a, b) => (a.type === 'frame' ? -1 : 0) - (b.type === 'frame' ? -1 : 0)), [cards]);

  /* ---------------- store helpers ---------------- */
  const snapshot = (): Snapshot => {
    const s = useWorkspace.getState().pages[pageId].space!;
    return { cards: s.cards, edges: s.edges };
  };
  const write = useCallback((fn: (s: SpaceData) => void) => mutatePage(pageId, (p) => fn(p.space!)), [mutatePage, pageId]);
  const record = () => history.record(snapshot());

  const addCard = (type: SpaceCardType, x: number, y: number, extra: Partial<SpaceCard> = {}) => {
    record();
    const card = makeCard(type, x, y, maxZ + 1, extra);
    write((s) => void s.cards.push(card));
    setSelected(new Set([card.id]));
    if (type === 'note' || type === 'text') setEditing(card.id);
    setTool('select');
    return card;
  };

  const deleteSelection = () => {
    if (!selected.size && !selectedEdge) return;
    record();
    write((s) => {
      s.cards = s.cards.filter((c) => !selected.has(c.id));
      s.edges = s.edges.filter((e) => e.id !== selectedEdge && !selected.has(e.from) && !selected.has(e.to));
    });
    setSelected(new Set());
    setSelectedEdge(null);
  };

  const duplicateSelection = () => {
    if (!selected.size) return;
    record();
    const copies = cards.filter((c) => selected.has(c.id)).map((c, i) => ({ ...structuredClone(c), id: nanoid(10), x: c.x + 32, y: c.y + 32, z: maxZ + 1 + i }));
    write((s) => void s.cards.push(...copies));
    setSelected(new Set(copies.map((c) => c.id)));
  };

  const applySnapshot = (snap: Snapshot | undefined) => {
    if (!snap) return;
    write((s) => {
      s.cards = snap.cards;
      s.edges = snap.edges;
    });
  };
  const undo = () => applySnapshot(history.undo(snapshot()));
  const redo = () => applySnapshot(history.redo(snapshot()));

  /* ---------------- viewport size for the minimap ---------------- */
  useEffect(() => {
    const el = cam.viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setVp({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [cam.viewport]);

  /* ---------------- keyboard ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || useWorkspace.getState().paletteOpen) return;
      const key = e.key.toLowerCase();
      if (isMod(e)) {
        if (isUndo(e) || isRedo(e)) {
          e.preventDefault();
          if (isRedo(e)) redo();
          else undo();
        } else if (key === 'd') {
          e.preventDefault();
          duplicateSelection();
        } else if (key === 'a') {
          e.preventDefault();
          setSelected(new Set(cards.map((c) => c.id)));
        } else if (key === '0') {
          e.preventDefault();
          cam.resetZoom();
        } else if (key === '1') {
          e.preventDefault();
          cam.fit(boundsOf(cards));
        } else if (key === '=' || key === '+') {
          e.preventDefault();
          cam.zoomBy(1.25);
        } else if (key === '-') {
          e.preventDefault();
          cam.zoomBy(0.8);
        }
        return;
      }
      if (key === 'backspace' || key === 'delete') {
        e.preventDefault();
        deleteSelection();
      } else if (key === 'escape') {
        setSelected(new Set());
        setSelectedEdge(null);
        setTool('select');
      } else if (key === 'enter' && selected.size === 1) {
        const c = byId[[...selected][0]];
        if (c?.type === 'page' && c.pageId) setActive(c.pageId);
        else if (c) setEditing(c.id);
        e.preventDefault();
      } else {
        const t = TOOLS.find((x) => x.key === key);
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------------- paste images & text ---------------- */
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const [cx, cy] = cam.toWorld({ clientX: vp.w / 2 + (cam.viewport.current?.getBoundingClientRect().left ?? 0), clientY: vp.h / 2 + (cam.viewport.current?.getBoundingClientRect().top ?? 0) });
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        const img = await readImageFile(file);
        addCard('image', cx, cy, { src: img.src, w: img.w, h: img.h });
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        addCard('note', cx, cy, { text });
        setEditing(null);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  /* ---------------- background gestures ---------------- */
  const onViewportPointerDown = (e: React.PointerEvent) => {
    if (cam.handlePointerDown(e, tool === 'hand')) return;
    if (e.button !== 0) return;
    const [wx, wy] = cam.toWorld(e);
    setEditing(null);
    setSelectedEdge(null);
    if (tool !== 'select' && tool !== 'hand') {
      addCard(tool, wx, wy);
      return;
    }
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (!e.shiftKey) setSelected(new Set());
    gesture.current = { kind: 'marquee', start: [wx, wy], origin: new Map(), before: snapshot(), moved: false, additive: e.shiftKey };
    setMarquee([wx, wy, wx, wy]);
  };

  const onViewportPointerMove = (e: React.PointerEvent) => {
    if (cam.handlePointerMove(e)) return;
    const g = gesture.current;
    if (!g) return;
    const [wx, wy] = cam.toWorld(e);
    const dx = wx - g.start[0];
    const dy = wy - g.start[1];

    if (g.kind === 'marquee') {
      const box = { x: Math.min(g.start[0], wx), y: Math.min(g.start[1], wy), w: Math.abs(dx), h: Math.abs(dy) };
      setMarquee([g.start[0], g.start[1], wx, wy]);
      const hit = cards.filter((c) => (c.type === 'frame' ? contains(box, c) : rectsOverlap(box, c))).map((c) => c.id);
      setSelected((prev) => new Set(g.additive ? [...prev, ...hit] : hit));
      return;
    }
    if (g.kind === 'connect') {
      setDraftEdge((d) => (d ? { ...d, to: [wx, wy] } : d));
      return;
    }
    if (!g.moved) {
      if (Math.hypot(dx, dy) * cam.camera.z < 3) return; // ignore tiny jitters
      history.record(g.before);
      g.moved = true;
    }
    write((s) => {
      for (const c of s.cards) {
        const o = g.origin.get(c.id);
        if (!o) continue;
        if (g.kind === 'move') {
          c.x = Math.round(o.x + dx);
          c.y = Math.round(o.y + dy);
        } else {
          c.w = Math.max(80, Math.round(o.w + dx));
          c.h = Math.max(48, Math.round(o.h + dy));
        }
      }
    });
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    cam.handlePointerUp(e);
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    if (g?.kind === 'connect') {
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-card]')?.dataset.card;
      const from = draftEdge?.from;
      setDraftEdge(null);
      if (from && target && target !== from && !edges.some((x) => x.from === from && x.to === target)) {
        record();
        write((s) => void s.edges.push({ id: nanoid(8), from, to: target }));
      }
    }
  };

  /* ---------------- card callbacks (stable via ref) ---------------- */
  const latest = useRef({ selected, cards, maxZ, tool });
  latest.current = { selected, cards, maxZ, tool };

  const handlers = useMemo<CardHandlers>(
    () => ({
      onCardPointerDown: (e, card) => {
        if (cam.handlePointerDown(e, latest.current.tool === 'hand')) return;
        e.stopPropagation();
        if ((e.target as HTMLElement).closest('[data-interactive]') || e.button !== 0) return;
        const { selected: sel, cards: all, maxZ: top } = latest.current;
        let next = sel;
        if (e.shiftKey) {
          next = new Set(sel);
          if (next.has(card.id)) next.delete(card.id);
          else next.add(card.id);
        } else if (!sel.has(card.id)) next = new Set([card.id]);
        setSelected(next);
        setSelectedEdge(null);

        // dragging a frame drags everything inside it
        const moving = new Set(next);
        for (const id of next) {
          const c = all.find((x) => x.id === id);
          if (c?.type === 'frame') all.forEach((o) => o.id !== c.id && contains(c, o) && moving.add(o.id));
        }
        const origin = new Map(all.filter((c) => moving.has(c.id)).map((c) => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]));
        // bring to front
        write((s) => s.cards.forEach((c, i) => next.has(c.id) && c.type !== 'frame' && (c.z = top + 1 + i)));
        cam.viewport.current?.setPointerCapture(e.pointerId);
        gesture.current = { kind: 'move', start: cam.toWorld(e), origin, before: snapshot(), moved: false };
      },
      onResizeStart: (e, card) => {
        e.stopPropagation();
        cam.viewport.current?.setPointerCapture(e.pointerId);
        gesture.current = { kind: 'resize', start: cam.toWorld(e), origin: new Map([[card.id, { x: card.x, y: card.y, w: card.w, h: card.h }]]), before: snapshot(), moved: false };
      },
      onConnectStart: (e, card) => {
        e.stopPropagation();
        cam.viewport.current?.setPointerCapture(e.pointerId);
        gesture.current = { kind: 'connect', start: cam.toWorld(e), origin: new Map(), before: snapshot(), moved: false };
        setDraftEdge({ from: card.id, to: cam.toWorld(e) });
      },
      onEdit: setEditing,
      onChange: (id, patch) =>
        write((s) => {
          const c = s.cards.find((x) => x.id === id);
          if (c) Object.assign(c, patch);
        }),
      onSketchCommit: (id, next: Stroke[]) =>
        write((s) => {
          const c = s.cards.find((x) => x.id === id);
          if (c) c.strokes = next;
        }),
      onOpenPage: (pid) => setActive(pid),
    }),
    [cam.toWorld, cam.handlePointerDown, write, setActive],
  );

  /* ---------------- drag & drop from sidebar / desktop ---------------- */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const [wx, wy] = cam.toWorld(e);
    const pid = e.dataTransfer.getData(PAGE_MIME);
    if (pid && pid !== pageId) {
      addCard('page', wx, wy, { pageId: pid });
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    for (const [i, f] of files.entries()) {
      const img = await readImageFile(f);
      addCard('image', wx + i * 40, wy + i * 40, { src: img.src, w: img.w, h: img.h });
    }
  };

  if (!space) return null;

  const styles = cameraStyles(cam.camera);
  const far = cam.camera.z < 0.5;
  const single = selected.size === 1 ? byId[[...selected][0]] : undefined;

  return (
    <div className="space">
      <div
        ref={cam.viewport}
        className={`canvas-viewport tool-${tool} ${cam.spaceDown ? 'is-space' : ''} ${cam.panning ? 'is-panning' : ''}`}
        style={styles.background}
        tabIndex={0}
        onPointerDown={onViewportPointerDown}
        onPointerMove={onViewportPointerMove}
        onPointerUp={onViewportPointerUp}
        onPointerCancel={onViewportPointerUp}
        onDoubleClick={(e) => {
          if (e.target !== e.currentTarget) return;
          const [wx, wy] = cam.toWorld(e);
          addCard('note', wx, wy);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(PAGE_MIME) || e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={onDrop}
      >
        <div className={`canvas-world ${far ? 'is-far' : ''}`} style={{ ...styles.world, ['--inv-z' as string]: 1 / cam.camera.z }}>
          <Edges edges={edges} cards={byId} selectedEdge={selectedEdge} onSelect={setSelectedEdge} draft={draftEdge} />
          {ordered.map((card) => (
            <SpaceCardView key={card.id} card={card} selected={selected.has(card.id)} editing={editing === card.id} far={far} {...handlers} />
          ))}
          {marquee && (
            <div
              className="canvas-marquee"
              style={{ left: Math.min(marquee[0], marquee[2]), top: Math.min(marquee[1], marquee[3]), width: Math.abs(marquee[2] - marquee[0]), height: Math.abs(marquee[3] - marquee[1]), borderWidth: 1 / cam.camera.z }}
            />
          )}
        </div>

        {cards.length === 0 && (
          <div className="space__empty">
            <p className="space__empty-title">An open space for thinking</p>
            <p>Double-click anywhere for a sticky note, drag pages in from the sidebar, or paste an image.</p>
          </div>
        )}
      </div>

      {/* ---------------- floating chrome ---------------- */}
      <div className="canvas-chrome canvas-chrome--top">
        <div className="glass-bar" role="toolbar" aria-label="Space tools">
          {TOOLS.map(({ id, label, key, Icon }) => (
            <button key={id} type="button" className={`glass-bar__btn ${tool === id ? 'is-active' : ''}`} aria-label={label} title={withShortcut(label, key.toUpperCase())} aria-pressed={tool === id} onClick={() => setTool(id)}>
              {tool === id && <motion.span layoutId="space-tool" className="glass-bar__pill" transition={spring.snappy} />}
              <Icon width={18} height={18} />
            </button>
          ))}
          <span className="glass-bar__sep" />
          <button
            type="button"
            className="glass-bar__btn"
            aria-label="New page card"
            title="New page on the canvas"
            onClick={() => {
              const pid = createPage('doc', pageId);
              const [wx, wy] = cam.toWorld({ clientX: (cam.viewport.current?.getBoundingClientRect().left ?? 0) + vp.w / 2, clientY: (cam.viewport.current?.getBoundingClientRect().top ?? 0) + vp.h / 2 });
              addCard('page', wx, wy, { pageId: pid });
            }}
          >
            <FilePlus2 width={18} height={18} />
          </button>
          <button type="button" className="glass-bar__btn" aria-label="Add image" title="Add image" onClick={() => fileInput.current?.click()}>
            <ImagePlus width={18} height={18} />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const img = await readImageFile(f);
              const r = cam.viewport.current!.getBoundingClientRect();
              const [wx, wy] = cam.toWorld({ clientX: r.left + vp.w / 2, clientY: r.top + vp.h / 2 });
              addCard('image', wx, wy, { src: img.src, w: img.w, h: img.h });
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {single?.type === 'note' && (
        <div className="canvas-chrome canvas-chrome--top space__colors" onPointerDown={(e) => e.stopPropagation()}>
          <div className="glass-bar">
            {NOTE_COLORS.map((c) => (
              <button key={c} type="button" className={`space__color note--${c} ${single.color === c ? 'is-active' : ''}`} aria-label={`${c} note`} onClick={() => handlers.onChange(single.id, { color: c })} />
            ))}
          </div>
        </div>
      )}

      <div className="canvas-chrome canvas-chrome--bl">
        <ZoomControls zoom={cam.camera.z} onZoomIn={() => cam.zoomBy(1.25)} onZoomOut={() => cam.zoomBy(0.8)} onReset={cam.resetZoom} onFit={() => cam.fit(boundsOf(cards))} />
      </div>
      {cards.length > 0 && (
        <div className="canvas-chrome canvas-chrome--br">
          <Minimap cards={cards} camera={cam.camera} viewport={vp} onNavigate={cam.setCamera} />
        </div>
      )}
    </div>
  );
}
