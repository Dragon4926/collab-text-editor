import { memo, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpRight, PenLine } from 'lucide-react';
import { displayTitle, useWorkspace } from '@/store/workspace';
import type { SpaceCard as Card, Stroke } from '@/store/types';
import { PageIcon, KIND_LABEL } from '@/components/ui/PageIcon';
import { COVERS } from '@/features/page/covers';
import { InkSurface } from '@/features/ink/InkSurface';
import { InkLayer } from '@/features/ink/InkLayer';
import { docToText } from '@/lib/text';
import { spring, withFocus } from '@/lib/motion';

export interface CardHandlers {
  onCardPointerDown: (e: React.PointerEvent, card: Card) => void;
  onResizeStart: (e: React.PointerEvent, card: Card) => void;
  onConnectStart: (e: React.PointerEvent, card: Card) => void;
  onEdit: (id: string | null) => void;
  onChange: (id: string, patch: Partial<Card>) => void;
  onSketchCommit: (id: string, next: Stroke[], before: Stroke[]) => void;
  onOpenPage: (pageId: string) => void;
}

interface Props extends CardHandlers {
  card: Card;
  selected: boolean;
  editing: boolean;
  /** zoomed far out: show simplified, enlarged labels (semantic zoom) */
  far: boolean;
}

/**
 * One card on the spatial canvas. The wrapper is absolutely positioned in
 * *world* coordinates; the camera transform on the parent does the rest.
 */
export const SpaceCardView = memo(function SpaceCardView(props: Props) {
  const { card, selected, editing, far, onCardPointerDown, onResizeStart, onConnectStart } = props;

  return (
    <motion.div
      className={`space-card space-card--${card.type} ${card.color ? `note--${card.color}` : ''} ${selected ? 'is-selected' : ''} ${editing ? 'is-editing' : ''}`}
      style={{ left: card.x, top: card.y, width: card.w, height: card.h, zIndex: card.type === 'frame' ? 0 : card.z, rotate: card.type === 'note' ? card.tilt ?? 0 : 0 }}
      initial={{ scale: 0.7, opacity: 0, filter: 'blur(10px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
      transition={withFocus(spring.bouncy)}
      onPointerDown={(e) => onCardPointerDown(e, card)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (card.type === 'page' && card.pageId) props.onOpenPage(card.pageId);
        else if (card.type === 'note' || card.type === 'text' || card.type === 'frame') props.onEdit(card.id);
      }}
      data-card={card.id}
    >
      <CardBody {...props} far={far} />

      {card.type !== 'frame' && (
        <button type="button" className="space-card__connect" aria-label="Drag to connect" title="Drag to connect" onPointerDown={(e) => onConnectStart(e, card)} />
      )}
      {selected && <span className="space-card__resize" onPointerDown={(e) => onResizeStart(e, card)} aria-hidden="true" />}
    </motion.div>
  );
});

function CardBody({ card, editing, far, onEdit, onChange, onSketchCommit }: Props) {
  switch (card.type) {
    case 'note':
    case 'text':
      return editing ? (
        <EditableText value={card.text ?? ''} onChange={(text) => onChange(card.id, { text })} onDone={() => onEdit(null)} className="space-card__text" />
      ) : (
        <div className={`space-card__text ${card.text ? '' : 'is-empty'}`}>{card.text || (card.type === 'note' ? 'Double-click to write' : 'Text')}</div>
      );
    case 'frame':
      return (
        <div className="space-frame__label" style={far ? { fontSize: 'calc(13px * var(--inv-z))' } : undefined}>
          {editing ? <EditableText value={card.text ?? ''} onChange={(text) => onChange(card.id, { text })} onDone={() => onEdit(null)} single /> : card.text || 'Frame'}
        </div>
      );
    case 'image':
      return <img className="space-card__img" src={card.src} alt="" draggable={false} />;
    case 'sketch':
      return (
        <>
          <div className="space-card__bar">
            <PenLine width={12} height={12} /> Sketch
          </div>
          <div className="space-card__sketch" data-interactive>
            <InkSurface strokes={card.strokes ?? []} commit={(next, before) => onSketchCommit(card.id, next, before)} width={card.w} height={card.h - 28} />
          </div>
        </>
      );
    case 'page':
      return <PagePreview pageId={card.pageId!} far={far} />;
  }
}

/** A textarea that grows with its content and commits on blur / Escape. */
function EditableText({ value, onChange, onDone, className = '', single }: { value: string; onChange: (v: string) => void; onDone: () => void; className?: string; single?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className={`space-card__editor ${className}`}
      value={value}
      data-interactive
      rows={single ? 1 : undefined}
      onChange={(e) => onChange(single ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (single && e.key === 'Enter')) onDone();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}

/**
 * A live window onto another page. It subscribes to that page in the store,
 * so typing in the document updates the card on the canvas immediately.
 */
function PagePreview({ pageId, far }: { pageId: string; far: boolean }) {
  const page = useWorkspace((s) => s.pages[pageId]);
  const snippet = useMemo(() => (page?.kind === 'doc' ? docToText(page.doc, 600) : ''), [page?.kind, page?.doc]);
  if (!page || page.trashed) return <div className="page-card page-card--missing">Page was deleted</div>;

  const firstSheet = page.notebook?.sheets[0]?.strokes;
  return (
    <div className="page-card">
      {page.cover && <div className="page-card__cover" style={{ background: COVERS[page.cover] }} />}
      <div className="page-card__body">
        <div className="page-card__head">
          <PageIcon page={page} size={16} />
          <span>{KIND_LABEL[page.kind]}</span>
          <ArrowUpRight width={13} height={13} className="page-card__open" />
        </div>
        <div className="page-card__title" style={far ? { fontSize: 'calc(18px * min(var(--inv-z), 3))' } : undefined}>
          {displayTitle(page)}
        </div>
        {!far && snippet && <p className="page-card__snippet">{snippet}</p>}
        {!far && firstSheet && firstSheet.length > 0 && (
          <svg className="page-card__ink" viewBox="0 0 794 600" preserveAspectRatio="xMidYMin slice">
            <InkLayer strokes={firstSheet} filterId="none" />
          </svg>
        )}
      </div>
    </div>
  );
}
