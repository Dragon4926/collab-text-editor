import { withShortcut } from '@/lib/keys';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eraser, Hand, Lasso, Redo2, Undo2 } from 'lucide-react';
import type { PenKind } from '@/store/types';
import { Popover } from '@/components/ui/Popover';
import { spring } from '@/lib/motion';
import { INK_COLORS, PENS, PEN_ORDER, SIZES } from './pens';
import { inkFill } from './InkLayer';
import { useInkTool, type InkMode } from './toolStore';
import './ink.css';

/** Tiny illustrated nibs so each pen is recognisable at a glance. */
function PenGlyph({ pen, color }: { pen: PenKind; color: string }) {
  const tip: Record<PenKind, string> = {
    fountain: 'M12 2 L16 10 L12 13 L8 10 Z',
    pen: 'M10.5 3 h3 l0.5 8 h-4 z',
    pencil: 'M12 2 L15 9 h-6 z',
    marker: 'M9 4 h6 v6 h-6 z',
    highlighter: 'M8 4 l8 -1 v7 h-8 z',
  };
  return (
    <svg viewBox="0 0 24 40" className={`pen-glyph pen-glyph--${pen}`} aria-hidden="true">
      <path d={tip[pen]} fill={color} />
      <rect x="8" y="12" width="8" height="28" rx="2.5" className="pen-glyph__body" />
      <rect x="8" y="12" width="8" height="4" fill={color} opacity="0.9" />
    </svg>
  );
}

interface Props {
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** extra controls (paper picker, shapes…) */
  children?: React.ReactNode;
  showPan?: boolean;
  /** one colour button instead of the full palette — for tight spaces */
  compact?: boolean;
}

/**
 * The floating pen case. Pens rise when selected — a small physical touch
 * borrowed from Samsung Notes and Apple's PencilKit tool picker. Tapping the
 * already-selected pen opens its colour/size settings.
 */
export function InkToolbar({ onUndo, onRedo, canUndo, canRedo, children, showPan, compact }: Props) {
  const tool = useInkTool();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = tool.settings[tool.pen];

  const modeBtn = (mode: InkMode, label: string, Icon: typeof Eraser) => (
    <button type="button" className={`ink-toolbar__tool ${tool.mode === mode ? 'is-active' : ''}`} aria-label={label} title={label} aria-pressed={tool.mode === mode} onClick={() => tool.setMode(mode)}>
      <Icon width={18} height={18} />
    </button>
  );

  return (
    <div className="ink-toolbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ink-toolbar__pens">
        {PEN_ORDER.map((p) => {
          const active = tool.mode === 'draw' && tool.pen === p;
          return (
            <motion.button
              key={p}
              type="button"
              className="ink-toolbar__pen"
              aria-label={PENS[p].label}
              title={PENS[p].label}
              aria-pressed={active}
              animate={{ y: active ? -6 : 4 }}
              whileHover={{ y: active ? -8 : 0 }}
              transition={spring.bouncy}
              onClick={(e) => {
                if (active) setAnchor(e.currentTarget);
                tool.setPen(p);
              }}
            >
              <PenGlyph pen={p} color={inkFill(tool.settings[p].color)} />
            </motion.button>
          );
        })}
      </div>

      <span className="ink-toolbar__sep" />
      {modeBtn('erase', 'Eraser', Eraser)}
      {modeBtn('lasso', 'Lasso select', Lasso)}
      {showPan && modeBtn('pan', 'Pan', Hand)}
      <span className="ink-toolbar__sep" />

      {compact ? (
        <button
          type="button"
          className="ink-toolbar__swatch is-active"
          style={{ background: inkFill(current.color) }}
          aria-label="Colour and size"
          title="Colour and size"
          onClick={(e) => setAnchor(e.currentTarget)}
        />
      ) : (
        <div className="ink-toolbar__colors">
          {INK_COLORS.slice(0, 7).map((c) => (
            <button
              key={c}
              type="button"
              className={`ink-toolbar__swatch ${current.color === c && tool.mode === 'draw' ? 'is-active' : ''}`}
              style={{ background: inkFill(c) }}
              aria-label={`Color ${c}`}
              onClick={() => tool.setColor(c)}
            />
          ))}
        </div>
      )}

      {(onUndo || onRedo) && (
        <>
          <span className="ink-toolbar__sep" />
          <button type="button" className="ink-toolbar__tool" aria-label="Undo" title={withShortcut('Undo', 'Mod+Z')} disabled={!canUndo} onClick={onUndo}>
            <Undo2 width={18} height={18} />
          </button>
          <button type="button" className="ink-toolbar__tool" aria-label="Redo" title={withShortcut('Redo', 'Mod+Y')} disabled={!canRedo} onClick={onRedo}>
            <Redo2 width={18} height={18} />
          </button>
        </>
      )}
      {children}

      <Popover anchor={anchor} onClose={() => setAnchor(null)} className="pen-settings" align="center">
        <div className="popover__label">{PENS[tool.pen].label}</div>
        <div className="pen-settings__sizes">
          {SIZES.map((s) => (
            <button key={s} type="button" className={current.size === s ? 'is-active' : ''} aria-label={`Size ${s}`} onClick={() => tool.setSize(s)}>
              <span style={{ width: 4 + s * 2.4, height: 4 + s * 2.4, background: inkFill(current.color) }} />
            </button>
          ))}
        </div>
        <div className="popover__label">Colour</div>
        <div className="pen-settings__colors">
          {INK_COLORS.map((c) => (
            <button key={c} type="button" className={current.color === c ? 'is-active' : ''} style={{ background: inkFill(c) }} aria-label={`Color ${c}`} onClick={() => tool.setColor(c)} />
          ))}
          <label className="pen-settings__custom" title="Custom colour">
            <input type="color" value={current.color} onChange={(e) => tool.setColor(e.target.value)} aria-label="Custom colour" />
          </label>
        </div>
      </Popover>
    </div>
  );
}
