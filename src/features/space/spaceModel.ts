import { nanoid } from 'nanoid';
import type { NoteColor, SpaceCard, SpaceCardType } from '@/store/types';

/** Default sizes per card type, in world units. */
const SIZES: Record<SpaceCardType, [number, number]> = {
  note: [220, 180],
  text: [280, 60],
  page: [300, 220],
  frame: [520, 380],
  image: [320, 220],
  sketch: [360, 260],
};

export const NOTE_COLORS: NoteColor[] = ['yellow', 'green', 'blue', 'pink', 'purple', 'gray'];

export function makeCard(type: SpaceCardType, x: number, y: number, z: number, extra: Partial<SpaceCard> = {}): SpaceCard {
  const [w, h] = SIZES[type];
  return {
    id: nanoid(10),
    type,
    // centre the card on the point
    x: Math.round(x - w / 2),
    y: Math.round(y - h / 2),
    w,
    h,
    z,
    ...(type === 'note' && { color: 'yellow' as NoteColor, text: '', tilt: Math.round((Math.random() - 0.5) * 4 * 10) / 10 }),
    ...(type === 'text' && { text: '' }),
    ...(type === 'frame' && { text: 'Frame' }),
    ...(type === 'sketch' && { strokes: [] }),
    ...extra,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const rectsOverlap = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function boundsOf(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
}

/**
 * Where does the line from a rect's centre towards (tx, ty) leave the rect?
 * Used to start/end connectors on card borders instead of card centres.
 *
 * Parametrise the ray as c + t·d. It exits through a vertical side when
 * t = (w/2)/|dx| and through a horizontal side when t = (h/2)/|dy|;
 * the smaller t is the side it actually crosses first.
 */
export function borderPoint(r: Rect, tx: number, ty: number, gap = 6): [number, number] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const tX = dx !== 0 ? (r.w / 2 + gap) / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? (r.h / 2 + gap) / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return [cx + dx * t, cy + dy * t];
}

/**
 * A gentle S-curve between two points. Control points extend along the
 * dominant axis, which keeps connectors tidy for both side-by-side and
 * stacked cards.
 */
export function connectorPath(a: [number, number], b: [number, number]): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const k = 0.45;
  const c1 = horizontal ? [a[0] + dx * k, a[1]] : [a[0], a[1] + dy * k];
  const c2 = horizontal ? [b[0] - dx * k, b[1]] : [b[0], b[1] - dy * k];
  return `M${a[0]},${a[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${b[0]},${b[1]}`;
}

/** The midpoint of a connector, for its label. A cubic Bézier at t = ½ is (P0 + 3C1 + 3C2 + P3) / 8. */
export function connectorMidpoint(a: [number, number], b: [number, number]): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const k = 0.45;
  const c1 = horizontal ? [a[0] + dx * k, a[1]] : [a[0], a[1] + dy * k];
  const c2 = horizontal ? [b[0] - dx * k, b[1]] : [b[0], b[1] - dy * k];
  return [(a[0] + 3 * c1[0] + 3 * c2[0] + b[0]) / 8, (a[1] + 3 * c1[1] + 3 * c2[1] + b[1]) / 8];
}

/* ------------------------------------------------------------------ */
/* Snapping                                                            */
/* ------------------------------------------------------------------ */

/** matches the dot grid drawn by cameraStyles */
export const GRID = 24;

/** an alignment guide: a vertical (x) or horizontal (y) line segment in world units */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
  from: number;
  to: number;
}

/** the three lines of a rect along one axis: start, centre, end */
const lines = (r: Rect, axis: 'x' | 'y') => (axis === 'x' ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]);

/**
 * Where should a dragged selection land? Smart guides first: if any edge or
 * centre of the moving box comes within `threshold` of an edge or centre of
 * another card, snap to it and report a guide line to draw. Otherwise fall
 * back to the 24-unit grid, so loose cards still line up with the dots.
 *
 * Each axis is solved independently — you can align to one card
 * horizontally and another vertically.
 */
export function snapBox(box: Rect, others: Rect[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const solve = (axis: 'x' | 'y') => {
    let best: { delta: number; at: number } | null = null;
    const mine = lines(box, axis);
    for (const o of others) {
      for (const theirs of lines(o, axis)) {
        for (const m of mine) {
          const delta = theirs - m;
          if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: theirs };
        }
      }
    }
    if (!best) {
      const start = axis === 'x' ? box.x : box.y;
      const snapped = Math.round(start / GRID) * GRID;
      return Math.abs(snapped - start) <= threshold ? snapped - start : 0;
    }
    // a guide spans every card that shares the line, plus the moved box
    const { delta, at } = best;
    const moved = axis === 'x' ? { ...box, x: box.x + delta } : { ...box, y: box.y + delta };
    const touching = [moved, ...others.filter((o) => lines(o, axis).some((l) => Math.abs(l - at) < 0.5))];
    const cross = (r: Rect) => (axis === 'x' ? [r.y, r.y + r.h] : [r.x, r.x + r.w]);
    guides.push({ axis, at, from: Math.min(...touching.map((r) => cross(r)[0])), to: Math.max(...touching.map((r) => cross(r)[1])) });
    return delta;
  };
  const dx = solve('x');
  const dy = solve('y');
  return { dx, dy, guides };
}

/* ------------------------------------------------------------------ */
/* Arrange                                                             */
/* ------------------------------------------------------------------ */

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** New positions that line every rect up with the selection's bounds. */
export function alignRects<T extends Rect & { id: string }>(rects: T[], mode: AlignMode): Map<string, { x: number; y: number }> {
  const b = boundsOf(rects)!;
  const out = new Map<string, { x: number; y: number }>();
  for (const r of rects) {
    let { x, y } = r;
    if (mode === 'left') x = b.x;
    else if (mode === 'hcenter') x = Math.round(b.x + b.w / 2 - r.w / 2);
    else if (mode === 'right') x = b.x + b.w - r.w;
    else if (mode === 'top') y = b.y;
    else if (mode === 'vcenter') y = Math.round(b.y + b.h / 2 - r.h / 2);
    else y = b.y + b.h - r.h;
    out.set(r.id, { x, y });
  }
  return out;
}

/** Spread rects so the gaps between neighbours are equal; the outermost two stay put. */
export function distributeRects<T extends Rect & { id: string }>(rects: T[], axis: 'x' | 'y'): Map<string, { x: number; y: number }> {
  const size = (r: Rect) => (axis === 'x' ? r.w : r.h);
  const pos = (r: Rect) => (axis === 'x' ? r.x : r.y);
  const sorted = [...rects].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((sum, r) => sum + size(r), 0)) / (sorted.length - 1);
  const out = new Map<string, { x: number; y: number }>();
  let cursor = pos(first);
  for (const r of sorted) {
    out.set(r.id, axis === 'x' ? { x: Math.round(cursor), y: r.y } : { x: r.x, y: Math.round(cursor) });
    cursor += size(r) + gap;
  }
  return out;
}
