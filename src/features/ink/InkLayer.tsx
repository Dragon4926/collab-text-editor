import { memo, useMemo } from 'react';
import type { Stroke } from '@/store/types';
import { strokePath } from './geometry';
import { PENS } from './pens';

/**
 * Black ink is stored as a fixed hex, but rendered through the
 * `--ink-black` token so it flips to near-white on dark surfaces — the same
 * trick Samsung Notes uses in dark mode.
 */
export const inkFill = (color: string) => (color.toLowerCase() === '#1d1d1f' ? 'var(--ink-black)' : color);

interface StrokePathProps {
  stroke: Stroke;
  complete?: boolean;
  selected?: boolean;
  filterId?: string;
}

/**
 * One stroke. `memo` + `useMemo` mean a stroke's path string is computed
 * once and only recomputed if that stroke object changes. Drawing a new
 * stroke therefore doesn't recompute the hundreds already on the page.
 */
export const StrokePath = memo(function StrokePath({ stroke, complete = true, selected, filterId }: StrokePathProps) {
  const d = useMemo(() => strokePath(stroke, complete), [stroke, complete]);
  const pen = PENS[stroke.pen];
  return (
    <path
      d={d}
      fill={inkFill(stroke.color)}
      opacity={pen.opacity}
      className={`ink-stroke ${pen.blend === 'multiply' ? 'ink-stroke--hl' : ''} ${selected ? 'is-selected' : ''}`}
      filter={pen.textured && filterId ? `url(#${filterId})` : undefined}
    />
  );
});

/**
 * SVG <defs> for ink: a pencil "grain" filter. feTurbulence generates fractal
 * noise; feDisplacementMap nudges the stroke's edge pixels by that noise,
 * which roughens the outline like graphite on paper.
 */
export function InkDefs({ id }: { id: string }) {
  return (
    <defs>
      <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feComponentTransfer in="noise" result="grain">
          <feFuncA type="discrete" tableValues="0.55 0.85 1 1" />
        </feComponentTransfer>
        <feComposite in="rough" in2="grain" operator="in" />
      </filter>
    </defs>
  );
}

export function InkLayer({ strokes, selected, filterId }: { strokes: Stroke[]; selected?: Set<string>; filterId: string }) {
  return (
    <g className="ink-layer">
      {strokes.map((s) => (
        <StrokePath key={s.id} stroke={s} selected={selected?.has(s.id)} filterId={filterId} />
      ))}
    </g>
  );
}
