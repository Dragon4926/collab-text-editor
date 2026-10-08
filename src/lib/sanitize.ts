import { nanoid } from 'nanoid';
import type { BoardElement, BoardData, Camera, HighlightColor, InkPoint, NotebookData, Page, PageKind, PaperStyle, PdfData, PdfHighlight, PenKind, SpaceCard, SpaceCardType, SpaceData, SpaceEdge, Stroke } from '@/store/types';
import { ICONS } from '@/components/ui/PageIcon';
import { COVERS } from '@/features/page/covers';

/**
 * Validation for data that comes from *outside* the running app: backup
 * files, the clipboard, HTML pasted into the editor.
 *
 * TypeScript types vanish at runtime, so a hand-edited or hostile file can
 * put anything anywhere — a string where an array belongs, `__proto__` as a
 * page id, `javascript:` as an image source. Because the workspace is
 * persisted, one bad value would otherwise crash the app on *every* launch.
 * Each function here returns a well-formed value or null; nothing from the
 * input is passed through without being checked.
 */

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** keys that would reach Object.prototype if used as a property name */
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** nanoid-style ids only: no prototype keys, no markup, bounded length */
export const isId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) && !FORBIDDEN_KEYS.has(v);

const num = (v: unknown, fallback: number, min = -1e7, max = 1e7) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const str = (v: unknown, max = 100_000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = (v: unknown) => v === true;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** `#rgb`, `#rrggbb` or `#rrggbbaa` — the only colour format the app writes */
export const safeColor = (v: unknown, fallback = '#1d1d1f') => (typeof v === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : fallback);

/** embedded raster images only — never remote URLs or script-bearing schemes */
export const safeImageSrc = (v: unknown) => (typeof v === 'string' && /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/.test(v) ? v : null);

const PAGE_KINDS: PageKind[] = ['doc', 'space', 'board', 'notebook', 'pdf'];
const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];
const PENS: PenKind[] = ['fountain', 'pen', 'pencil', 'marker', 'highlighter'];
const CARD_TYPES: SpaceCardType[] = ['note', 'text', 'page', 'frame', 'image', 'sketch'];
const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple', 'gray'] as const;
const PAPERS: PaperStyle[] = ['plain', 'lined', 'grid', 'dotted', 'cornell', 'music'];
const TINTS: NotebookData['tint'][] = ['white', 'ivory', 'mint', 'night'];

/* ---------------- ink ---------------- */

export function sanitizeStroke(v: unknown): Stroke | null {
  if (!isObj(v) || !Array.isArray(v.points)) return null;
  const points: InkPoint[] = [];
  for (const p of v.points.slice(0, 20_000)) {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      points.push([num(p[0], 0), num(p[1], 0), num(p[2], 0.5, 0, 1)]);
    }
  }
  if (!points.length) return null;
  return { id: isId(v.id) ? v.id : nanoid(8), pen: oneOf(v.pen, PENS, 'pen'), color: safeColor(v.color), size: num(v.size, 2, 0.5, 64), points };
}

export const sanitizeStrokes = (v: unknown): Stroke[] => (Array.isArray(v) ? v.map(sanitizeStroke).filter((s): s is Stroke => !!s) : []);

const sanitizeCamera = (v: unknown): Camera => (isObj(v) ? { x: num(v.x, 0), y: num(v.y, 0), z: num(v.z, 1, 0.1, 4) } : { x: 0, y: 0, z: 1 });

/* ---------------- spatial space ---------------- */

export function sanitizeCard(v: unknown): SpaceCard | null {
  if (!isObj(v)) return null;
  const type = oneOf(v.type, CARD_TYPES, 'note');
  const card: SpaceCard = {
    id: isId(v.id) ? v.id : nanoid(10),
    type,
    x: num(v.x, 0),
    y: num(v.y, 0),
    w: num(v.w, 220, 20, 20_000),
    h: num(v.h, 180, 20, 20_000),
    z: num(v.z, 0, 0, 1e6),
  };
  if (v.color !== undefined) card.color = oneOf(v.color, NOTE_COLORS, 'yellow');
  if (typeof v.text === 'string') card.text = str(v.text, 20_000);
  if (typeof v.tilt === 'number') card.tilt = num(v.tilt, 0, -10, 10);
  if (type === 'page') {
    if (!isId(v.pageId)) return null;
    card.pageId = v.pageId;
  }
  if (type === 'image') {
    const src = safeImageSrc(v.src);
    if (!src) return null;
    card.src = src;
  }
  if (type === 'sketch') card.strokes = sanitizeStrokes(v.strokes);
  if (v.reading === true) card.reading = true;
  if (isObj(v.source) && isId(v.source.pageId)) card.source = { pageId: v.source.pageId, page: num(v.source.page, 1, 1, 1e5) };
  return card;
}

export function sanitizeEdge(v: unknown): SpaceEdge | null {
  if (!isObj(v) || !isId(v.from) || !isId(v.to)) return null;
  const edge: SpaceEdge = { id: isId(v.id) ? v.id : nanoid(8), from: v.from, to: v.to };
  if (v.dashed === true) edge.dashed = true;
  if (typeof v.label === 'string' && v.label) edge.label = str(v.label, 200);
  return edge;
}

export function sanitizeSpace(v: unknown): SpaceData {
  const o = isObj(v) ? v : {};
  const cards = (Array.isArray(o.cards) ? o.cards : []).map(sanitizeCard).filter((c): c is SpaceCard => !!c);
  const ids = new Set(cards.map((c) => c.id));
  const edges = (Array.isArray(o.edges) ? o.edges : []).map(sanitizeEdge).filter((e): e is SpaceEdge => !!e && ids.has(e.from) && ids.has(e.to));
  return { cards, edges, camera: sanitizeCamera(o.camera) };
}

/* ---------------- whiteboard ---------------- */

function sanitizeElement(v: unknown): BoardElement | null {
  if (!isObj(v)) return null;
  const id = isId(v.id) ? v.id : nanoid(8);
  switch (v.type) {
    case 'stroke': {
      const stroke = sanitizeStroke(v.stroke);
      return stroke && { id, type: 'stroke', stroke };
    }
    case 'shape':
      return { id, type: 'shape', shape: oneOf(v.shape, ['rect', 'ellipse', 'diamond'] as const, 'rect'), x: num(v.x, 0), y: num(v.y, 0), w: num(v.w, 100, 1, 1e5), h: num(v.h, 100, 1, 1e5), color: safeColor(v.color), fill: bool(v.fill), ...(typeof v.text === 'string' && { text: str(v.text, 5000) }) };
    case 'arrow':
      return { id, type: 'arrow', x1: num(v.x1, 0), y1: num(v.y1, 0), x2: num(v.x2, 0), y2: num(v.y2, 0), color: safeColor(v.color) };
    case 'text':
      return { id, type: 'text', x: num(v.x, 0), y: num(v.y, 0), text: str(v.text, 20_000), color: safeColor(v.color), size: num(v.size, 24, 6, 400) };
    default:
      return null;
  }
}

function sanitizeBoard(v: unknown): BoardData {
  const o = isObj(v) ? v : {};
  return { elements: (Array.isArray(o.elements) ? o.elements : []).map(sanitizeElement).filter((e): e is BoardElement => !!e), camera: sanitizeCamera(o.camera) };
}

/* ---------------- notebook ---------------- */

function sanitizeNotebook(v: unknown): NotebookData {
  const o = isObj(v) ? v : {};
  const sheets = (Array.isArray(o.sheets) ? o.sheets : []).filter(isObj).map((s) => ({ id: isId(s.id) ? s.id : nanoid(8), strokes: sanitizeStrokes(s.strokes) }));
  return { paper: oneOf(o.paper, PAPERS, 'lined'), tint: oneOf(o.tint, TINTS, 'ivory'), sheets: sheets.length ? sheets : [{ id: nanoid(8), strokes: [] }] };
}

/* ---------------- PDFs ---------------- */

function sanitizeHighlight(v: unknown): PdfHighlight | null {
  if (!isObj(v) || !Array.isArray(v.rects)) return null;
  const rects = v.rects
    .filter((r): r is number[] => Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === 'number' && Number.isFinite(n)))
    .slice(0, 500)
    .map((r) => r.map((n) => Math.min(1, Math.max(0, n))) as [number, number, number, number]);
  if (!rects.length) return null;
  const h: PdfHighlight = { id: isId(v.id) ? v.id : nanoid(8), page: num(v.page, 1, 1, 1e5), color: oneOf(v.color, HIGHLIGHT_COLORS, 'yellow'), text: str(v.text, 20_000), rects };
  if (typeof v.note === 'string' && v.note) h.note = str(v.note, 20_000);
  if (v.pinned === true) h.pinned = true;
  return h;
}

/** The PDF file itself lives in the blob store and isn't part of a backup; only its id and annotations are. */
function sanitizePdf(v: unknown): PdfData | undefined {
  if (!isObj(v) || !isId(v.blobId)) return undefined;
  const pages = num(v.pages, 1, 1, 1e5);
  return {
    blobId: v.blobId,
    pages,
    lastPage: num(v.lastPage, 1, 1, pages),
    highlights: (Array.isArray(v.highlights) ? v.highlights : []).map(sanitizeHighlight).filter((h): h is PdfHighlight => !!h),
  };
}

/* ---------------- documents ---------------- */

/**
 * ProseMirror JSON is validated by the editor's schema when it loads; here
 * we only make sure it *is* a document and that the one attribute we parse
 * ourselves (sketch strokes) is well formed.
 */
function sanitizeDoc(v: unknown): unknown {
  if (!isObj(v) || v.type !== 'doc') return undefined;
  const walk = (node: unknown, depth: number): unknown => {
    if (!isObj(node) || typeof node.type !== 'string' || depth > 200) return null;
    const out: Json = { ...node };
    // images: embedded data or https only (no tracking over plain http, no odd schemes)
    if (node.type === 'image' && !(isObj(node.attrs) && typeof node.attrs.src === 'string' && /^(?:data:image\/|https:\/\/)/i.test(node.attrs.src))) return null;
    if (node.type === 'sketch' && isObj(node.attrs)) out.attrs = { ...node.attrs, strokes: sanitizeStrokes(node.attrs.strokes), height: num(node.attrs.height, 280, 80, 4000) };
    if (Array.isArray(node.content)) out.content = node.content.map((c) => walk(c, depth + 1)).filter(Boolean);
    return out;
  };
  return walk(v, 0) ?? undefined;
}

/* ---------------- pages ---------------- */

export function sanitizePage(v: unknown): Page | null {
  if (!isObj(v) || !isId(v.id) || !PAGE_KINDS.includes(v.kind as PageKind)) return null;
  const kind = v.kind as PageKind;
  const icon = isObj(v.icon) && typeof v.icon.name === 'string' && Object.hasOwn(ICONS, v.icon.name) ? { name: v.icon.name, color: safeColor(v.icon.color, '#5b4cf0') } : null;
  const now = Date.now();
  return {
    id: v.id,
    kind,
    title: str(v.title, 500),
    icon,
    cover: typeof v.cover === 'string' && Object.hasOwn(COVERS, v.cover) ? v.cover : null,
    parentId: isId(v.parentId) && v.parentId !== v.id ? v.parentId : null,
    order: num(v.order, 0, 0, 1e6),
    favorite: bool(v.favorite),
    trashed: bool(v.trashed),
    createdAt: num(v.createdAt, now, 0, 1e14),
    updatedAt: num(v.updatedAt, now, 0, 1e14),
    ...(kind === 'doc' && { doc: sanitizeDoc(v.doc) }),
    ...(kind === 'space' && { space: sanitizeSpace(v.space) }),
    ...(kind === 'board' && { board: sanitizeBoard(v.board) }),
    ...(kind === 'notebook' && { notebook: sanitizeNotebook(v.notebook) }),
    ...(kind === 'pdf' && { pdf: sanitizePdf(v.pdf) }),
  };
}
