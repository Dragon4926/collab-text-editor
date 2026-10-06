import { useCallback, useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';
import type { Camera } from '@/store/types';
import { clampZoom, fitBounds, panBy, screenToWorld, zoomAt } from './camera';

interface Options {
  initial: Camera;
  /** called (debounced) when the camera comes to rest — for persistence */
  onSettle?: (cam: Camera) => void;
}

/**
 * Interactive camera for an infinite canvas.
 *
 * Input mapping (matches Figma / Freeform / tldraw conventions):
 *   trackpad two-finger scroll   → pan
 *   trackpad pinch / ⌘+wheel     → zoom at cursor   (browsers report a pinch
 *                                    as a wheel event with ctrlKey = true)
 *   mouse wheel                  → pan vertically (⇧ for horizontal)
 *   space + drag / middle drag   → pan
 *   two-finger touch             → pan + pinch zoom
 *
 * The camera lives in React state for instant feedback and is reported to
 * `onSettle` 300 ms after the last change so we don't write to IndexedDB at
 * 60 fps while the user is panning.
 */
export function useCamera({ initial, onSettle }: Options) {
  const [camera, setCameraState] = useState<Camera>(initial);
  const camRef = useRef(camera);
  const viewport = useRef<HTMLDivElement | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopAnim = useRef<(() => void) | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);

  const setCamera = useCallback(
    (next: Camera | ((c: Camera) => Camera)) => {
      const value = typeof next === 'function' ? next(camRef.current) : next;
      camRef.current = value;
      setCameraState(value);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => onSettle?.(camRef.current), 300);
    },
    [onSettle],
  );

  /** viewport-relative position of a client point */
  const local = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = viewport.current?.getBoundingClientRect();
    return r ? [clientX - r.left, clientY - r.top] : [clientX, clientY];
  }, []);

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const [sx, sy] = local(e.clientX, e.clientY);
      return screenToWorld(camRef.current, sx, sy);
    },
    [local],
  );

  /** Smoothly move the camera to a target with a spring. */
  const flyTo = useCallback(
    (target: Camera) => {
      stopAnim.current?.();
      const from = camRef.current;
      const ctrl = animate(0, 1, {
        type: 'spring',
        stiffness: 200,
        damping: 30,
        onUpdate: (t) => {
          // interpolate zoom geometrically so it feels uniform at every scale
          const z = from.z * Math.pow(target.z / from.z, t);
          setCamera({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t, z });
        },
      });
      stopAnim.current = () => ctrl.stop();
    },
    [setCamera],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const r = viewport.current?.getBoundingClientRect();
      if (!r) return;
      flyTo(zoomAt(camRef.current, r.width / 2, r.height / 2, clampZoom(camRef.current.z * factor)));
    },
    [flyTo],
  );

  const resetZoom = useCallback(() => {
    const r = viewport.current?.getBoundingClientRect();
    if (r) flyTo(zoomAt(camRef.current, r.width / 2, r.height / 2, 1));
  }, [flyTo]);

  const fit = useCallback(
    (box: { x: number; y: number; w: number; h: number } | null) => {
      const r = viewport.current?.getBoundingClientRect();
      if (!r || !box) return;
      flyTo(fitBounds(box, r.width, r.height));
    },
    [flyTo],
  );

  /* ---------- wheel: must be a non-passive native listener to preventDefault ---------- */
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // let scrollable children (e.g. a page card's preview) scroll normally
      if ((e.target as HTMLElement).closest('[data-wheel-scroll]') && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      stopAnim.current?.();
      const [sx, sy] = local(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) {
        // exponential zoom: equal wheel deltas give equal *ratios*
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025) * (e.ctrlKey && !e.metaKey ? 4 : 1));
        setCamera((c) => zoomAt(c, sx, sy, c.z * factor));
      } else {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        setCamera((c) => panBy(c, -dx, -dy));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [local, setCamera]);

  /* ---------- space bar = temporary hand tool ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /* ---------- drag-to-pan and two-finger pinch ---------- */
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ dist: number; mid: [number, number] } | null>(null);

  /**
   * Returns true if the camera consumed this pointerdown (so the caller's
   * tool logic should ignore it).
   */
  const handlePointerDown = useCallback(
    (e: React.PointerEvent, forcePan = false) => {
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: local((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
        setPanning(true);
        return true;
      }
      if (forcePan || spaceDown || e.button === 1) {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setPanning(true);
        e.preventDefault();
        return true;
      }
      return false;
    },
    [spaceDown, local],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return false;
      pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const mid = local((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        const p = pinch.current;
        setCamera((c) => panBy(zoomAt(c, mid[0], mid[1], c.z * (dist / p.dist)), mid[0] - p.mid[0], mid[1] - p.mid[1]));
        pinch.current = { dist, mid };
        return true;
      }
      if (panning) {
        setCamera((c) => panBy(c, e.clientX - prev[0], e.clientY - prev[1]));
        return true;
      }
      return false;
    },
    [panning, local, setCamera],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setPanning(false);
  }, []);

  useEffect(() => () => clearTimeout(settleTimer.current), []);

  return {
    camera,
    setCamera,
    viewport,
    toWorld,
    local,
    flyTo,
    zoomBy,
    resetZoom,
    fit,
    spaceDown,
    panning,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

/** CSS for the world layer and a zoom-aware dot grid background. */
export function cameraStyles(cam: Camera, grid = 24) {
  const size = grid * cam.z;
  return {
    world: { transform: `scale(${cam.z}) translate(${-cam.x}px, ${-cam.y}px)` },
    background: {
      backgroundSize: `${size}px ${size}px`,
      backgroundPosition: `${-cam.x * cam.z}px ${-cam.y * cam.z}px`,
    },
  };
}
