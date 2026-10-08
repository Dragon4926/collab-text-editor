import { memo, useEffect, useRef } from 'react';
import type { SpaceCard, SpaceEdge } from '@/store/types';
import { borderPoint, connectorMidpoint, connectorPath } from './spaceModel';

interface Props {
  edges: SpaceEdge[];
  cards: Record<string, SpaceCard>;
  selectedEdge: string | null;
  onSelect: (id: string) => void;
  /** the edge whose label is being typed, if any */
  editingEdge: string | null;
  onEditLabel: (id: string | null) => void;
  onLabel: (id: string, label: string) => void;
  /** in-progress connection while dragging from a card's handle */
  draft: { from: string; to: [number, number] } | null;
}

/** the two border points a connector runs between */
function endpoints(a: SpaceCard, target: [number, number], end?: SpaceCard): [[number, number], [number, number]] {
  const ac: [number, number] = [a.x + a.w / 2, a.y + a.h / 2];
  const bc: [number, number] = end ? [end.x + end.w / 2, end.y + end.h / 2] : target;
  return [borderPoint(a, bc[0], bc[1]), end ? borderPoint(end, ac[0], ac[1], 10) : target];
}

/**
 * Connectors live in one SVG that sits in world space. The SVG itself is
 * 1×1 px with `overflow: visible`, so paths can be drawn anywhere without
 * having to size the SVG to the whole world.
 *
 * Each edge is drawn twice: a wide transparent "hit" path that is easy to
 * click, and the thin visible path on top. Labels are HTML, centred on the
 * curve's midpoint, so they get real text rendering and an inline editor.
 */
export const Edges = memo(function Edges({ edges, cards, selectedEdge, onSelect, editingEdge, onEditLabel, onLabel, draft }: Props) {
  const drawn = edges.flatMap((e) => {
    const a = cards[e.from];
    const b = cards[e.to];
    if (!a || !b) return [];
    const [p1, p2] = endpoints(a, [0, 0], b);
    return [{ e, d: connectorPath(p1, p2), mid: connectorMidpoint(p1, p2) }];
  });

  return (
    <>
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
        {drawn.map(({ e, d }) => (
          <g key={e.id} className={`space-edge ${selectedEdge === e.id ? 'is-selected' : ''} ${e.dashed ? 'is-dashed' : ''}`}>
            <path
              d={d}
              className="space-edge__hit"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                onSelect(e.id);
              }}
              onDoubleClick={(ev) => {
                ev.stopPropagation();
                onEditLabel(e.id);
              }}
            />
            <path d={d} className="space-edge__line" markerEnd={`url(#space-arrow${selectedEdge === e.id ? '-sel' : ''})`} />
          </g>
        ))}
        {draft && cards[draft.from] && <path className="space-edge__line is-draft" d={connectorPath(...endpoints(cards[draft.from], draft.to))} markerEnd="url(#space-arrow-sel)" />}
      </svg>

      {drawn.map(({ e, mid }) =>
        editingEdge === e.id ? (
          <LabelEditor key={e.id} at={mid} value={e.label ?? ''} onChange={(v) => onLabel(e.id, v)} onDone={() => onEditLabel(null)} />
        ) : e.label ? (
          <div
            key={e.id}
            className={`space-edge__label ${selectedEdge === e.id ? 'is-selected' : ''}`}
            style={{ left: mid[0], top: mid[1] }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              onSelect(e.id);
            }}
            onDoubleClick={(ev) => {
              ev.stopPropagation();
              onEditLabel(e.id);
            }}
          >
            {e.label}
          </div>
        ) : null,
      )}
    </>
  );
});

function LabelEditor({ at, value, onChange, onDone }: { at: [number, number]; value: string; onChange: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="space-edge__label space-edge__label--editing"
      style={{ left: at[0], top: at[1], width: `${Math.max(6, value.length + 2)}ch` }}
      value={value}
      maxLength={200}
      placeholder="Label"
      aria-label="Connector label"
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') onDone();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
