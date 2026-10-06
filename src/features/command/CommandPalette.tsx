import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, FileText, Home, Moon, NotebookPen, Orbit, PanelLeft, Search, Shapes, Sun } from 'lucide-react';
import { displayTitle, useWorkspace } from '@/store/workspace';
import type { Page } from '@/store/types';
import { PageIcon, KIND_LABEL } from '@/components/ui/PageIcon';
import { docToText, fuzzyScore } from '@/lib/text';
import { spring } from '@/lib/motion';
import './CommandPalette.css';

interface Result {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  section: 'Pages' | 'Actions';
  run: () => void;
  score: number;
}

/**
 * The ⌘K command palette: one input that searches page titles, page *text*
 * and app actions. It's the keyboard-first heart of the app — anything you
 * can click, you can also reach from here.
 */
export function CommandPalette() {
  const open = useWorkspace((s) => s.paletteOpen);
  const setOpen = useWorkspace((s) => s.setPaletteOpen);
  return (
    <AnimatePresence>
      {open && <PaletteBody key="palette" onClose={() => setOpen(false)} />}
    </AnimatePresence>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const pages = useWorkspace((s) => s.pages);
  const s = useWorkspace.getState();

  // Build a search index once per open: title + body text for each page.
  const index_ = useMemo(
    () =>
      Object.values(pages)
        .filter((p) => !p.trashed)
        .map((p) => ({ page: p, title: displayTitle(p), text: p.kind === 'doc' ? docToText(p.doc) : '' })),
    [pages],
  );

  const results = useMemo<Result[]>(() => {
    const go = (p: Page) => () => s.setActive(p.id);
    const pageResults: Result[] = index_
      .map(({ page, title, text }) => {
        const titleScore = fuzzyScore(title, query);
        const textScore = query.length > 1 && text.toLowerCase().includes(query.toLowerCase()) ? 20 : -1;
        const score = Math.max(titleScore * 2, textScore);
        let subtitle = KIND_LABEL[page.kind];
        if (textScore > 0 && titleScore < 0) {
          const at = text.toLowerCase().indexOf(query.toLowerCase());
          subtitle = '…' + text.slice(Math.max(0, at - 24), at + query.length + 40) + '…';
        }
        return { id: page.id, title, subtitle, icon: <PageIcon page={page} size={16} />, section: 'Pages' as const, run: go(page), score: query ? score : page.updatedAt / 1e13 };
      })
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, query ? 8 : 5);

    const create = (kind: Page['kind']) => () => s.setActive(s.createPage(kind, null, query && !query.startsWith('>') ? { title: query } : {}));
    const dark = document.documentElement.dataset.theme === 'dark';
    const actions: Omit<Result, 'score' | 'section'>[] = [
      { id: 'new-doc', title: query ? `New document “${query}”` : 'New document', icon: <FileText width={16} height={16} />, run: create('doc') },
      { id: 'new-space', title: 'New spatial space', icon: <Orbit width={16} height={16} />, run: create('space') },
      { id: 'new-board', title: 'New whiteboard', icon: <Shapes width={16} height={16} />, run: create('board') },
      { id: 'new-notebook', title: 'New notebook', icon: <NotebookPen width={16} height={16} />, run: create('notebook') },
      { id: 'home', title: 'Go home', icon: <Home width={16} height={16} />, run: () => s.setActive(null) },
      { id: 'sidebar', title: 'Toggle sidebar', subtitle: '⌘\\', icon: <PanelLeft width={16} height={16} />, run: () => s.setSidebarOpen(!s.sidebarOpen) },
      { id: 'theme', title: dark ? 'Switch to light appearance' : 'Switch to dark appearance', icon: dark ? <Sun width={16} height={16} /> : <Moon width={16} height={16} />, run: () => s.setTheme(dark ? 'light' : 'dark') },
    ];
    const actionResults = actions
      .map((a) => ({ ...a, section: 'Actions' as const, score: a.id === 'new-doc' && query ? 0 : fuzzyScore(a.title, query) }))
      .filter((a) => a.score >= 0)
      .sort((a, b) => b.score - a.score);

    return [...pageResults, ...actionResults];
  }, [index_, query, s]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const runAt = (i: number) => {
    const r = results[i];
    if (!r) return;
    onClose();
    r.run();
  };

  let lastSection = '';

  return (
    <motion.div className="palette-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} onPointerDown={onClose}>
      <motion.div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        initial={{ opacity: 0, scale: 0.96, y: -12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.12 } }}
        transition={spring.snappy}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="palette__input">
          <Search width={18} height={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages or type a command…"
            aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                runAt(index);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>
        <div className="palette__list" ref={listRef} role="listbox">
          {results.length === 0 && <div className="palette__empty">Nothing found</div>}
          {results.map((r, i) => {
            const header = r.section !== lastSection ? r.section : null;
            lastSection = r.section;
            return (
              <div key={r.id}>
                {header && <div className="palette__section">{query ? header : header === 'Pages' ? 'Recent' : header}</div>}
                <button type="button" role="option" aria-selected={i === index} className="palette__item" onPointerMove={() => i !== index && setIndex(i)} onClick={() => runAt(i)}>
                  {i === index && <motion.span layoutId="palette-hl" className="palette__hl" transition={spring.snappy} />}
                  <span className="palette__icon">{r.icon}</span>
                  <span className="palette__text">
                    <span className="palette__title">{r.title}</span>
                    {r.subtitle && <span className="palette__sub">{r.subtitle}</span>}
                  </span>
                  {i === index && <CornerDownLeft className="palette__enter" width={14} height={14} />}
                </button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
