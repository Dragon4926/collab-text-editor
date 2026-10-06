import { isRedo, isTyping, isUndo } from '@/lib/keys';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { FilePlus2, Layers, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import type { ID, NotebookData, NotebookSheet, Stroke } from '@/store/types';
import { useHistory } from '@/hooks/useHistory';
import { Popover } from '@/components/ui/Popover';
import { InkSurface } from '@/features/ink/InkSurface';
import { InkToolbar } from '@/features/ink/InkToolbar';
import { useInkTool } from '@/features/ink/toolStore';
import { riseIn, spring, stagger } from '@/lib/motion';
import { PageHeader } from '@/features/page/PageHeader';
import { PAPERS, PAPER_TINTS, PaperPattern, SHEET_H, SHEET_W, paperInkVars } from './paper';
import './Notebook.css';

/**
 * A Samsung Notes-style notebook: a vertical stack of paper sheets you
 * handwrite on.
 *
 * Undo history covers the whole notebook (all sheets), so Ctrl+Z works no
 * matter which sheet you last wrote on.
 */
export function NotebookPage({ pageId }: { pageId: ID }) {
  const notebook = useWorkspace((s) => s.pages[pageId]?.notebook);
  const mutatePage = useWorkspace((s) => s.mutatePage);
  const penOnly = useInkTool((s) => s.penOnly);
  const history = useHistory<NotebookSheet[]>();
  const lastBefore = useRef<Stroke[] | null>(null);
  const [paperAnchor, setPaperAnchor] = useState<HTMLElement | null>(null);

  const setSheets = useCallback(
    (sheets: NotebookSheet[]) =>
      mutatePage(pageId, (p) => {
        p.notebook!.sheets = sheets;
      }),
    [mutatePage, pageId],
  );

  const commitSheet = useCallback(
    (index: number) => (next: Stroke[], before: Stroke[]) => {
      const sheets = useWorkspace.getState().pages[pageId].notebook!.sheets;
      if (lastBefore.current !== before) {
        history.record(sheets);
        lastBefore.current = before;
      }
      setSheets(sheets.map((s, i) => (i === index ? { ...s, strokes: next } : s)));
    },
    [history, pageId, setSheets],
  );

  const undo = useCallback(() => {
    const prev = history.undo(useWorkspace.getState().pages[pageId].notebook!.sheets);
    if (prev) {
      lastBefore.current = null;
      setSheets(prev);
    }
  }, [history, pageId, setSheets]);

  const redo = useCallback(() => {
    const next = history.redo(useWorkspace.getState().pages[pageId].notebook!.sheets);
    if (next) {
      lastBefore.current = null;
      setSheets(next);
    }
  }, [history, pageId, setSheets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(isUndo(e) || isRedo(e)) || isTyping(e.target)) return;
      e.preventDefault();
      if (isRedo(e)) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  if (!notebook) return null;

  const setPaper = (patch: Partial<NotebookData>) =>
    mutatePage(pageId, (p) => {
      Object.assign(p.notebook!, patch);
    });

  const addSheet = () => {
    history.record(notebook.sheets);
    setSheets([...notebook.sheets, { id: nanoid(8), strokes: [] }]);
    requestAnimationFrame(() => document.querySelector('.notebook__sheet:last-of-type')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const removeSheet = (id: string) => {
    if (notebook.sheets.length === 1) return;
    history.record(notebook.sheets);
    setSheets(notebook.sheets.filter((s) => s.id !== id));
  };


  return (
    <div className="notebook">
      <div className="notebook__toolbar">
        <InkToolbar onUndo={undo} onRedo={redo} canUndo={history.canUndo} canRedo={history.canRedo}>
          <span className="ink-toolbar__sep" />
          <button type="button" className="ink-toolbar__tool" aria-label="Paper" title="Paper template" onClick={(e) => setPaperAnchor(e.currentTarget)}>
            <Layers width={18} height={18} />
          </button>
        </InkToolbar>
      </div>

      <div className={`notebook__scroll ${penOnly ? 'is-pen-only' : ''}`}>
        <PageHeader pageId={pageId} compact />
        <motion.div className="notebook__sheets" variants={stagger(0.06)} initial="initial" animate="animate">
          <AnimatePresence initial={false}>
            {notebook.sheets.map((sheet, i) => (
              <motion.section
                key={sheet.id}
                className="notebook__sheet"
                variants={riseIn}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                layout
                transition={spring.smooth}
              >
                <InkSurface
                  strokes={sheet.strokes}
                  commit={commitSheet(i)}
                  width={SHEET_W}
                  height={SHEET_H}
                  className="notebook__ink"
                  style={paperInkVars(notebook.tint)}
                  underlay={<PaperPattern style={notebook.paper} tint={notebook.tint} id={`paper-${sheet.id}`} />}
                />
                <footer className="notebook__sheet-foot">
                  <span>
                    {i + 1} / {notebook.sheets.length}
                  </span>
                  {notebook.sheets.length > 1 && (
                    <button type="button" aria-label={`Delete page ${i + 1}`} onClick={() => removeSheet(sheet.id)}>
                      <Trash2 width={13} height={13} />
                    </button>
                  )}
                </footer>
              </motion.section>
            ))}
          </AnimatePresence>
          <motion.button type="button" className="notebook__add" onClick={addSheet} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} transition={spring.snappy}>
            <FilePlus2 width={18} height={18} />
            Add page
          </motion.button>
        </motion.div>
      </div>

      <Popover anchor={paperAnchor} onClose={() => setPaperAnchor(null)} className="paper-picker" align="center">
        <div className="popover__label">Template</div>
        <div className="paper-picker__grid">
          {PAPERS.map((p) => (
            <button key={p.id} type="button" className={notebook.paper === p.id ? 'is-active' : ''} onClick={() => setPaper({ paper: p.id })}>
              <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} aria-hidden="true">
                <PaperPattern style={p.id} tint={notebook.tint} id={`thumb-${p.id}`} />
              </svg>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
        <div className="popover__label">Paper colour</div>
        <div className="paper-picker__tints">
          {(Object.keys(PAPER_TINTS) as NotebookData['tint'][]).map((t) => (
            <button key={t} type="button" className={notebook.tint === t ? 'is-active' : ''} style={{ background: PAPER_TINTS[t].bg }} aria-label={PAPER_TINTS[t].label} title={PAPER_TINTS[t].label} onClick={() => setPaper({ tint: t })} />
          ))}
        </div>
      </Popover>
    </div>
  );
}
