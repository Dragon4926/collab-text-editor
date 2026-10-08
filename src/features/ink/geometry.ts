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

/**
 * Bounds per stroke object, computed once. Strokes are immutable — an edit
 * produces a new object — so a WeakMap keyed by the stroke can never go
 * stale, and entries disappear with the strokes they describe.
 */
const boundsCache = new WeakMap<Stroke, Box>();
export function cachedBounds(stroke: Stroke): Box {
  let b = boundsCache.get(stroke);
  if (!b) boundsCache.set(stroke, (b = strokeBounds(stroke.points)));
  return b;
}

/** Squared distance from point p to segment ab (no square root needed to compare). */
function distToSegment2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = px - (ax + t * dx);
  const ey = py - (ay + t * dy);
  return ex * ex + ey * ey;
}

/** Shortest distance from point p to segment ab. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(distToSegment2(px, py, ax, ay, bx, by));
}

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Squared distance between segments pq and ab. Zero if they cross;
 * otherwise the closest pair always involves one of the four endpoints.
 */
function segDist2(px: number, py: number, qx: number, qy: number, ax: number, ay: number, bx: number, by: number): number {
  const d1 = cross(px, py, qx, qy, ax, ay);
  const d2 = cross(px, py, qx, qy, bx, by);
  const d3 = cross(ax, ay, bx, by, px, py);
  const d4 = cross(ax, ay, bx, by, qx, qy);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(distToSegment2(px, py, ax, ay, bx, by), distToSegment2(qx, qy, ax, ay, bx, by), distToSegment2(ax, ay, px, py, qx, qy), distToSegment2(bx, by, px, py, qx, qy));
}

/** Does the eraser circle at (x, y) touch this stroke? */
export function hitStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  return sweepHitsStroke(stroke, x, y, x, y, radius);
}

/**
 * Does an eraser of `radius`, swept from (ax, ay) to (bx, by), touch this
 * stroke? Testing the *path* between two pointer samples rather than just
 * the samples means a fast swipe can't skip over a thin line.
 *
 * A bounding-box check rejects almost every stroke before any per-segment
 * maths runs, which is what keeps erasing smooth on pages with thousands of
 * strokes.
 */
export function sweepHitsStroke(stroke: Stroke, ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  const r = radius + (stroke.size * PENS[stroke.pen].sizeScale) / 1.5;
  const box = cachedBounds(stroke);
  if (Math.max(ax, bx) < box.x - r || Math.min(ax, bx) > box.x + box.w + r || Math.max(ay, by) < box.y - r || Math.min(ay, by) > box.y + box.h + r) return false;
  const r2 = r * r;
  const pts = stroke.points;
  if (pts.length === 1) return distToSegment2(pts[0][0], pts[0][1], ax, ay, bx, by) <= r2;
  for (let i = 1; i < pts.length; i++) {
    if (segDist2(ax, ay, bx, by, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= r2) return true;
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
