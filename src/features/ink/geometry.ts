import { getStroke } from 'perfect-freehand';
import type { InkPoint, Stroke } from '@/store/types';
import { PENS } from './pens';

/**
 * Geometry helpers for ink: turning points into SVG paths, measuring
 * bounds and hit testing for the eraser and lasso.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Turn perfect-freehand's outline polygon into a smooth SVG path.
 *
 * Joining outline points with straight lines looks faceted. Instead we draw
 * *quadratic Béziers* using each point as a control point and the midpoint
 * to the next point as the end — the classic "midpoint smoothing" trick.
 */
export function outlineToPath(outline: number[][]): string {
  const n = outline.length;
  if (n < 4) return '';
  const avg = (a: number, b: number) => (a + b) / 2;
  let a = outline[0];
  let b = outline[1];
  const c = outline[2];
  let d = `M${a[0].toFixed(2)},${a[1].toFixed(2)} Q${b[0].toFixed(2)},${b[1].toFixed(2)} ${avg(b[0], c[0]).toFixed(2)},${avg(b[1], c[1]).toFixed(2)} T`;
  for (let i = 2; i < n - 1; i++) {
    a = outline[i];
    b = outline[i + 1];
    d += `${avg(a[0], b[0]).toFixed(2)},${avg(a[1], b[1]).toFixed(2)} `;
  }
  return d + 'Z';
}

/** SVG path data for a stroke, honouring its pen preset. */
export function strokePath(stroke: Pick<Stroke, 'points' | 'pen' | 'size'>, complete = true): string {
  const pen = PENS[stroke.pen];
  const pressureFromDevice = stroke.points.some((p) => p[2] !== 0.5);
  const outline = getStroke(stroke.points, {
    ...pen.options,
    size: stroke.size * pen.sizeScale * 2,
    simulatePressure: !pressureFromDevice,
    last: complete,
  });
  return outlineToPath(outline);
}

export function strokeBounds(points: InkPoint[], pad = 0): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function unionBounds(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Shortest distance from point p to segment ab. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Does the eraser circle at (x, y) touch this stroke? */
export function hitStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  const r = radius + (stroke.size * PENS[stroke.pen].sizeScale) / 1.5;
  const pts = stroke.points;
  if (pts.length === 1) return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= r;
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r) return true;
  }
  return false;
}

/**
 * Ray-casting point-in-polygon test: shoot a ray to the right and count how
 * many polygon edges it crosses. Odd = inside, even = outside.
 */
export function pointInPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A stroke counts as lassoed when most of its points fall inside the loop. */
export function strokeInLasso(stroke: Stroke, lasso: number[][]): boolean {
  if (lasso.length < 3) return false;
  let inside = 0;
  for (const [x, y] of stroke.points) if (pointInPolygon(x, y, lasso)) inside++;
  return inside / stroke.points.length > 0.6;
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...stroke, points: stroke.points.map(([x, y, p]) => [x + dx, y + dy, p] as InkPoint) };
}
