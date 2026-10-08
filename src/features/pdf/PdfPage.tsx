import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Highlighter, Minus, PanelLeft, PanelRight, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import { isTyping } from '@/lib/keys';
import { isMod } from '@/components/ui/Kbd';
import type { ID, PdfHighlight } from '@/store/types';
import { IconButton } from '@/components/ui/IconButton';
import { loadPdf } from '@/lib/pdf';
import { PdfPageView } from './PdfPageView';
import { pdfHighlightActions } from './pdfActions';
import './pdf.css';

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];

/**
 * The full reader: page thumbnails, one continuous scroll of pages, and a
 * panel listing every highlight. The same highlights show on the spatial
 * canvas, where a PDF card can pin them as sticky notes.
 */
export function PdfPage({ pageId }: { pageId: ID }) {
  const pdf = useWorkspace((s) => s.pages[pageId]?.pdf);
  const actions = useMemo(() => pdfHighlightActions(pageId), [pageId]);

  const scroller = useRef<HTMLDivElement>(null);
  const [colW, setColW] = useState(720);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(pdf?.lastPage ?? 1);
  const [aspect, setAspect] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // side panels start open only when there's room for them next to the app sidebar
  const [panel, setPanel] = useState(() => window.innerWidth >= 1100);
  const [thumbsOpen, setThumbsOpen] = useState(() => window.innerWidth >= 1600);
  const thumbs = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  /** where we are inside the current page, kept so zooming doesn't lose the place */
  const anchor = useRef({ page: pdf?.lastPage ?? 1, frac: 0 });
  const scrollFrame = useRef(0);

  // size the page to the column; measure page 1 so placeholders have the right height
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setColW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let live = true;
    loadPdf(pdf.blobId)
      .then((doc) => doc.getPage(1))
      .then((p) => {
        const v = p.getViewport({ scale: 1 });
        if (live) setAspect(v.height / v.width);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [pdf?.blobId]);

  const width = Math.round(Math.min(colW, 900) * zoom);
  const pages = pdf?.pages ?? 0;

  // slots are the scroller's children, in page order: slot(n) is page n
  const slot = (n: number) => scroller.current?.children[n - 1] as HTMLElement | undefined;
  const goTo = useCallback((n: number, smooth = true) => {
    const el = scroller.current;
    const target = el?.children[n - 1] as HTMLElement | undefined;
    if (!el || !target) return;
    el.scrollTo({ top: Math.max(0, target.offsetTop - 18), behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // come back to where you stopped, once the page height is known
  useLayoutEffect(() => {
    if (aspect && !restored.current && pdf) {
      restored.current = true;
      goTo(pdf.lastPage, false);
    }
  }, [aspect, pdf, goTo]);

  // which page is in view? Binary search over the slots, once per frame.
  const onScroll = () => {
    if (scrollFrame.current) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const el = scroller.current;
      if (!el || !pages) return;
      const probe = el.scrollTop + el.clientHeight * 0.3;
      let lo = 1;
      let hi = pages;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((slot(mid)?.offsetTop ?? 0) - 18 <= probe) lo = mid;
        else hi = mid - 1;
      }
      setCurrent(lo);
      const s = slot(lo);
      if (s) anchor.current = { page: lo, frac: (el.scrollTop - s.offsetTop) / s.offsetHeight };
    });
  };

  // zooming keeps the same spot of the same page under the top of the view
  useLayoutEffect(() => {
    const el = scroller.current;
    const s = slot(anchor.current.page);
    if (!el || !s || !restored.current) return;
    el.scrollTop = s.offsetTop + anchor.current.frac * s.offsetHeight;
  }, [width]);

  // keep the current page's thumbnail in view
  useEffect(() => {
    const t = thumbs.current?.children[current - 1] as HTMLElement | undefined;
    t?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);

  // Ctrl + wheel / pinch zooms the pages, not the browser
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((z) => Math.min(3, Math.max(0.4, z * Math.exp(-e.deltaY * 0.0025))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => actions.setLastPage(current), 500);
    return () => clearTimeout(t);
  }, [current, actions]);

  const byPage = useMemo(() => {
    const m = new Map<number, PdfHighlight[]>();
    for (const h of pdf?.highlights ?? []) m.set(h.page, [...(m.get(h.page) ?? []), h]);
    return m;
  }, [pdf?.highlights]);

  const sorted = useMemo(() => [...(pdf?.highlights ?? [])].sort((a, b) => a.page - b.page || a.rects[0][1] - b.rects[0][1]), [pdf?.highlights]);

  const step = useCallback((dir: 1 | -1) => {
    setZoom((zoom) => {
      // the next preset strictly above / below the current zoom
      const next = dir > 0 ? ZOOMS.find((z) => z > zoom + 0.001) : [...ZOOMS].reverse().find((z) => z < zoom - 0.001);
      return next ?? zoom;
    });
  }, []);

  // keyboard: arrows turn pages, Ctrl +/−/0 zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || useWorkspace.getState().paletteOpen) return;
      if (isMod(e)) {
        if (e.key === '=' || e.key === '+') step(1);
        else if (e.key === '-') step(-1);
        else if (e.key === '0') setZoom(1);
        else return;
        e.preventDefault();
        return;
      }
      if (e.key === 'ArrowLeft') goTo(current - 1);
      else if (e.key === 'ArrowRight') goTo(current + 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, goTo, step]);

  if (!pdf) return null;

  return (
    <div className="pdf-reader">
      {/* one toolbar across the whole reader, so it reads as one window, not extra sidebars */}
      <div className="pdf-reader__bar">
        <IconButton label={thumbsOpen ? 'Hide page thumbnails' : 'Show page thumbnails'} size="sm" active={thumbsOpen} onClick={() => setThumbsOpen(!thumbsOpen)}>
          <PanelLeft />
        </IconButton>
        <span className="pdf-reader__sep" />
        <IconButton label="Previous page" size="sm" disabled={current <= 1} onClick={() => goTo(current - 1)}>
          <ChevronLeft />
        </IconButton>
        <input
          className="pdf-reader__pageinput"
          aria-label="Page number"
          key={current}
          defaultValue={current}
          inputMode="numeric"
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const n = Math.min(pages, Math.max(1, parseInt(e.currentTarget.value, 10) || current));
            goTo(n);
            e.currentTarget.blur();
          }}
        />
        <span className="pdf-reader__total">/ {pages}</span>
        <IconButton label="Next page" size="sm" disabled={current >= pages} onClick={() => goTo(current + 1)}>
          <ChevronRight />
        </IconButton>
        <span className="pdf-reader__bar-spacer" />
        <IconButton label="Zoom out" size="sm" onClick={() => step(-1)}>
          <Minus />
        </IconButton>
        <button type="button" className="pdf-reader__zoom" title="Fit to width" onClick={() => setZoom(1)}>
          {Math.round(zoom * 100)}%
        </button>
        <IconButton label="Zoom in" size="sm" onClick={() => step(1)}>
          <Plus />
        </IconButton>
        <span className="pdf-reader__sep" />
        <IconButton label={panel ? 'Hide highlights' : 'Show highlights'} size="sm" active={panel} onClick={() => setPanel(!panel)}>
          <PanelRight />
        </IconButton>
      </div>

      <div className="pdf-reader__body">
        {thumbsOpen && (
          <div ref={thumbs} className="pdf-reader__thumbs" aria-label="Pages">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={`pdf-thumb ${n === current ? 'is-current' : ''}`} onClick={() => goTo(n)} aria-label={`Page ${n}`} aria-current={n === current}>
                <PdfPageView blobId={pdf.blobId} pageNumber={n} width={72} interactive={false} lazy priority={1} highlights={byPage.get(n)} defaultAspect={aspect ?? undefined} />
                <span>{n}</span>
              </button>
            ))}
          </div>
        )}

        <div ref={scroller} className="pdf-reader__scroll" onScroll={onScroll} tabIndex={-1}>
          {error ? (
            <p className="pdf-reader__state">{error}</p>
          ) : (
            Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <div key={n} className="pdf-slot">
                <PdfPageView
                  blobId={pdf.blobId}
                  pageNumber={n}
                  width={width}
                  lazy
                  highlights={byPage.get(n)}
                  defaultAspect={aspect ?? undefined}
                  onAdd={actions.add}
                  onRemove={actions.remove}
                  onPatch={actions.patch}
                />
              </div>
            ))
          )}
        </div>

      {panel && (
        <aside className="pdf-panel" aria-label="Highlights">
          <div className="pdf-panel__head">Highlights · {sorted.length}</div>
          <div className="pdf-panel__list">
            {sorted.length === 0 && (
              <p className="pdf-panel__empty">
                <Highlighter width={20} height={20} style={{ marginBottom: 8 }} />
                <br />
                Select text on a page to highlight it. Quotes collect here, and can be pinned onto a spatial canvas.
              </p>
            )}
            {sorted.map((h) => (
              <div key={h.id} className={`pdf-quote pdf-quote--${h.color}`}>
                <button type="button" className="pdf-quote__text" onClick={() => goTo(h.page)}>
                  {h.text}
                </button>
                <div className="pdf-quote__meta">
                  <span className="pdf-quote__page">p. {h.page}</span>
                  {h.pinned && <span>On canvas</span>}
                  <span className="pdf-quote__spacer" />
                  <button type="button" className="pdf-quote__del" aria-label="Remove highlight" onClick={() => actions.remove(h.id)}>
                    <Trash2 width={13} height={13} />
                  </button>
                </div>
                <textarea
                  className="pdf-quote__note"
                  rows={h.note ? Math.min(5, h.note.split('\n').length + 1) : 1}
                  placeholder="Add a note…"
                  value={h.note ?? ''}
                  onChange={(e) => actions.patch(h.id, { note: e.target.value })}
                />
              </div>
            ))}
          </div>
        </aside>
      )}
      </div>
    </div>
  );
}
