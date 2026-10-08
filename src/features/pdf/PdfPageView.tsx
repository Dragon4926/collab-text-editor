import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import type { RenderTask } from 'pdfjs-dist';
import type { HighlightColor, PdfHighlight } from '@/store/types';
import { loadPdf, pdfjs, scheduleRender } from '@/lib/pdf';
import { HIGHLIGHT_COLORS, makeHighlight } from './pdfActions';
import 'pdfjs-dist/web/pdf_viewer.css';
import './pdf.css';

type Rect = [number, number, number, number];

interface Popover {
  /** set when an existing highlight was clicked */
  existing?: string;
  /** set for a fresh selection */
  draft?: Omit<PdfHighlight, 'id'>;
  /** anchor as fractions of the page */
  x: number;
  y: number;
  /** open upwards (the selection is near the bottom of the page) */
  above?: boolean;
}

interface Props {
  blobId: string;
  /** 1-based */
  pageNumber: number;
  /** CSS width of the rendered page */
  width: number;
  highlights?: PdfHighlight[];
  /** render the selectable text layer and highlighting (off for thumbnails) */
  interactive?: boolean;
  /** only draw while the page is near the viewport, and free it after */
  lazy?: boolean;
  /** extra resolution on top of the screen's pixel ratio (a zoomed-in canvas) */
  detail?: number;
  /** 0 draws before 1 (reading pages before thumbnails) */
  priority?: number;
  onAdd?: (h: PdfHighlight) => void;
  onRemove?: (id: string) => void;
  onPatch?: (id: string, patch: Partial<PdfHighlight>) => void;
  /** show "Pin to canvas" in the popover */
  onPin?: (h: PdfHighlight) => void;
  /** height / width used until this page is measured, so lists don't jump */
  defaultAspect?: number;
}

/** Placeholder ratio until the page has been measured (A4). */
const DEFAULT_ASPECT = 1.414;
/**
 * Never allocate a canvas bigger than this many pixels (~32 MB of RGBA).
 * Page canvases live on the GPU; a few huge ones can exhaust its memory, and
 * then Chromium starts dropping other layers (the sidebar, the toolbar).
 */
const MAX_PIXELS = 8_000_000;

/**
 * One PDF page: a canvas for the pixels, a transparent text layer on top so
 * the text can be selected, and the page's highlights in between.
 * Highlights are stored as fractions of the page, so they stay put at any
 * zoom — and on the spatial canvas, at any camera scale.
 *
 * Each render draws into a fresh off-screen canvas and swaps it in when it's
 * done, so turning a page or zooming never flashes white: the old pixels
 * stay up until the new ones are ready.
 */
export const PdfPageView = memo(function PdfPageView({
  blobId,
  pageNumber,
  width,
  highlights = [],
  interactive = true,
  lazy,
  detail = 1,
  priority = 0,
  onAdd,
  onRemove,
  onPatch,
  onPin,
  defaultAspect = DEFAULT_ASPECT,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const pixels = useRef<HTMLDivElement>(null);
  const textHost = useRef<HTMLDivElement>(null);
  const [aspect, setAspect] = useState(defaultAspect);
  const [near, setNear] = useState(!lazy);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pop, setPop] = useState<Popover | null>(null);

  /* ---- lazy: only keep pages close to the viewport ---- */
  useEffect(() => {
    if (!lazy || !root.current) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '1200px 0px' });
    io.observe(root.current);
    return () => io.disconnect();
  }, [lazy]);

  /* ---- draw ---- */
  useEffect(() => {
    if (!near) {
      // far away: give the memory back (a page canvas can be tens of MB)
      pixels.current?.replaceChildren();
      textHost.current?.replaceChildren();
      setDrawn(false);
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    let job: { cancel: () => void } | null = null;
    // debounced, so resizing a card or zooming doesn't redraw every frame
    const timer = setTimeout(() => {
      job = scheduleRender(priority, async () => {
        if (cancelled) return;
        try {
          const [m, doc] = await Promise.all([pdfjs(), loadPdf(blobId)]);
          const page = await doc.getPage(pageNumber);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          setAspect(base.height / base.width);

          const scale = width / base.width;
          const viewport = page.getViewport({ scale });
          let ratio = Math.min(window.devicePixelRatio || 1, 2) * detail;
          ratio = Math.min(ratio, Math.sqrt(MAX_PIXELS / (viewport.width * viewport.height)));

          const off = document.createElement('canvas');
          off.className = 'pdf-page__canvas';
          off.width = Math.floor(viewport.width * ratio);
          off.height = Math.floor(viewport.height * ratio);
          task = page.render({ canvas: off, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
          await task.promise;
          if (cancelled || !pixels.current) return;
          pixels.current.replaceChildren(off);
          setDrawn(true);
          setFailed(false);

          if (!interactive || !textHost.current) return;
          const layer = document.createElement('div');
          layer.className = 'textLayer pdf-page__text';
          layer.style.setProperty('--scale-factor', String(scale));
          layer.style.setProperty('--total-scale-factor', String(scale));
          await new m.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport }).render();
          if (!cancelled) textHost.current?.replaceChildren(layer);
        } catch (e) {
          if ((e as { name?: string })?.name !== 'RenderingCancelledException' && !cancelled) setFailed(true);
        }
      });
    }, 60);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      job?.cancel();
      task?.cancel();
    };
  }, [blobId, pageNumber, width, near, interactive, detail, priority]);

  // dismiss the popover when the page changes underneath it
  useLayoutEffect(() => setPop(null), [pageNumber, blobId]);

  // ...and on a click elsewhere or Escape
  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('.pdf-pop')) setPop(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPop(null);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [pop]);

  /* ---- selection → highlight ---- */
  const onPointerUp = (e: React.PointerEvent) => {
    if (!interactive || (e.target as HTMLElement).closest('.pdf-pop')) return;
    const { clientX, clientY } = e;
    // let the browser finish updating the selection first
    requestAnimationFrame(() => {
      const el = root.current;
      const sel = window.getSelection();
      if (!el) return;
      const bounds = el.getBoundingClientRect();

      if (sel && !sel.isCollapsed && sel.rangeCount && textHost.current?.contains(sel.anchorNode)) {
        const text = sel.toString().replace(/\s+/g, ' ').trim();
        const rects = mergeLines([...sel.getRangeAt(0).getClientRects()], bounds);
        if (text && rects.length) {
          const first = rects[0];
          const last = rects[rects.length - 1];
          const above = last[1] + last[3] > 0.82;
          setPop({
            x: above ? first[0] + first[2] / 2 : last[0] + last[2] / 2,
            y: above ? first[1] : last[1] + last[3],
            above,
            draft: { page: pageNumber, color: 'yellow', text, rects },
          });
          return;
        }
      }
      // a plain click on an existing highlight opens its menu
      const fx = (clientX - bounds.left) / bounds.width;
      const fy = (clientY - bounds.top) / bounds.height;
      const hit = highlights.find((h) => h.rects.some(([x, y, w, hh]) => fx >= x && fx <= x + w && fy >= y && fy <= y + hh));
      setPop(hit ? { existing: hit.id, x: fx, y: fy, above: fy > 0.82 } : null);
    });
  };

  const commit = (color: HighlightColor, pin: boolean) => {
    if (!pop?.draft) return;
    const h = makeHighlight({ ...pop.draft, color });
    onAdd?.(h);
    if (pin) onPin?.(h);
    window.getSelection()?.removeAllRanges();
    setPop(null);
  };

  const existing = pop?.existing ? highlights.find((h) => h.id === pop.existing) : undefined;

  return (
    <div ref={root} className={`pdf-page ${drawn ? 'is-drawn' : ''}`} style={{ width, height: width * aspect }} onPointerUp={onPointerUp} data-page={pageNumber}>
      <div ref={pixels} className="pdf-page__pixels" />
      {failed && <div className="pdf-page__error">Couldn’t draw this page</div>}
      {highlights.map((h) => (
        <div key={h.id} className={`pdf-hl pdf-hl--${h.color}`}>
          {h.rects.map((r, i) => (
            <span key={i} style={{ left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%` }} />
          ))}
        </div>
      ))}
      {interactive && <div ref={textHost} className="pdf-page__texthost" />}

      {pop && (
        <div
          className={`pdf-pop ${pop.above ? 'is-above' : ''}`}
          style={{ left: `${pop.x * 100}%`, top: `${pop.y * 100}%` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          data-interactive
        >
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`pdf-pop__dot pdf-pop__dot--${c} ${existing?.color === c ? 'is-active' : ''}`}
              aria-label={`Highlight ${c}`}
              title={`Highlight ${c}`}
              onClick={() => {
                if (existing) {
                  onPatch?.(existing.id, { color: c });
                  setPop(null);
                } else commit(c, false);
              }}
            />
          ))}
          <span className="pdf-pop__sep" />
          {existing ? (
            <>
              <button
                type="button"
                className="pdf-pop__btn"
                onClick={() => {
                  onRemove?.(existing.id);
                  setPop(null);
                }}
              >
                <Trash2 width={13} height={13} /> Remove
              </button>
              {onPin && (
                <button
                  type="button"
                  className="pdf-pop__btn is-primary"
                  onClick={() => {
                    onPin(existing);
                    setPop(null);
                  }}
                >
                  <ArrowRight width={13} height={13} /> Pin
                </button>
              )}
            </>
          ) : (
            onPin && (
              <button type="button" className="pdf-pop__btn is-primary" onClick={() => commit('yellow', true)}>
                <ArrowRight width={13} height={13} /> Pin to canvas
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
});

/**
 * pdf.js splits a line into many small spans, so a selection yields dozens
 * of client rects. Merge the ones on the same line into one rectangle, and
 * express them as fractions of the page.
 */
function mergeLines(rects: DOMRect[], page: DOMRect): Rect[] {
  const items = rects.filter((r) => r.width > 1 && r.height > 1).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: { l: number; t: number; r: number; b: number }[] = [];
  for (const r of items) {
    const line = lines.find((x) => Math.min(x.b, r.bottom) - Math.max(x.t, r.top) > Math.min(x.b - x.t, r.height) * 0.6);
    if (line) {
      line.l = Math.min(line.l, r.left);
      line.r = Math.max(line.r, r.right);
      line.t = Math.min(line.t, r.top);
      line.b = Math.max(line.b, r.bottom);
    } else lines.push({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return lines.map((x): Rect => {
    const l = clamp((x.l - page.left) / page.width);
    const t = clamp((x.t - page.top) / page.height);
    return [l, t, clamp((x.r - page.left) / page.width) - l, clamp((x.b - page.top) / page.height) - t];
  });
}
