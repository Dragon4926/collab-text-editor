import type { InkPoint } from '@/store/types';

/**
 * Shape recognition — "draw and hold".
 *
 * When you finish a stroke and keep the pen still for a moment, Samsung
 * Notes and Apple Notes replace your wobbly line with a perfect one. This is
 * a small, rule-based version of that idea. No machine learning: just a few
 * geometric measurements and thresholds.
 *
 *  1. LINE      the straight distance between the ends is almost the whole
 *               path length (a wobbly line is only slightly longer than its
 *               chord).
 *  2. closed?   the ends meet (gap < 25% of the path length) → it's a loop.
 *  3. RECTANGLE most points hug the bounding box's edges.
 *  4. ELLIPSE   points sit near the ellipse inscribed in the bounding box:
 *               for a perfect ellipse ((x−cx)/rx)² + ((y−cy)/ry)² = 1.
 */

export type ShapeKind = 'line' | 'rectangle' | 'ellipse';

const dist = (a: InkPoint, b: InkPoint) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pathLength(pts: InkPoint[]) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}

/** Evenly spaced points along a straight segment. */
function lerpLine(a: [number, number], b: [number, number], n = 24): InkPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.5] as InkPoint;
  });
}

export function recognizeShape(points: InkPoint[]): { kind: ShapeKind; points: InkPoint[] } | null {
  if (points.length < 8) return null;
  const len = pathLength(points);
  if (len < 30) return null;
  const first = points[0];
  const last = points[points.length - 1];

  // 1. straight line
  if (dist(first, last) / len > 0.94) {
    return { kind: 'line', points: lerpLine([first[0], first[1]], [last[0], last[1]]) };
  }

  // 2. must be a closed loop for the other shapes
  if (dist(first, last) > len * 0.25) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 16 || h < 16) return null;

  // 3. rectangle: average distance to the nearest bbox edge, relative to size
  const edgeErr =
    points.reduce((s, [x, y]) => s + Math.min(x - minX, maxX - x, y - minY, maxY - y), 0) / points.length / Math.min(w, h);
  if (edgeErr < 0.06) {
    const c: [number, number][] = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]];
    const pts: InkPoint[] = [];
    for (let i = 0; i < 4; i++) pts.push(...lerpLine(c[i], c[i + 1], 12).slice(i ? 1 : 0));
    return { kind: 'rectangle', points: pts };
  }

  // 4. ellipse: how far is each point from the inscribed ellipse?
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = w / 2;
  const ry = h / 2;
  const ellErr = points.reduce((s, [x, y]) => s + Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1), 0) / points.length;
  if (ellErr < 0.14) {
    const n = 72;
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.5] as InkPoint;
    });
    return { kind: 'ellipse', points: pts };
  }

  return null;
}
