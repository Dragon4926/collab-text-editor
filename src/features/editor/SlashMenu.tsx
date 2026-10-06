import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { popIn } from '@/lib/motion';
import { useSlash } from './extensions/SlashCommand';
import type { BlockCommand } from './commands';

/**
 * Renders the slash menu from the bridge store. Items are grouped by their
 * `group` field; the highlighted row is scrolled into view as the user
 * arrows through the list.
 */
export function SlashMenu() {
  const { open, rect, items, index, select } = useSlash();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('.is-hover')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const top = rect ? Math.min(rect.bottom + 8, window.innerHeight - 340) : 0;
  const left = rect ? Math.min(rect.left, window.innerWidth - 300) : 0;

  let lastGroup = '';

  return createPortal(
    <AnimatePresence>
      {open && rect && (
        <motion.div
          className="slash-menu"
          style={{ top, left }}
          variants={popIn}
          initial="initial"
          animate="animate"
          exit="exit"
          onMouseDown={(e) => e.preventDefault() /* keep editor focus */}
        >
          <div className="slash-menu__list" ref={listRef} role="listbox">
            {items.length === 0 && <div className="slash-menu__empty">No matching blocks</div>}
            {items.map((item: BlockCommand, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {header && <div className="slash-menu__group">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === index}
                    className={`slash-menu__item ${i === index ? 'is-hover' : ''}`}
                    onPointerMove={() => i !== index && useSlash.setState({ index: i })}
                    onClick={() => select?.(item)}
                  >
                    <span className="slash-menu__icon">
                      <Icon width={18} height={18} />
                    </span>
                    <span className="slash-menu__text">
                      <span className="slash-menu__title">{item.title}</span>
                      <span className="slash-menu__desc">{item.description}</span>
                    </span>
                    {item.hint && <span className="slash-menu__hint">{item.hint}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
