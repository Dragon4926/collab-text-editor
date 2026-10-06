import { useCallback, useRef } from 'react';
import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { GripHorizontal, PenLine, Trash2 } from 'lucide-react';
import type { Stroke } from '@/store/types';
import { InkSurface } from '@/features/ink/InkSurface';
import { InkToolbar } from '@/features/ink/InkToolbar';
import { useInkDocument } from '@/features/ink/useInkDocument';

/**
 * A handwriting block inside a document — the Samsung Notes trick of mixing
 * typed text and ink on one page.
 *
 * It is an *atom* node: ProseMirror treats it as a single opaque unit (you
 * can select, move or delete it, but not put the cursor inside). Its content
 * lives entirely in attributes: the strokes array and the block height.
 *
 * Strokes use a fixed logical width (720 = the reading column), so a sketch
 * drawn on a wide screen looks identical on a narrow one — the SVG viewBox
 * scales it.
 */

export const SKETCH_W = 720;

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sketch: {
      insertSketch: () => ReturnType;
    };
  }
}

function SketchView({ node, updateAttributes, selected, deleteNode, editor }: ReactNodeViewProps) {
  const strokes = (node.attrs.strokes as Stroke[]) ?? [];
  const height = node.attrs.height as number;
  const save = useCallback((next: Stroke[]) => updateAttributes({ strokes: next }), [updateAttributes]);
  const doc = useInkDocument(strokes, save);
  const drag = useRef<{ y: number; h: number } | null>(null);

  return (
    <NodeViewWrapper className={`sketch-block ${selected ? 'is-selected' : ''}`}>
      <div className="sketch-block__head" contentEditable={false}>
        <span className="sketch-block__label">
          <PenLine width={13} height={13} /> Sketch
        </span>
        {editor.isEditable && (
          <div className="sketch-block__tools">
            <InkToolbar onUndo={doc.undo} onRedo={doc.redo} canUndo={doc.canUndo} canRedo={doc.canRedo} />
            <button type="button" className="sketch-block__delete" aria-label="Delete sketch" title="Delete sketch" onClick={deleteNode}>
              <Trash2 width={15} height={15} />
            </button>
          </div>
        )}
      </div>
      <div contentEditable={false} className="sketch-block__canvas">
        <InkSurface strokes={strokes} commit={doc.commit} width={SKETCH_W} height={height} readOnly={!editor.isEditable} />
      </div>
      {/* drag the bottom edge to make the drawing area taller */}
      <div
        className="sketch-block__resize"
        contentEditable={false}
        role="separator"
        aria-label="Resize sketch"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, h: height };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const scale = SKETCH_W / (e.currentTarget.parentElement?.clientWidth ?? SKETCH_W);
          updateAttributes({ height: Math.max(160, Math.round(drag.current.h + (e.clientY - drag.current.y) * scale)) });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <GripHorizontal width={16} height={16} />
      </div>
    </NodeViewWrapper>
  );
}

export const SketchBlock = Node.create({
  name: 'sketch',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      strokes: {
        default: [],
        parseHTML: (el) => JSON.parse(el.getAttribute('data-strokes') ?? '[]'),
        renderHTML: (attrs) => ({ 'data-strokes': JSON.stringify(attrs.strokes) }),
      },
      height: {
        default: 280,
        parseHTML: (el) => Number(el.getAttribute('data-height') ?? 280),
        renderHTML: (attrs) => ({ 'data-height': attrs.height }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-sketch]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-sketch': '' })];
  },

  addNodeView() {
    // stopEvent: let the ink surface handle its own pointer events instead
    // of ProseMirror interpreting them as selection gestures
    return ReactNodeViewRenderer(SketchView, { stopEvent: () => true });
  },

  addCommands() {
    return {
      insertSketch:
        () =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name }, { type: 'paragraph' }]),
    };
  },
});
