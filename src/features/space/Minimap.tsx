import { useRef } from 'react';
import type { Camera, SpaceCard } from '@/store/types';
import { boundsOf, type Rect } from './spaceModel';

const W = 184;
const H = 120;

interface Props {
  cards: SpaceCard[];
  camera: Camera;
  viewport: { w: number; h: number };
  onNavigate: (cam: Camera) => void;
}

/**
 * A bird's-eye overview. Everything (cards + the current view) is scaled by
 * one factor so it fits the minimap box; dragging inside the minimap moves
 * the camera so the view rectangle follows the pointer.
 */
export function Minimap({ cards, camera, viewport, onNavigate }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const view: Rect = { x: camera.x, y: camera.y, w: viewport.w / camera.z, h: viewport.h / camera.z };
  const world = boundsOf([...cards, view])!;
  const pad = 40;
  const scale = Math.min(W / (world.w + pad * 2), H / (world.h + pad * 2));
  const ox = (W - world.w * scale) / 2 - world.x * scale;
  const oy = (H - world.h * scale) / 2 - world.y * scale;

  const navigate = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / scale;
    const wy = (e.clientY - r.top - oy) / scale;
    onNavigate({ ...camera, x: wx - view.w / 2, y: wy - view.h / 2 });
  };

  return (
    <svg
      ref={ref}
      className="minimap"
      width={W}
      height={H}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        navigate(e);
      }}
      onPointerMove={(e) => e.buttons === 1 && navigate(e)}
      role="img"
      aria-label="Minimap"
    >
      {cards.map((c) => (
        <rect
          key={c.id}
          x={ox + c.x * scale}
          y={oy + c.y * scale}
          width={Math.max(2, c.w * scale)}
          height={Math.max(2, c.h * scale)}
          rx={2}
          className={`minimap__card minimap__card--${c.type} ${c.color ? `note--${c.color}` : ''}`}
        />
      ))}
      <rect className="minimap__view" x={ox + view.x * scale} y={oy + view.y * scale} width={view.w * scale} height={view.h * scale} rx={3} />
    </svg>
  );
}
