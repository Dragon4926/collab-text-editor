import { mergeAttributes, Node, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { AlertTriangle, Info, Lightbulb, Sparkles } from 'lucide-react';

/**
 * A callout: a tinted box with an icon that holds normal paragraphs.
 *
 * Defining a custom node means describing it to ProseMirror:
 *  - `group: 'block'`         it can appear wherever blocks can
 *  - `content: 'paragraph+'`  it contains one or more paragraphs
 *  - `parseHTML/renderHTML`   how it maps to and from HTML (copy/paste!)
 *  - `addNodeView`            how it renders interactively in the editor
 *
 * The node view is a React component. `NodeViewContent` marks where
 * ProseMirror should render the editable children; everything else in the
 * component (the icon button) is non-editable chrome.
 */

export const CALLOUT_TONES = {
  info: { Icon: Info, label: 'Info' },
  idea: { Icon: Lightbulb, label: 'Idea' },
  warning: { Icon: AlertTriangle, label: 'Warning' },
  magic: { Icon: Sparkles, label: 'Highlight' },
} as const;

type Tone = keyof typeof CALLOUT_TONES;
const ORDER = Object.keys(CALLOUT_TONES) as Tone[];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (tone?: Tone) => ReturnType;
    };
  }
}

function CalloutView({ node, updateAttributes }: ReactNodeViewProps) {
  const tone = (node.attrs.tone as Tone) ?? 'info';
  const { Icon, label } = CALLOUT_TONES[tone];
  const next = ORDER[(ORDER.indexOf(tone) + 1) % ORDER.length];
  return (
    <NodeViewWrapper className={`callout callout--${tone}`} data-tone={tone}>
      <button
        type="button"
        className="callout__icon"
        contentEditable={false}
        aria-label={`${label} callout — click to change`}
        title="Change style"
        onClick={() => updateAttributes({ tone: next })}
      >
        <Icon width={18} height={18} />
      </button>
      <NodeViewContent className="callout__content" />
    </NodeViewWrapper>
  );
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,

  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-tone') ?? 'info',
        renderHTML: (attrs) => ({ 'data-tone': attrs.tone }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-callout': '' }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (tone = 'info') =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
    };
  },
});
