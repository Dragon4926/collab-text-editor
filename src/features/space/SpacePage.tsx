import { isRedo, isTyping, isUndo, withShortcut } from '@/lib/keys';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { FilePlus2, FileUp, Frame, Hand, ImagePlus, MousePointer2, PenLine, StickyNote, Type } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import type { ID, SpaceCard, SpaceCardType, SpaceData, SpaceEdge, Stroke } from '@/store/types';
import { useHistory } from '@/hooks/useHistory';
import { isMod } from '@/components/ui/Kbd';
import { blurFade, spring } from '@/lib/motion';
import { sanitizeCard, sanitizeEdge } from '@/lib/sanitize';
import { PAGE_MIME } from '@/components/sidebar/PageTree';
import { cameraStyles, useCamera } from '@/features/canvas/useCamera';
import { ZoomControls } from '@/features/canvas/ZoomControls';
import { readImageFile } from '@/lib/image';
import { isPdfFile, pickPdfs } from '@/lib/pdf';
import { addPdfFile } from '@/features/pdf/pdfActions';
import { toast } from '@/components/ui/Toast';
import { COLLAPSED, READING, SpaceCardView, type CardHandlers } from './SpaceCard';
import { Edges } from './Edges';
import { Minimap } from './Minimap';
import { CardBar, EdgeBar } from './SelectionBar';
import { GRID, alignRects, boundsOf, contains, distributeRects, makeCard, rectsOverlap, snapBox, type AlignMode, type Guide, type Rect } from './spaceModel';
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

/** clipboard format for cards copied out of a space */
const CARDS_MIME = 'application/x-lumen-cards';

/** how close (in screen pixels) an edge must come before it snaps */
const SNAP_PX = 6;

type Snapshot = Pick<SpaceData, 'cards' | 'edges'>;

interface Gesture {
  kind: 'move' | 'resize' | 'marquee' | 'connect';
  start: [number, number];
  origin: Map<string, { x: number; y: number; w: number; h: number }>;
  before: Snapshot;
  moved: boolean;
  additive?: boolean;
  /** move: the moving cards' combined box at the start, and the cards they can snap to */
  box?: Rect;
  others?: Rect[];
  /** resize: lock the aspect ratio (images always do) */
  keepRatio?: boolean;
  /** snap distance in world units, fixed for the gesture */
  threshold: number;
  /** latest pointer offset, applied on the next animation frame */
  next?: { dx: number; dy: number; free: boolean; ratio: boolean };
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
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  /** a PDF card changing size because reading mode toggled */
  const [morphing, setMorphing] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<[number, number, number, number] | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [draftEdge, setDraftEdge] = useState<{ from: string; to: [number, number] } | null>(null);
  const [vp, setVp] = useState({ w: 1000, h: 700 });
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const history = useHistory<Snapshot>();
  // cards already here when the space opened don't play the entrance animation
  const [initialIds] = useState(() => new Set((space?.cards ?? []).map((c) => c.id)));

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

  /**
   * Typing into a note (or a connector label) is one undo step per editing
   * session, not one per keystroke: the snapshot is taken on the first
   * change and the session ends when editing does.
   */
  const textSession = useRef<string | null>(null);
  useEffect(() => {
    textSession.current = null;
  }, [editing, editingEdge]);
  const recordOncePer = (session: string) => {
    if (textSession.current === session) return;
    record();
    textSession.current = session;
  };

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

  /** Insert copies of cards (and the edges between them), offset or centred on a point. */
  const insertCopies = (src: SpaceCard[], srcEdges: SpaceEdge[], place: { offset: number } | { center: [number, number] }) => {
    if (!src.length) return;
    record();
    const ids = new Map(src.map((c) => [c.id, nanoid(10)]));
    const box = boundsOf(src)!;
    const [ox, oy] = 'offset' in place ? [place.offset, place.offset] : [Math.round(place.center[0] - (box.x + box.w / 2)), Math.round(place.center[1] - (box.y + box.h / 2))];
    const copies = src.map((c, i) => ({ ...structuredClone(c), id: ids.get(c.id)!, x: c.x + ox, y: c.y + oy, z: maxZ + 1 + i }));
    const linked = srcEdges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ ...e, id: nanoid(8), from: ids.get(e.from)!, to: ids.get(e.to)! }));
    write((s) => {
      s.cards.push(...copies);
      s.edges.push(...linked);
    });
    setSelected(new Set(copies.map((c) => c.id)));
    setSelectedEdge(null);
  };

  const duplicateSelection = () => insertCopies(cards.filter((c) => selected.has(c.id)), edges, { offset: 32 });

  /* ---------------- arrange ---------------- */
  const selectedCards = cards.filter((c) => selected.has(c.id));
  const single = selectedCards.length === 1 ? selectedCards[0] : undefined;

  const moveTo = (positions: Map<string, { x: number; y: number }>) => {
    record();
    write((s) => {
      for (const c of s.cards) {
        const p = positions.get(c.id);
        if (p) Object.assign(c, p);
      }
    });
  };
  const align = (mode: AlignMode) => moveTo(alignRects(selectedCards, mode));
  const distribute = (axis: 'x' | 'y') => moveTo(distributeRects(selectedCards, axis));

  /** Restack: the selection goes above (or below) everything else, keeping its own order. */
  const restack = (toFront: boolean) => {
    if (!selected.size) return;
    record();
    write((s) => {
      const sel = s.cards.filter((c) => selected.has(c.id)).sort((a, b) => a.z - b.z);
      const rest = s.cards.filter((c) => !selected.has(c.id)).sort((a, b) => a.z - b.z);
      (toFront ? [...rest, ...sel] : [...sel, ...rest]).forEach((c, i) => (c.z = i + 1));
    });
  };

  const lastNudge = useRef(0);
  const nudge = (dx: number, dy: number) => {
    if (!selected.size) return;
    // a burst of arrow presses is one undo step
    if (Date.now() - lastNudge.current > 800) record();
    lastNudge.current = Date.now();
    write((s) => {
      for (const c of s.cards) {
        if (!selected.has(c.id)) continue;
        c.x += dx;
        c.y += dy;
      }
    });
  };

  /* ---------------- connectors ---------------- */
  const edge = selectedEdge ? edges.find((e) => e.id === selectedEdge) : undefined;
  const updateEdge = (id: string, fn: (e: SpaceEdge) => void) =>
    write((s) => {
      const e = s.edges.find((x) => x.id === id);
      if (e) fn(e);
    });

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

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** world point at the centre of the viewport */
  const viewCenter = (): [number, number] => {
    const r = cam.viewport.current?.getBoundingClientRect();
    return cam.toWorld({ clientX: (r?.left ?? 0) + vp.w / 2, clientY: (r?.top ?? 0) + vp.h / 2 });
  };

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
        } else if (key === '2') {
          e.preventDefault();
          cam.fit(boundsOf(selectedCards));
        } else if (key === '=' || key === '+') {
          e.preventDefault();
          cam.zoomBy(1.25);
        } else if (key === '-') {
          e.preventDefault();
          cam.zoomBy(0.8);
        }
        return;
      }
      const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      if (single?.type === 'page' && single.reading && ['arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(key)) {
        // turn the pages of an open PDF card
        e.preventDefault();
        const pid = single.pageId!;
        useWorkspace.getState().mutatePage(pid, (p) => {
          if (!p.pdf) return;
          const dir = key === 'arrowleft' || key === 'pageup' ? -1 : 1;
          p.pdf.lastPage = Math.min(p.pdf.pages, Math.max(1, p.pdf.lastPage + dir));
        });
      } else if (key === 'escape' && single?.type === 'page' && single.reading) {
        handlers.onToggleReading(single, false);
      } else if (arrows[key] && selected.size) {
        e.preventDefault();
        const step = e.shiftKey ? GRID : 1;
        nudge(arrows[key][0] * step, arrows[key][1] * step);
      } else if (key === 'backspace' || key === 'delete') {
        e.preventDefault();
        deleteSelection();
      } else if (key === 'escape') {
        setSelected(new Set());
        setSelectedEdge(null);
        setTool('select');
      } else if (key === 'enter' && selectedEdge) {
        e.preventDefault();
        setEditingEdge(selectedEdge);
      } else if (key === 'enter' && selected.size === 1) {
        const c = byId[[...selected][0]];
        if (c?.type === 'page' && c.pageId) setActive(c.pageId);
        else if (c) setEditing(c.id);
        e.preventDefault();
      } else if (key === ']' || key === '[') {
        restack(key === ']');
      } else {
        const t = TOOLS.find((x) => x.key === key);
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------------- clipboard: cards, images & text ---------------- */
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !selected.size || !e.clipboardData) return;
      e.preventDefault();
      const picked = cards.filter((c) => selected.has(c.id));
      e.clipboardData.setData(CARDS_MIME, JSON.stringify({ cards: picked, edges: edges.filter((x) => selected.has(x.from) && selected.has(x.to)) }));
      // plain text for pasting anywhere else
      e.clipboardData.setData('text/plain', picked.map((c) => c.text ?? '').filter(Boolean).join('\n\n'));
      if (e.type === 'cut') deleteSelection();
    };
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const center = viewCenter();
      const lumen = e.clipboardData?.getData(CARDS_MIME);
      if (lumen) {
        e.preventDefault();
        // clipboard contents are untrusted: rebuild every card and edge
        try {
          const data = JSON.parse(lumen) as { cards?: unknown; edges?: unknown };
          const pasted = (Array.isArray(data.cards) ? data.cards : []).map(sanitizeCard).filter((c): c is SpaceCard => !!c);
          const links = (Array.isArray(data.edges) ? data.edges : []).map(sanitizeEdge).filter((x): x is SpaceEdge => !!x);
          insertCopies(pasted, links, { center });
        } catch {
          /* not ours after all */
        }
        return;
      }
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        const img = await readImageFile(file);
        addCard('image', center[0], center[1], { src: img.src, w: img.w, h: img.h });
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        e.preventDefault();
        addCard('note', center[0], center[1], { text: text.slice(0, 20_000) });
        setEditing(null);
      }
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
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
    gesture.current = { kind: 'marquee', start: [wx, wy], origin: new Map(), before: snapshot(), moved: false, additive: e.shiftKey, threshold: 0 };
    setMarquee([wx, wy, wx, wy]);
  };

  /**
   * Apply the latest move / resize offset. Pointer events can arrive faster
   * than the screen refreshes; writing to the store once per frame instead
   * of once per event keeps dragging smooth on large spaces.
   */
  const applyGesture = (g: Gesture) => {
    if (!g.next) return;
    let { dx, dy } = g.next;
    const { free, ratio } = g.next;
    let found: Guide[] = [];
    if (g.kind === 'move' && g.box && !free) {
      const snap = snapBox({ ...g.box, x: g.box.x + dx, y: g.box.y + dy }, g.others ?? [], g.threshold);
      dx += snap.dx;
      dy += snap.dy;
      found = snap.guides;
    }
    setGuides(found);
    write((s) => {
      for (const c of s.cards) {
        const o = g.origin.get(c.id);
        if (!o) continue;
        if (g.kind === 'move') {
          c.x = Math.round(o.x + dx);
          c.y = Math.round(o.y + dy);
          continue;
        }
        let w = Math.max(80, o.w + dx);
        let h = Math.max(48, o.h + dy);
        if (g.keepRatio || ratio) {
          // follow whichever side the pointer is stretching more
          const r = o.w / o.h;
          if (Math.abs(dx) / o.w > Math.abs(dy) / o.h) h = w / r;
          else w = h * r;
        } else if (!free) {
          // snap the dragged corner to the grid
          const sx = Math.round((o.x + w) / GRID) * GRID - o.x;
          const sy = Math.round((o.y + h) / GRID) * GRID - o.y;
          if (Math.abs(sx - w) <= g.threshold && sx >= 80) w = sx;
          if (Math.abs(sy - h) <= g.threshold && sy >= 48) h = sy;
        }
        c.w = Math.round(w);
        c.h = Math.round(h);
      }
    });
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
    // Alt: place freely, without snapping. Shift while resizing: keep proportions.
    g.next = { dx, dy, free: e.altKey, ratio: e.shiftKey };
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (gesture.current) applyGesture(gesture.current);
      });
    }
  };

  const onViewportPointerUp = (e: React.PointerEvent) => {
    cam.handlePointerUp(e);
    const g = gesture.current;
    // land exactly where the pointer was released, even if a frame was pending
    if (frame.current && g) {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      applyGesture(g);
    }
    gesture.current = null;
    setMarquee(null);
    setGuides([]);
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
  const latest = useRef({ selected, cards, maxZ, tool, record, recordOncePer, zoom: cam.camera.z });
  latest.current = { selected, cards, maxZ, tool, record, recordOncePer, zoom: cam.camera.z };

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
        // bring to front — only when something is actually underneath
        if (all.some((c) => next.has(c.id) && c.type !== 'frame' && c.z < top)) {
          write((s) => s.cards.forEach((c, i) => next.has(c.id) && c.type !== 'frame' && (c.z = top + 1 + i)));
        }
        cam.viewport.current?.setPointerCapture(e.pointerId);
        // snap against cards that aren't moving, and only those near enough to matter
        const box = boundsOf([...origin.values()])!;
        const reach = Math.max(box.w, box.h) * 3 + 2000;
        const others = all.filter((c) => !moving.has(c.id) && Math.abs(c.x - box.x) < reach && Math.abs(c.y - box.y) < reach);
        gesture.current = { kind: 'move', start: cam.toWorld(e), origin, before: snapshot(), moved: false, box, others, threshold: SNAP_PX / latest.current.zoom };
      },
      onResizeStart: (e, card) => {
        e.stopPropagation();
        cam.viewport.current?.setPointerCapture(e.pointerId);
        gesture.current = {
          kind: 'resize',
          start: cam.toWorld(e),
          origin: new Map([[card.id, { x: card.x, y: card.y, w: card.w, h: card.h }]]),
          before: snapshot(),
          moved: false,
          keepRatio: card.type === 'image',
          threshold: SNAP_PX / latest.current.zoom,
        };
      },
      onConnectStart: (e, card) => {
        e.stopPropagation();
        cam.viewport.current?.setPointerCapture(e.pointerId);
        gesture.current = { kind: 'connect', start: cam.toWorld(e), origin: new Map(), before: snapshot(), moved: false, threshold: 0 };
        setDraftEdge({ from: card.id, to: cam.toWorld(e) });
      },
      onEdit: setEditing,
      onChange: (id, patch) => {
        // text edits are grouped per editing session; anything else is its own step
        if ('text' in patch) latest.current.recordOncePer(`card:${id}`);
        else latest.current.record();
        write((s) => {
          const c = s.cards.find((x) => x.id === id);
          if (c) Object.assign(c, patch);
        });
      },
      onSketchCommit: (id, next: Stroke[]) => {
        // the ink surface commits once per gesture, so each stroke or erase is one undo step
        latest.current.record();
        write((s) => {
          const c = s.cards.find((x) => x.id === id);
          if (c) c.strokes = next;
        });
      },
      onOpenPage: (pid) => setActive(pid),
      onToggleReading: (card, reading) => {
        // animate the size change, but only for this toggle (not while resizing)
        setMorphing(card.id);
        setTimeout(() => setMorphing((m) => (m === card.id ? null : m)), 460);
        write((s) => {
          const c = s.cards.find((x) => x.id === card.id);
          if (!c) return;
          c.reading = reading;
          if (reading) {
            c.w = Math.max(c.w, READING.w);
            c.h = Math.max(c.h, READING.h);
          } else Object.assign(c, COLLAPSED);
        });
      },
      onOpenSource: (pid, pageNo) => {
        useWorkspace.getState().mutatePage(pid, (p) => void (p.pdf && (p.pdf.lastPage = pageNo)));
        setActive(pid);
      },
      onPinQuote: (from, pid, h) => {
        // a sticky beside the PDF, in the first free spot, wired back to it
        const { cards: all, maxZ: top } = latest.current;
        const w = 240;
        const hgt = Math.min(320, Math.max(150, 120 + h.text.length * 0.9));
        const x = from.x + from.w + 96;
        let y = from.y;
        while (all.some((c) => c.type !== 'frame' && rectsOverlap({ x, y, w, h: hgt }, c))) y += 24;
        const note = makeCard('note', x + w / 2, y + hgt / 2, top + 1, { w, h: hgt, color: h.color, text: `“${h.text}”`, source: { pageId: pid, page: h.page } });
        latest.current.record();
        write((s) => {
          s.cards.push(note);
          s.edges.push({ id: nanoid(8), from: from.id, to: note.id });
        });
        useWorkspace.getState().mutatePage(pid, (p) => {
          const hl = p.pdf?.highlights.find((x2) => x2.id === h.id);
          if (hl) hl.pinned = true;
        });
      },
    }),
    [cam.toWorld, cam.handlePointerDown, write, setActive],
  );

  /** import a PDF as a child page and put a card for it on the canvas */
  const importPdfCard = async (file: File, x: number, y: number) => {
    try {
      const pid = await addPdfFile(file, pageId);
      addCard('page', x, y, { pageId: pid, ...COLLAPSED });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t read that PDF', 'error');
    }
  };

  /* ---------------- drag & drop from sidebar / desktop ---------------- */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const [wx, wy] = cam.toWorld(e);
    const pid = e.dataTransfer.getData(PAGE_MIME);
    if (pid && pid !== pageId && useWorkspace.getState().pages[pid]) {
      addCard('page', wx, wy, { pageId: pid });
      return;
    }
    const pdfs = [...e.dataTransfer.files].filter(isPdfFile);
    for (const [i, f] of pdfs.entries()) void importPdfCard(f, wx + i * 40, wy + i * 40);
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    for (const [i, f] of files.entries()) {
      const img = await readImageFile(f);
      addCard('image', wx + i * 40, wy + i * 40, { src: img.src, w: img.w, h: img.h });
    }
  };

  if (!space) return null;

  const styles = cameraStyles(cam.camera);
  const far = cam.camera.z < 0.5;
  // zoomed in, PDF pages redraw at a higher resolution (in steps, not every frame)
  const detail = cam.camera.z > 1.3 ? 2 : 1;
  const showCardBar = selectedCards.length > 0 && !editing && !marquee && !gesture.current?.moved;

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
          // A card pointer-down captures the pointer on the viewport, so the
          // browser reports the double-click here rather than on the card.
          // Find the card under the cursor ourselves.
          const hit = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
          const cardEl = hit?.closest<HTMLElement>('[data-card]');
          if (cardEl) {
            const card = byId[cardEl.dataset.card ?? ''];
            if (!card || hit!.closest('[data-interactive]')) return;
            if (card.type === 'page' && card.pageId) {
              if (useWorkspace.getState().pages[card.pageId]?.kind === 'pdf') {
                handlers.onToggleReading(card, !card.reading);
              } else setActive(card.pageId);
            } else if (card.type === 'note' || card.type === 'text' || card.type === 'frame') setEditing(card.id);
            return;
          }
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
          <Edges
            edges={edges}
            cards={byId}
            selectedEdge={selectedEdge}
            onSelect={(id) => {
              setSelectedEdge(id);
              setSelected(new Set());
            }}
            editingEdge={editingEdge}
            onEditLabel={setEditingEdge}
            onLabel={(id, label) => {
              recordOncePer(`edge:${id}`);
              updateEdge(id, (x) => {
                if (label) x.label = label;
                else delete x.label;
              });
            }}
            draft={draftEdge}
          />
          {ordered.map((card) => (
            <SpaceCardView key={card.id} card={card} selected={selected.has(card.id)} editing={editing === card.id} far={far} detail={detail} appear={!initialIds.has(card.id)} morphing={morphing === card.id} {...handlers} />
          ))}
          {guides.length > 0 && (
            <svg className="space-guides" width="1" height="1" aria-hidden="true">
              {guides.map((g, i) => (g.axis === 'x' ? <line key={i} x1={g.at} x2={g.at} y1={g.from} y2={g.to} /> : <line key={i} y1={g.at} y2={g.at} x1={g.from} x2={g.to} />))}
            </svg>
          )}
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
            <p>Double-click anywhere for a sticky note, drag pages in from the sidebar, or drop in an image or PDF.</p>
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
              const [wx, wy] = viewCenter();
              addCard('page', wx, wy, { pageId: pid });
            }}
          >
            <FilePlus2 width={18} height={18} />
          </button>
          <button
            type="button"
            className="glass-bar__btn"
            aria-label="Add PDF"
            title="Add PDF"
            onClick={() =>
              pickPdfs((files) => {
                const [wx, wy] = viewCenter();
                files.forEach((f, i) => void importPdfCard(f, wx + i * 40, wy + i * 40));
              })
            }
          >
            <FileUp width={18} height={18} />
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
              const [wx, wy] = viewCenter();
              addCard('image', wx, wy, { src: img.src, w: img.w, h: img.h });
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <AnimatePresence>
        {showCardBar && (
          <motion.div key="card-bar" className="canvas-chrome canvas-chrome--top space__context" onPointerDown={(e) => e.stopPropagation()} {...blurFade}>
            <CardBar
              cards={selectedCards}
              onColor={(color) => handlers.onChange(selectedCards[0].id, { color })}
              onAlign={align}
              onDistribute={distribute}
              onFront={() => restack(true)}
              onBack={() => restack(false)}
              onDuplicate={duplicateSelection}
              onDelete={deleteSelection}
            />
          </motion.div>
        )}
        {edge && !editingEdge && (
          <motion.div key="edge-bar" className="canvas-chrome canvas-chrome--top space__context" onPointerDown={(e) => e.stopPropagation()} {...blurFade}>
            <EdgeBar
              edge={edge}
              onLabel={() => setEditingEdge(edge.id)}
              onDashed={() => {
                record();
                updateEdge(edge.id, (x) => {
                  if (x.dashed) delete x.dashed;
                  else x.dashed = true;
                });
              }}
              onReverse={() => {
                record();
                updateEdge(edge.id, (x) => ([x.from, x.to] = [x.to, x.from]));
              }}
              onDelete={deleteSelection}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
