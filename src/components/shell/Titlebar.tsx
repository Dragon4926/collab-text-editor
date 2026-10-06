import { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Copy, MoreHorizontal, PanelLeftOpen, Star, Trash2 } from 'lucide-react';
import { ancestry, displayTitle, useWorkspace } from '@/store/workspace';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, useMenu } from '@/components/ui/Menu';
import { KIND_LABEL, PageIcon } from '@/components/ui/PageIcon';
import { spring } from '@/lib/motion';
import { TrafficLights } from './TrafficLights';
import './Titlebar.css';

/**
 * The unified title bar above the content, macOS-style: it doubles as the
 * toolbar. When the sidebar is hidden, the traffic lights move here so the
 * window always keeps its controls.
 */
export function Titlebar({ children }: { children?: React.ReactNode }) {
  const sidebarOpen = useWorkspace((s) => s.sidebarOpen);
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen);
  const page = useWorkspace((s) => (s.activeId ? s.pages[s.activeId] : undefined));
  const pages = useWorkspace((s) => s.pages);
  const setActive = useWorkspace((s) => s.setActive);
  const toggleFavorite = useWorkspace((s) => s.toggleFavorite);
  const trashPage = useWorkspace((s) => s.trashPage);
  const duplicatePage = useWorkspace((s) => s.duplicatePage);
  const menu = useMenu();

  const crumbs = page ? ancestry(pages, page.id) : [];

  return (
    <header className="titlebar">
      {!sidebarOpen && (
        <motion.div className="titlebar__lead" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={spring.smooth}>
          <TrafficLights />
          <IconButton label="Show sidebar" size="sm" onClick={() => setSidebarOpen(true)}>
            <PanelLeftOpen />
          </IconButton>
        </motion.div>
      )}

      <nav className="titlebar__crumbs" aria-label="Breadcrumb">
        {crumbs.map((p, i) => (
          <span key={p.id} className="titlebar__crumb">
            {i > 0 && <ChevronRight width={12} height={12} className="titlebar__sep" />}
            {i === crumbs.length - 1 ? (
              <CurrentTitle id={p.id} />
            ) : (
              <button type="button" onClick={() => setActive(p.id)}>
                <PageIcon page={p} size={14} />
                <span>{displayTitle(p)}</span>
              </button>
            )}
          </span>
        ))}
        {page && <span className="titlebar__kind">{KIND_LABEL[page.kind]}</span>}
      </nav>

      <div className="titlebar__tools">{children}</div>

      {page && (
        <div className="titlebar__actions">
          <IconButton label={page.favorite ? 'Remove from favorites' : 'Add to favorites'} active={page.favorite} onClick={() => toggleFavorite(page.id)}>
            <motion.span key={String(page.favorite)} initial={{ scale: 0.6, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy} style={{ display: 'flex' }}>
              <Star fill={page.favorite ? 'currentColor' : 'none'} />
            </motion.span>
          </IconButton>
          <IconButton label="More" onClick={(e) => menu.openBelow(e.currentTarget)}>
            <MoreHorizontal />
          </IconButton>
          <Menu
            anchor={menu.anchor}
            onClose={menu.close}
            items={[
              {
                label: 'Duplicate',
                icon: <Copy />,
                onSelect: () => {
                  const id = duplicatePage(page.id);
                  if (id) setActive(id);
                },
              },
              'separator',
              { label: 'Move to trash', icon: <Trash2 />, danger: true, onSelect: () => trashPage(page.id) },
            ]}
          />
        </div>
      )}
    </header>
  );
}

/**
 * The current page's crumb doubles as a rename field (click to edit), which
 * is how canvases — which have no big header — get their titles.
 */
function CurrentTitle({ id }: { id: string }) {
  const page = useWorkspace((s) => s.pages[id]);
  const updatePage = useWorkspace((s) => s.updatePage);
  // brand-new canvases start in rename mode, like a new folder in Finder
  const [editing, setEditing] = useState(
    () => !!page && !page.title && (page.kind === 'space' || page.kind === 'board') && Date.now() - page.createdAt < 1500,
  );
  if (!page) return null;
  return editing ? (
    <span className="titlebar__rename">
      <PageIcon page={page} size={14} />
      <input
        autoFocus
        value={page.title}
        placeholder={displayTitle({ ...page, title: '' })}
        size={Math.max(8, page.title.length + 1)}
        aria-label="Rename page"
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => updatePage(id, { title: e.target.value })}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
      />
    </span>
  ) : (
    <button type="button" aria-current="page" title="Rename" onClick={() => setEditing(true)}>
      <PageIcon page={page} size={14} />
      <span>{displayTitle(page)}</span>
    </button>
  );
}
