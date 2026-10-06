import type { Camera } from '@/store/types';

/**
 * Camera math for infinite canvases.
 *
 * The camera says which part of the infinite *world* is visible:
 *   (x, y) = world coordinate at the viewport's top-left corner
 *   z      = zoom (screen pixels per world unit)
 *
 * Converting between the two spaces:
 *
 *   screen = (world - camera) * z
 *   world  = screen / z + camera
 *
 * In CSS the world layer gets `transform: scale(z) translate(-x, -y)` with
 * `transform-origin: 0 0`, which applies exactly that formula to every
 * child — cards just use world coordinates.
 */

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function screenToWorld(cam: Camera, sx: number, sy: number): [number, number] {
  return [sx / cam.z + cam.x, sy / cam.z + cam.y];
}

export function worldToScreen(cam: Camera, wx: number, wy: number): [number, number] {
  return [(wx - cam.x) * cam.z, (wy - cam.y) * cam.z];
}

/**
 * Zoom while keeping the world point under the cursor fixed — the behaviour
 * that makes zooming feel like "diving into" a spot rather than drifting.
 *
 * The world point under screen point p before zoom is  w = p / z + c.
 * After zoom it must still be w:  w = p / z' + c'  →  c' = w - p / z'.
 */
export function zoomAt(cam: Camera, sx: number, sy: number, nextZ: number): Camera {
  const z = clampZoom(nextZ);
  const [wx, wy] = screenToWorld(cam, sx, sy);
  return { x: wx - sx / z, y: wy - sy / z, z };
}

export function panBy(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.z, y: cam.y - dyScreen / cam.z };
}

/** Camera that fits a world-space box inside a viewport, with padding. */
export function fitBounds(box: { x: number; y: number; w: number; h: number }, vw: number, vh: number, pad = 80, maxZ = 1): Camera {
  const z = clampZoom(Math.min((vw - pad * 2) / Math.max(box.w, 1), (vh - pad * 2) / Math.max(box.h, 1), maxZ));
  return { z, x: box.x + box.w / 2 - vw / 2 / z, y: box.y + box.h / 2 - vh / 2 / z };
}
