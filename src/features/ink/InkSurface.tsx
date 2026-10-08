import { useCallback, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Trash2 } from 'lucide-react';
import type { Stroke } from '@/store/types';
import { spring, withFocus } from '@/lib/motion';
import { InkDefs, InkLayer, StrokePath, inkFill } from './InkLayer';
import { INK_COLORS } from './pens';
import { useInkCapture } from './useInkCapture';
import './ink.css';

interface Props {
  strokes: Stroke[];
  commit: (next: Stroke[], before: Stroke[]) => void;
  /** logical size of the drawing area; the SVG scales to fit its box */
  width: number;
  height: number;
  className?: string;
  /** disable input (e.g. read-only previews) */
  readOnly?: boolean;
  /** SVG drawn beneath the ink, e.g. paper lines */
  underlay?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * A fixed-size ink canvas — used for notebook sheets and sketch blocks.
 *
 * The SVG has a `viewBox` of the logical size, so strokes are stored in
 * stable "paper units" no matter how large the sheet is drawn on screen.
 * `toLocal` converts screen pixels to paper units by dividing by the
 * element's current scale.
 */
export function InkSurface({ strokes, commit, width, height, className = '', readOnly, underlay, style }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const filterId = `pencil-${useId().replace(/:/g, '')}`;

  const toLocal = useCallback(
    (e: { clientX: number; clientY: number }): [number, number] => {
      const r = ref.current!.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
    },
    [width, height],
  );

  const ink = useInkCapture({ strokes, commit, toLocal });
  const box = ink.selectionBox;

  return (
    <div className={`ink-surface mode-${ink.mode} ${className}`} style={style}>
      <svg
        ref={ref}
        className="ink-surface__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        {...(readOnly ? {} : ink.handlers)}
      >
        <InkDefs id={filterId} />
        {underlay}
        <InkLayer strokes={ink.strokes} selected={ink.selected} filterId={filterId} />
        {ink.live && <StrokePath stroke={ink.live} complete={false} filterId={filterId} />}
        {ink.lasso && <path className="ink-lasso" d={`M${ink.lasso.map((p) => p.join(',')).join(' L')}`} />}
        {box && <rect className="ink-selection" x={box.x} y={box.y} width={box.w} height={box.h} rx={6} />}
        {/* positioned imperatively by useInkCapture, so hovering costs no renders */}
        {ink.mode === 'erase' && <circle ref={ink.eraserRef} className="ink-eraser" r={8} style={{ visibility: 'hidden' }} />}
      </svg>

      <AnimatePresence>
        {box && (
          <motion.div
            className="ink-selection-bar"
            style={{ left: `${((box.x + box.w / 2) / width) * 100}%`, top: `${(box.y / height) * 100}%` }}
            initial={{ opacity: 0, y: 6, scale: 0.95, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            exit={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
            transition={withFocus(spring.snappy)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {INK_COLORS.slice(0, 7).map((c) => (
              <button key={c} type="button" className="ink-selection-bar__swatch" style={{ background: inkFill(c) }} aria-label={`Recolor ${c}`} onClick={() => ink.recolorSelection(c)} />
            ))}
            <span className="ink-selection-bar__sep" />
            <button type="button" aria-label="Duplicate selection" title="Duplicate" onClick={ink.duplicateSelection}>
              <Copy width={14} height={14} />
            </button>
            <button type="button" aria-label="Delete selection" title="Delete" onClick={ink.deleteSelection}>
              <Trash2 width={14} height={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
