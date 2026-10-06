import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { popIn } from '@/lib/motion';
import { Kbd } from './Kbd';
import './ui.css';

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      checked?: boolean;
      onSelect: () => void;
    }
  | 'separator'
  | { heading: string };

export interface MenuAnchor {
  x: number;
  y: number;
}

interface Props {
  anchor: MenuAnchor | null;
  items: MenuItem[];
  onClose: () => void;
  width?: number;
}

/**
 * A macOS-style menu rendered in a portal.
 *
 * Portals render the menu as a child of <body> so it can't be clipped by an
 * `overflow: hidden` ancestor, while React still treats it as part of the
 * component tree (events bubble through React parents as usual).
 *
 * Positioning: we open at the anchor point, then measure the menu in a layout
 * effect (before paint) and flip it back inside the viewport if it overflows.
 */
export function Menu({ anchor, items, onClose, width = 220 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuAnchor | null>(null);
  const [hover, setHover] = useState(-1);

  const actionable = items
    .map((it, i) => (typeof it === 'object' && 'onSelect' in it ? i : -1))
    .filter((i) => i >= 0);

  useLayoutEffect(() => {
    if (!anchor) return setPos(null);
    const el = ref.current;
    const w = el?.offsetWidth ?? width;
    const h = el?.offsetHeight ?? 200;
    const x = Math.min(anchor.x, window.innerWidth - w - 8);
    const y = anchor.y + h > window.innerHeight - 8 ? Math.max(8, anchor.y - h) : anchor.y;
    setPos({ x: Math.max(8, x), y });
    setHover(-1);
  }, [anchor, width]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        setHover((h) => {
          const at = actionable.indexOf(h);
          const next = at < 0 ? (dir > 0 ? 0 : actionable.length - 1) : (at + dir + actionable.length) % actionable.length;
          return actionable[next];
        });
      } else if (e.key === 'Enter' && hover >= 0) {
        e.preventDefault();
        const it = items[hover];
        if (typeof it === 'object' && 'onSelect' in it) {
          onClose();
          it.onSelect();
        }
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose, hover, items, actionable]);

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={ref}
          role="menu"
          className="menu"
          style={{ left: pos?.x ?? anchor.x, top: pos?.y ?? anchor.y, width, transformOrigin: 'top left' }}
          variants={popIn}
          initial="initial"
          animate="animate"
          exit="exit"
          onContextMenu={(e) => e.preventDefault()}
        >
          {items.map((it, i) => {
            if (it === 'separator') return <div key={i} className="menu__sep" role="separator" />;
            if ('heading' in it)
              return (
                <div key={i} className="menu__heading">
                  {it.heading}
                </div>
              );
            return (
              <button
                key={i}
                role="menuitem"
                type="button"
                className={`menu__item ${it.danger ? 'is-danger' : ''} ${hover === i ? 'is-hover' : ''}`}
                onPointerEnter={() => setHover(i)}
                onClick={() => {
                  onClose();
                  it.onSelect();
                }}
              >
                <span className="menu__icon">{it.icon}</span>
                <span className="menu__label">{it.label}</span>
                {it.checked && <span className="menu__check">✓</span>}
                {it.shortcut && <Kbd keys={it.shortcut} />}
              </button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Convenience hook: `const menu = useMenu(); <button onClick={menu.openAt}>` */
export function useMenu() {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  const openAt = useCallback((e: { clientX: number; clientY: number; currentTarget?: EventTarget | null }) => {
    const el = e.currentTarget as HTMLElement | null;
    if (el && 'getBoundingClientRect' in el && e.clientX === 0 && e.clientY === 0) {
      // keyboard activation: anchor to the element instead of the pointer
      const r = el.getBoundingClientRect();
      setAnchor({ x: r.left, y: r.bottom + 4 });
    } else {
      setAnchor({ x: e.clientX, y: e.clientY });
    }
  }, []);
  const openBelow = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAnchor({ x: r.left, y: r.bottom + 6 });
  }, []);
  return { anchor, openAt, openBelow, close, isOpen: anchor !== null };
}
