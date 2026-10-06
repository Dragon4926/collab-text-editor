import { Maximize, Minus, Plus } from 'lucide-react';
import './canvas.css';

interface Props {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onFit: () => void;
}

/** Bottom-left zoom pill shared by the spatial space and the whiteboard. */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset, onFit }: Props) {
  return (
    <div className="zoom-pill" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" aria-label="Zoom out" title="Zoom out (⌘−)" onClick={onZoomOut}>
        <Minus width={14} height={14} />
      </button>
      <button type="button" className="zoom-pill__value" title="Reset to 100% (⌘0)" onClick={onReset}>
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="Zoom in" title="Zoom in (⌘+)" onClick={onZoomIn}>
        <Plus width={14} height={14} />
      </button>
      <span className="zoom-pill__sep" />
      <button type="button" aria-label="Zoom to fit" title="Zoom to fit (⌘1)" onClick={onFit}>
        <Maximize width={14} height={14} />
      </button>
    </div>
  );
}
