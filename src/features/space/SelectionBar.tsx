import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeftRight,
  BringToFront,
  Copy,
  SendToBack,
  SquareDashed,
  Tag,
  Trash2,
} from 'lucide-react';
import type { NoteColor, SpaceCard, SpaceEdge } from '@/store/types';
import { withShortcut } from '@/lib/keys';
import { NOTE_COLORS, type AlignMode } from './spaceModel';

interface BtnProps {
  label: string;
  shortcut?: string;
  onClick: () => void;
  pressed?: boolean;
  children: React.ReactNode;
}

function Btn({ label, shortcut, onClick, pressed, children }: BtnProps) {
  return (
    <button type="button" className={`glass-bar__btn glass-bar__btn--sm ${pressed ? 'is-on' : ''}`} aria-label={label} title={shortcut ? withShortcut(label, shortcut) : label} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

const ALIGN: { mode: AlignMode; label: string; Icon: typeof Copy }[] = [
  { mode: 'left', label: 'Align left', Icon: AlignStartVertical },
  { mode: 'hcenter', label: 'Align centre', Icon: AlignCenterVertical },
  { mode: 'right', label: 'Align right', Icon: AlignEndVertical },
  { mode: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { mode: 'vcenter', label: 'Align middle', Icon: AlignCenterHorizontal },
  { mode: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
];

interface CardBarProps {
  cards: SpaceCard[];
  onColor: (c: NoteColor) => void;
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'x' | 'y') => void;
  onFront: () => void;
  onBack: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/**
 * The contextual bar for selected cards. It only offers what applies:
 * colours for one sticky note, alignment once two cards are selected,
 * distribution from three.
 */
export function CardBar({ cards, onColor, onAlign, onDistribute, onFront, onBack, onDuplicate, onDelete }: CardBarProps) {
  const note = cards.length === 1 && cards[0].type === 'note' ? cards[0] : null;
  return (
    <div className="glass-bar" role="toolbar" aria-label="Selection">
      {note && (
        <>
          {NOTE_COLORS.map((c) => (
            <button key={c} type="button" className={`space__color note--${c} ${note.color === c ? 'is-active' : ''}`} aria-label={`${c} note`} aria-pressed={note.color === c} onClick={() => onColor(c)} />
          ))}
          <span className="glass-bar__sep" />
        </>
      )}
      {cards.length >= 2 && (
        <>
          {ALIGN.map(({ mode, label, Icon }) => (
            <Btn key={mode} label={label} onClick={() => onAlign(mode)}>
              <Icon width={16} height={16} />
            </Btn>
          ))}
          {cards.length >= 3 && (
            <>
              <Btn label="Distribute horizontally" onClick={() => onDistribute('x')}>
                <AlignHorizontalDistributeCenter width={16} height={16} />
              </Btn>
              <Btn label="Distribute vertically" onClick={() => onDistribute('y')}>
                <AlignVerticalDistributeCenter width={16} height={16} />
              </Btn>
            </>
          )}
          <span className="glass-bar__sep" />
        </>
      )}
      <Btn label="Bring to front" shortcut="]" onClick={onFront}>
        <BringToFront width={16} height={16} />
      </Btn>
      <Btn label="Send to back" shortcut="[" onClick={onBack}>
        <SendToBack width={16} height={16} />
      </Btn>
      <Btn label="Duplicate" shortcut="Mod+D" onClick={onDuplicate}>
        <Copy width={16} height={16} />
      </Btn>
      <Btn label="Delete" shortcut="Del" onClick={onDelete}>
        <Trash2 width={16} height={16} />
      </Btn>
    </div>
  );
}

interface EdgeBarProps {
  edge: SpaceEdge;
  onLabel: () => void;
  onDashed: () => void;
  onReverse: () => void;
  onDelete: () => void;
}

/** The contextual bar for a selected connector. */
export function EdgeBar({ edge, onLabel, onDashed, onReverse, onDelete }: EdgeBarProps) {
  return (
    <div className="glass-bar" role="toolbar" aria-label="Connector">
      <Btn label={edge.label ? 'Edit label' : 'Add label'} shortcut="Enter" onClick={onLabel}>
        <Tag width={16} height={16} />
      </Btn>
      <Btn label="Dashed line" onClick={onDashed} pressed={!!edge.dashed}>
        <SquareDashed width={16} height={16} />
      </Btn>
      <Btn label="Reverse direction" onClick={onReverse}>
        <ArrowLeftRight width={16} height={16} />
      </Btn>
      <span className="glass-bar__sep" />
      <Btn label="Delete connector" shortcut="Del" onClick={onDelete}>
        <Trash2 width={16} height={16} />
      </Btn>
    </div>
  );
}
