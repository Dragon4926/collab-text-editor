import { memo } from 'react';
import type { SpaceCard, SpaceEdge } from '@/store/types';
import { borderPoint, connectorPath } from './spaceModel';

interface Props {
  edges: SpaceEdge[];
  cards: Record<string, SpaceCard>;
  selectedEdge: string | null;
  onSelect: (id: string) => void;
  /** in-progress connection while dragging from a card's handle */
  draft: { from: string; to: [number, number] } | null;
}

/**
 * Connectors live in one SVG that sits in world space. The SVG itself is
 * 1×1 px with `overflow: visible`, so paths can be drawn anywhere without
 * having to size the SVG to the whole world.
 *
 * Each edge is drawn twice: a wide transparent "hit" path that is easy to
 * click, and the thin visible path on top.
 */
export const Edges = memo(function Edges({ edges, cards, selectedEdge, onSelect, draft }: Props) {
  const path = (a: SpaceCard, target: [number, number], end?: SpaceCard) => {
    const ac: [number, number] = [a.x + a.w / 2, a.y + a.h / 2];
    const bc: [number, number] = end ? [end.x + end.w / 2, end.y + end.h / 2] : target;
    const p1 = borderPoint(a, bc[0], bc[1]);
    const p2 = end ? borderPoint(end, ac[0], ac[1], 10) : target;
    return connectorPath(p1, p2);
  };

  return (
    <svg className="space-edges" width="1" height="1" aria-hidden="true">
      <defs>
        {/* marker contents can't inherit the referencing path's colour in every
            browser, so there is one marker per state */}
        {['', '-sel'].map((v) => (
          <marker key={v} id={`space-arrow${v}`} className={`space-arrow${v}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1 1 L8 5 L1 9" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        ))}
      </defs>
      {edges.map((e) => {
        const a = cards[e.from];
        const b = cards[e.to];
        if (!a || !b) return null;
        const d = path(a, [0, 0], b);
        return (
          <g key={e.id} className={`space-edge ${selectedEdge === e.id ? 'is-selected' : ''} ${e.dashed ? 'is-dashed' : ''}`}>
            <path
              d={d}
              className="space-edge__hit"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelect(e.id);
              }}
            />
            <path d={d} className="space-edge__line" markerEnd={`url(#space-arrow${selectedEdge === e.id ? '-sel' : ''})`} />
          </g>
        );
      })}
      {draft && cards[draft.from] && <path className="space-edge__line is-draft" d={path(cards[draft.from], draft.to)} markerEnd="url(#space-arrow-sel)" />}
    </svg>
  );
});
