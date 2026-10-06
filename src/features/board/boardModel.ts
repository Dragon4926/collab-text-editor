import type { BoardElement } from '@/store/types';
import { distToSegment, hitStroke, strokeBounds, translateStroke, type Box } from '@/features/ink/geometry';

/**
 * Geometry for whiteboard elements. Every element type answers the same
 * three questions — where is it (bounds), is a point on it (hit), and how
 * does it move (translate) — so tools can treat all elements uniformly.
 * This is a tiny example of *polymorphism via a discriminated union*: we
 * switch on `el.type` and TypeScript narrows the type in each branch.
 */

export const TEXT_LINE = 1.3;

export function elementBounds(el: BoardElement): Box {
  switch (el.type) {
    case 'stroke':
      return strokeBounds(el.stroke.points, el.stroke.size * 2);
    case 'shape':
      return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
    case 'arrow':
      return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    case 'text': {
      const lines = el.text.split('\n');
      const w = Math.max(...lines.map((l) => l.length), 4) * el.size * 0.55;
      return { x: el.x, y: el.y, w, h: lines.length * el.size * TEXT_LINE };
    }
  }
}

export function hitElement(el: BoardElement, x: number, y: number, tolerance: number): boolean {
  switch (el.type) {
    case 'stroke':
      return hitStroke(el.stroke, x, y, tolerance);
    case 'arrow':
      return distToSegment(x, y, el.x1, el.y1, el.x2, el.y2) <= tolerance + 3;
    default: {
      const b = elementBounds(el);
      return x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance;
    }
  }
}

export function translateElement(el: BoardElement, dx: number, dy: number): BoardElement {
  switch (el.type) {
    case 'stroke':
      return { ...el, stroke: translateStroke(el.stroke, dx, dy) };
    case 'arrow':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    default:
      return { ...el, x: el.x + dx, y: el.y + dy };
  }
}

/** Normalise a shape so width/height are positive (after dragging up-left). */
export function normaliseShape<T extends { x: number; y: number; w: number; h: number }>(s: T): T {
  return { ...s, x: Math.min(s.x, s.x + s.w), y: Math.min(s.y, s.y + s.h), w: Math.abs(s.w), h: Math.abs(s.h) };
}

export const boxesIntersect = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** SVG path for a diamond inside a box. */
export const diamondPath = (x: number, y: number, w: number, h: number) =>
  `M${x + w / 2},${y} L${x + w},${y + h / 2} L${x + w / 2},${y + h} L${x},${y + h / 2} Z`;
