import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import {
  ChevronRight,
  FileText,
  Monitor,
  Moon,
  NotebookPen,
  Orbit,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { displayTitle, usePageLabel, useWorkspace } from '@/store/workspace';
import type { PageKind, ThemePref } from '@/store/types';
import { TrafficLights } from '@/components/shell/TrafficLights';
import { IconButton } from '@/components/ui/IconButton';
import { Kbd } from '@/components/ui/Kbd';
import { Menu, useMenu, type MenuItem } from '@/components/ui/Menu';
import { PageIcon } from '@/components/ui/PageIcon';
import { spring } from '@/lib/motion';
import { changeTheme } from '@/lib/theme';
import { PageTree } from './PageTree';
import './Sidebar.css';

export function Sidebar() {
  const createPage = useWorkspace((s) => s.createPage);
  const setActive = useWorkspace((s) => s.setActive);
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen);
  const setPaletteOpen = useWorkspace((s) => s.setPaletteOpen);
  const newMenu = useMenu();

  const create = (kind: PageKind) => setActive(createPage(kind));

  const newItems: MenuItem[] = [
    { label: 'Document', icon: <FileText />, shortcut: 'Alt+N', onSelect: () => create('doc') },
    { label: 'Spatial space', icon: <Orbit />, onSelect: () => create('space') },
    { label: 'Whiteboard', icon: <Shapes />, onSelect: () => create('board') },
    { label: 'Notebook', icon: <NotebookPen />, onSelect: () => create('notebook') },
  ];

  return (
    <nav className="sidebar" aria-label="Workspace">
      <header className="sidebar__top">
        <TrafficLights />
        <IconButton label="Hide sidebar" size="sm" onClick={() => setSidebarOpen(false)}>
          <PanelLeftClose />
        </IconButton>
      </header>

      <button type="button" className="sidebar__search" onClick={() => setPaletteOpen(true)}>
        <Search width={14} height={14} />
        <span>Search</span>
        <Kbd keys="Mod+K" />
      </button>

      <div className="sidebar__scroll">
        <Favorites />

        <Section title="Pages" action={<IconButton label="New page" size="sm" onClick={(e) => newMenu.openBelow(e.currentTarget)}><Plus /></IconButton>}>
          <PageTree />
        </Section>

        <Trash />
      </div>

      <footer className="sidebar__bottom">
        <button type="button" className="sidebar__new" onClick={(e) => newMenu.openBelow(e.currentTarget)}>
          <Plus width={15} height={15} />
          New page
        </button>
        <ThemeSwitch />
      </footer>

      <Menu anchor={newMenu.anchor} items={newItems} onClose={newMenu.close} />
    </nav>
  );
}

function Section({ title, action, children, defaultOpen = true }: { title: string; action?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="sidebar__section">
      <div className="sidebar__section-head">
        <button type="button" className="sidebar__section-title" onClick={() => setOpen(!open)} aria-expanded={open}>
          {title}
          <ChevronRight width={11} height={11} className={open ? 'is-open' : ''} />
        </button>
        {action}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.smooth} style={{ overflow: 'hidden' }}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Favorites() {
  const favs = useWorkspace(
    useShallow((s) =>
      Object.values(s.pages)
        .filter((p) => p.favorite && !p.trashed)
        .map((p) => p.id),
    ),
  );
  const activeId = useWorkspace((s) => s.activeId);
  const setActive = useWorkspace((s) => s.setActive);
  if (favs.length === 0) return null;
  return (
    <Section title="Favorites">
      {favs.map((id) => (
        <div key={id} className={`tree-row ${activeId === id ? 'is-active' : ''}`} style={{ paddingLeft: 8 }} onClick={() => setActive(id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setActive(id)}>
          <span className="tree-row__chevron is-empty" />
          <RowLabel id={id} />
        </div>
      ))}
    </Section>
  );
}

function Trash() {
  const trashed = useWorkspace(
    useShallow((s) =>
      Object.values(s.pages)
        // only show the top of each trashed subtree
        .filter((p) => p.trashed && !(p.parentId && s.pages[p.parentId]?.trashed))
        .map((p) => p.id),
    ),
  );
  const restorePage = useWorkspace((s) => s.restorePage);
  const deleteForever = useWorkspace((s) => s.deleteForever);
  if (trashed.length === 0) return null;
  return (
    <Section title={`Trash · ${trashed.length}`} defaultOpen={false}>
      {trashed.map((id) => (
        <div key={id} className="tree-row is-trashed" style={{ paddingLeft: 8 }}>
          <Trash2 width={14} height={14} className="tree-row__icon" />
          <RowLabel id={id} icon={false} />
          <span className="tree-row__actions is-visible">
            <button type="button" className="tree-row__action" aria-label="Restore" title="Restore" onClick={() => restorePage(id)}>
              <RotateCcw width={13} height={13} />
            </button>
            <button type="button" className="tree-row__action" aria-label="Delete forever" title="Delete forever" onClick={() => deleteForever(id)}>
              <X width={13} height={13} />
            </button>
          </span>
        </div>
      ))}
    </Section>
  );
}

const THEMES: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

/**
 * A segmented control. The sliding highlight uses framer-motion's
 * `layoutId`: when the same layoutId renders in a new place, framer measures
 * both positions and animates between them (a "shared layout animation").
 */
function ThemeSwitch() {
  const theme = useWorkspace((s) => s.theme);
  return (
    <div className="segmented" role="radiogroup" aria-label="Appearance">
      {THEMES.map(({ value, label, Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={theme === value} aria-label={label} title={label} className="segmented__btn" onClick={() => changeTheme(value)}>
          {theme === value && <motion.span layoutId="theme-pill" className="segmented__pill" transition={spring.snappy} />}
          <Icon width={14} height={14} />
        </button>
      ))}
    </div>
  );
}

function RowLabel({ id, icon = true }: { id: string; icon?: boolean }) {
  const page = usePageLabel(id);
  if (!page) return null;
  return (
    <>
      {icon && <PageIcon page={page} size={15} className="tree-row__icon" />}
      <span className="tree-row__title">{displayTitle(page)}</span>
    </>
  );
}
