import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, FileType, X } from 'lucide-react';
import { displayTitle, useWorkspace } from '@/store/workspace';
import type { ID, PdfHighlight } from '@/store/types';
import { PdfPageView } from './PdfPageView';
import { pdfHighlightActions } from './pdfActions';
import './pdf.css';

interface Props {
  pageId: ID;
  /** card width in world units */
  w: number;
  reading: boolean;
  /** zoomed far out on the canvas: show only a big title */
  far: boolean;
  /** extra rendering resolution while the canvas is zoomed in */
  detail: number;
  onPin: (pageId: ID, h: PdfHighlight) => void;
  onOpen: (pageId: ID) => void;
  onToggleReading: (reading: boolean) => void;
}

/**
 * A PDF on the spatial canvas. Collapsed it is a cover with progress;
 * double-click and it grows into a reader in place — turn pages, select
 * text, highlight it, and pin the quote to the canvas as a sticky note.
 */
export function PdfCard({ pageId, w, reading, far, detail, onPin, onOpen, onToggleReading }: Props) {
  const page = useWorkspace((s) => s.pages[pageId]);
  const actions = useMemo(() => pdfHighlightActions(pageId), [pageId]);
  const pdf = page?.pdf;
  const current = pdf?.lastPage ?? 1;
  const here = useMemo(() => (pdf?.highlights ?? []).filter((h) => h.page === current), [pdf?.highlights, current]);

  if (!page || page.trashed || !pdf) return <div className="page-card page-card--missing">PDF was deleted</div>;

  const title = displayTitle(page);
  const count = pdf.highlights.length;

  if (!reading) {
    return (
      <div className="pdf-card">
        {!far && (
          <div className="pdf-card__cover">
            <PdfPageView blobId={pdf.blobId} pageNumber={1} width={Math.max(60, w - 40)} interactive={false} detail={detail} priority={1} />
          </div>
        )}
        <div className="pdf-card__foot">
          <div className="pdf-card__kind">
            <FileType width={14} height={14} />
            PDF · {pdf.pages} {pdf.pages === 1 ? 'page' : 'pages'}
          </div>
          <div className="pdf-card__title" style={far ? { fontSize: 'calc(18px * min(var(--inv-z), 3))' } : undefined}>
            {title}
          </div>
          {!far && (
            <div className="pdf-card__sub">
              {count} {count === 1 ? 'highlight' : 'highlights'}
              {current > 1 && ` · page ${current}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  const go = (n: number) => actions.setLastPage(Math.min(pdf.pages, Math.max(1, n)));

  return (
    <div className="pdf-card">
      <div className="pdf-card__bar">
        <FileType width={14} height={14} color="var(--c-danger)" />
        <span className="pdf-card__bar-title">{title}</span>
        <button type="button" className="pdf-card__btn" data-interactive aria-label="Previous page" disabled={current <= 1} onClick={() => go(current - 1)}>
          <ChevronLeft width={14} height={14} />
        </button>
        <span className="pdf-card__pager" data-interactive>
          {current} / {pdf.pages}
        </span>
        <button type="button" className="pdf-card__btn" data-interactive aria-label="Next page" disabled={current >= pdf.pages} onClick={() => go(current + 1)}>
          <ChevronRight width={14} height={14} />
        </button>
        <button type="button" className="pdf-card__btn" data-interactive aria-label="Open full reader" title="Open full reader" onClick={() => onOpen(pageId)}>
          <ExternalLink width={14} height={14} />
        </button>
        <button type="button" className="pdf-card__btn" data-interactive aria-label="Close reader" title="Close reader" onClick={() => onToggleReading(false)}>
          <X width={14} height={14} />
        </button>
      </div>
      <div className="pdf-card__scroll" data-interactive data-wheel-scroll>
        <PdfPageView
          blobId={pdf.blobId}
          pageNumber={current}
          width={Math.max(120, w - 40)}
          detail={detail}
          highlights={here}
          onAdd={actions.add}
          onRemove={actions.remove}
          onPatch={actions.patch}
          onPin={(h) => onPin(pageId, h)}
        />
      </div>
      <div className="pdf-card__progress" aria-hidden="true">
        <span style={{ width: `${(current / pdf.pages) * 100}%` }} />
      </div>
    </div>
  );
}
