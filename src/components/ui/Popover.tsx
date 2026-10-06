import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { popIn } from '@/lib/motion';
import './ui.css';

interface Props {
  /** the element the popover hangs from; null = closed */
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center';
}

/**
 * A floating glass panel anchored below an element. Shares the Menu's
 * portal + viewport-clamping approach, but holds arbitrary content (icon
 * pickers, colour palettes, pen settings…).
 */
export function Popover({ anchor, onClose, children, className = '', align = 'start' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 280;
    const h = el?.offsetHeight ?? 200;
    let x = align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
    let y = r.bottom + 8;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
    setPos({ x, y });
  }, [anchor, align]);

  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <AnimatePresence>
      {anchor && (
        <motion.div
          ref={ref}
          className={`popover ${className}`}
          style={{ left: pos.x, top: pos.y }}
          variants={popIn}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
