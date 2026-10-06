import { create } from 'zustand';
import { AnimatePresence, motion } from 'framer-motion';
import { nanoid } from 'nanoid';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { spring, withFocus } from '@/lib/motion';
import './ui.css';

/**
 * Lightweight toasts. Any code can call `toast('Saved')` — no React context
 * or hook required — because the queue lives in a zustand store outside
 * the component tree.
 */
interface Toast {
  id: string;
  message: string;
  tone: 'ok' | 'error';
}

const useToasts = create<{ items: Toast[] }>(() => ({ items: [] }));

export function toast(message: string, tone: Toast['tone'] = 'ok') {
  const id = nanoid(6);
  useToasts.setState((s) => ({ items: [...s.items, { id, message, tone }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), 2800);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  return (
    <div className="toaster" role="status" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast--${t.tone}`}
            initial={{ opacity: 0, y: 16, scale: 0.92, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            exit={{ opacity: 0, y: 8, scale: 0.96, filter: 'blur(6px)', transition: { duration: 0.18 } }}
            transition={withFocus(spring.bouncy)}
          >
            {t.tone === 'ok' ? <CheckCircle2 width={16} height={16} /> : <AlertCircle width={16} height={16} />}
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
