import { useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Copy, MoreHorizontal, Plus, Star, StarOff, Trash2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { childrenOf, displayTitle, useWorkspace } from '@/store/workspace';
import type { ID } from '@/store/types';
import { PageIcon } from '@/components/ui/PageIcon';
import { Menu, useMenu, type MenuItem } from '@/components/ui/Menu';
import { spring } from '@/lib/motion';

/**
 * A recursive, drag-and-drop page tree.
 *
 * Drag & drop uses the native HTML5 API: rows are `draggable`, and while
 * dragging over a row we look at where the pointer sits vertically:
 *
 *   top 25%     → drop *before* this row (same parent)
 *   middle 50%  → drop *inside* this row (becomes a child)
 *   bottom 25%  → drop *after* this row
 *
 * The dragged id travels in `dataTransfer` under a custom MIME type so that
 * other drop targets (e.g. the spatial canvas) can recognise a Lumen page.
 */
export const PAGE_MIME = 'application/x-lumen-page';

type DropZone = 'before' | 'inside' | 'after';

/**
 * Selecting only child *ids* (compared with `useShallow`) means typing in a
 * document — which changes that page object — doesn't re-render the whole
 * tree; only the row whose title/icon actually changed updates.
 */
const useChildIds = (parentId: ID | null) =>
  useWorkspace(useShallow((s) => childrenOf(s.pages, parentId).map((p) => p.id)));

export function PageTree({ parentId = null, depth = 0 }: { parentId?: ID | null; depth?: number }) {
  const ids = useChildIds(parentId);

  return (
    <div role={depth === 0 ? 'tree' : 'group'}>
      <AnimatePresence initial={false}>
        {ids.map((id) => (
          <TreeRow key={id} id={id} depth={depth} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function TreeRow({ id, depth }: { id: ID; depth: number }) {
  const page = useWorkspace(
    useShallow((s) => {
      const p = s.pages[id];
      // the row can outlive its page for one exit animation after a hard delete
      return p ? { id, title: p.title, kind: p.kind, icon: p.icon, favorite: p.favorite, parentId: p.parentId } : null;
    }),
  );
  const active = useWorkspace((s) => s.activeId === id);
  const open = useWorkspace((s) => !!s.expanded[id]);
  const hasChildren = useChildIds(id).length > 0;
  const s = useWorkspace.getState();
  const [drop, setDrop] = useState<DropZone | null>(null);
  const menu = useMenu();
  if (!page) return null;

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(PAGE_MIME, page.id);
    e.dataTransfer.setData('text/plain', displayTitle(page));
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const zoneFor = (e: DragEvent): DropZone => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = (e.clientY - r.top) / r.height;
    return t < 0.25 ? 'before' : t > 0.75 ? 'after' : 'inside';
  };

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(PAGE_MIME)) return;
    e.preventDefault(); // allow dropping
    e.dataTransfer.dropEffect = 'move';
    setDrop(zoneFor(e));
  };

  const onDrop = (e: DragEvent) => {
    const dragged = e.dataTransfer.getData(PAGE_MIME);
    setDrop(null);
    if (!dragged || dragged === page.id) return;
    e.preventDefault();
    const zone = zoneFor(e);
    if (zone === 'inside') {
      s.movePage(dragged, page.id, childrenOf(s.pages, page.id).length);
      s.toggleExpanded(page.id, true);
    } else {
      const siblings = childrenOf(s.pages, page.parentId).filter((p) => p.id !== dragged);
      const idx = siblings.findIndex((p) => p.id === page.id);
      s.movePage(dragged, page.parentId, zone === 'before' ? idx : idx + 1);
    }
  };

  const items: MenuItem[] = [
    {
      label: page.favorite ? 'Remove from favorites' : 'Add to favorites',
      icon: page.favorite ? <StarOff /> : <Star />,
      onSelect: () => s.toggleFavorite(page.id),
    },
    {
      label: 'Duplicate',
      icon: <Copy />,
      shortcut: 'Mod+D',
      onSelect: () => {
        const copy = s.duplicatePage(page.id);
        if (copy) s.setActive(copy);
      },
    },
    'separator',
    { label: 'Move to trash', icon: <Trash2 />, danger: true, onSelect: () => s.trashPage(page.id) },
  ];

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={spring.smooth}
      style={{ overflow: 'hidden' }}
    >
      <div
        role="treeitem"
        aria-selected={active}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={0}
        draggable
        className={`tree-row ${active ? 'is-active' : ''} ${drop ? `drop-${drop}` : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => s.setActive(page.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') s.setActive(page.id);
          if (e.key === 'ArrowRight') s.toggleExpanded(page.id, true);
          if (e.key === 'ArrowLeft') s.toggleExpanded(page.id, false);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          menu.openAt(e);
        }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={() => setDrop(null)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className={`tree-row__chevron ${open ? 'is-open' : ''} ${hasChildren ? '' : 'is-empty'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            s.toggleExpanded(page.id);
          }}
        >
          <ChevronRight width={12} height={12} />
        </button>
        <PageIcon page={page} size={15} className="tree-row__icon" />
        <span className="tree-row__title">{displayTitle(page)}</span>
        <span className="tree-row__actions">
          <button
            type="button"
            className="tree-row__action"
            aria-label="Page actions"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              menu.openBelow(e.currentTarget);
            }}
          >
            <MoreHorizontal width={14} height={14} />
          </button>
          <button
            type="button"
            className="tree-row__action"
            aria-label="Add sub-page"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              s.setActive(s.createPage('doc', page.id));
            }}
          >
            <Plus width={14} height={14} />
          </button>
        </span>
      </div>
      <Menu anchor={menu.anchor} items={items} onClose={menu.close} />
      {open && hasChildren && <PageTree parentId={page.id} depth={depth + 1} />}
    </motion.div>
  );
}
