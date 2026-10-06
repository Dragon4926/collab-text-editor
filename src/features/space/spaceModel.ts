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
