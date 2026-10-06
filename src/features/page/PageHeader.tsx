import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Shuffle, SmilePlus, X } from 'lucide-react';
import { useWorkspace } from '@/store/workspace';
import type { ID } from '@/store/types';
import { Popover } from '@/components/ui/Popover';
import { ICONS, ICON_COLORS, PageIcon } from '@/components/ui/PageIcon';
import { spring } from '@/lib/motion';
import { COVERS, COVER_IDS } from './covers';
import './PageHeader.css';

interface Props {
  pageId: ID;
  /** Enter / ArrowDown in the title moves focus into the body */
  onExitDown?: () => void;
  compact?: boolean;
}

/**
 * Cover, icon and title of a page — the Notion-style header.
 *
 * The title is a <textarea> that grows with its content: we reset its height
 * to `auto` and then set it to `scrollHeight` on every change. A textarea
 * (rather than contentEditable) keeps the title plain text, which is all it
 * should ever be.
 */
export function PageHeader({ pageId, onExitDown, compact }: Props) {
  const page = useWorkspace((s) => s.pages[pageId]);
  const updatePage = useWorkspace((s) => s.updatePage);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [iconAnchor, setIconAnchor] = useState<HTMLElement | null>(null);
  const [coverAnchor, setCoverAnchor] = useState<HTMLElement | null>(null);

  // autosize the title
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [page?.title]);

  // focus the title of a brand-new, empty page
  useEffect(() => {
    if (page && !page.title && Date.now() - page.createdAt < 1500) titleRef.current?.focus();
  }, [pageId]);

  if (!page) return null;

  const randomCover = () => COVER_IDS[Math.floor(Math.random() * COVER_IDS.length)];

  return (
    <div className={`page-header ${page.cover ? 'has-cover' : ''} ${compact ? 'is-compact' : ''}`}>
      <AnimatePresence initial={false}>
        {page.cover && (
          <motion.div
            className="page-header__cover"
            style={{ background: COVERS[page.cover] }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: compact ? 120 : 200, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.smooth}
          >
            <div className="page-header__cover-actions">
              <button type="button" onClick={(e) => setCoverAnchor(e.currentTarget)}>
                Change cover
              </button>
              <button type="button" onClick={() => updatePage(pageId, { cover: null })}>
                Remove
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="page-header__body">
        {page.icon && (
          <motion.button
            type="button"
            className="page-header__icon"
            aria-label="Change icon"
            onClick={(e) => setIconAnchor(e.currentTarget)}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.06, rotate: -3 }}
            whileTap={{ scale: 0.95 }}
            transition={spring.bouncy}
          >
            <PageIcon page={page} size={compact ? 30 : 40} />
          </motion.button>
        )}

        <div className="page-header__adders">
          {!page.icon && (
            <button
              type="button"
              onClick={(e) => {
                updatePage(pageId, { icon: { name: 'Sparkles', color: ICON_COLORS[0] } });
                setIconAnchor(e.currentTarget);
              }}
            >
              <SmilePlus width={14} height={14} /> Add icon
            </button>
          )}
          {!page.cover && (
            <button type="button" onClick={() => updatePage(pageId, { cover: randomCover() })}>
              <ImagePlus width={14} height={14} /> Add cover
            </button>
          )}
        </div>

        <textarea
          ref={titleRef}
          className="page-header__title"
          rows={1}
          value={page.title}
          placeholder="Untitled"
          aria-label="Page title"
          onChange={(e) => updatePage(pageId, { title: e.target.value.replace(/\n/g, '') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === e.currentTarget.value.length)) {
              e.preventDefault();
              onExitDown?.();
            }
          }}
        />
      </div>

      <Popover anchor={iconAnchor} onClose={() => setIconAnchor(null)} className="icon-picker">
        <div className="popover__label">Icon</div>
        <div className="icon-picker__grid">
          {Object.entries(ICONS).map(([name, Icon]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              className={page.icon?.name === name ? 'is-active' : ''}
              onClick={() => updatePage(pageId, { icon: { name, color: page.icon?.color ?? ICON_COLORS[0] } })}
            >
              <Icon width={18} height={18} color={page.icon?.color} />
            </button>
          ))}
        </div>
        <div className="popover__label">Color</div>
        <div className="icon-picker__colors">
          {ICON_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              className={page.icon?.color === c ? 'is-active' : ''}
              style={{ background: c }}
              onClick={() => updatePage(pageId, { icon: { name: page.icon?.name ?? 'Sparkles', color: c } })}
            />
          ))}
          <button
            type="button"
            className="icon-picker__remove"
            aria-label="Remove icon"
            onClick={() => {
              updatePage(pageId, { icon: null });
              setIconAnchor(null);
            }}
          >
            <X width={14} height={14} />
          </button>
        </div>
      </Popover>

      <Popover anchor={coverAnchor} onClose={() => setCoverAnchor(null)} className="cover-picker">
        <div className="popover__label">Cover</div>
        <div className="cover-picker__grid">
          {COVER_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-label={`Cover ${id}`}
              className={page.cover === id ? 'is-active' : ''}
              style={{ background: COVERS[id] }}
              onClick={() => updatePage(pageId, { cover: id })}
            />
          ))}
        </div>
        <button type="button" className="cover-picker__shuffle" onClick={() => updatePage(pageId, { cover: randomCover() })}>
          <Shuffle width={13} height={13} /> Surprise me
        </button>
      </Popover>
    </div>
  );
}
