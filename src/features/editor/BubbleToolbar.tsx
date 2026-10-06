import { withShortcut } from '@/lib/keys';
import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import { AnimatePresence, motion } from 'framer-motion';
import { Bold, ChevronDown, Code, Highlighter, Italic, Link2, Strikethrough, Underline } from 'lucide-react';
import { spring } from '@/lib/motion';

/** Highlight colours, matching the pen palette at low opacity. */
export const HIGHLIGHTS = [
  { name: 'Yellow', color: 'rgba(255, 197, 61, 0.45)' },
  { name: 'Green', color: 'rgba(48, 164, 108, 0.3)' },
  { name: 'Blue', color: 'rgba(0, 144, 255, 0.25)' },
  { name: 'Pink', color: 'rgba(214, 64, 159, 0.25)' },
  { name: 'Purple', color: 'rgba(142, 78, 198, 0.28)' },
];

const BLOCK_TYPES = [
  { label: 'Text', run: (e: Editor) => e.chain().focus().setParagraph().run(), is: (e: Editor) => e.isActive('paragraph') },
  { label: 'Heading 1', run: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run(), is: (e: Editor) => e.isActive('heading', { level: 1 }) },
  { label: 'Heading 2', run: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run(), is: (e: Editor) => e.isActive('heading', { level: 2 }) },
  { label: 'Heading 3', run: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run(), is: (e: Editor) => e.isActive('heading', { level: 3 }) },
  { label: 'To-do', run: (e: Editor) => e.chain().focus().toggleTaskList().run(), is: (e: Editor) => e.isActive('taskList') },
  { label: 'Bullets', run: (e: Editor) => e.chain().focus().toggleBulletList().run(), is: (e: Editor) => e.isActive('bulletList') },
  { label: 'Quote', run: (e: Editor) => e.chain().focus().toggleBlockquote().run(), is: (e: Editor) => e.isActive('blockquote') },
];

/**
 * The floating formatting toolbar that appears over a text selection.
 *
 * TipTap v3 no longer re-renders React on every transaction (that was a big
 * performance cost). Instead `useEditorState` runs a *selector* after each
 * transaction and re-renders only when the selected values change — the same
 * idea as our zustand selectors.
 */
export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [panel, setPanel] = useState<'none' | 'link' | 'highlight' | 'turn'>('none');
  const [href, setHref] = useState('');

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
      linkHref: (e.getAttributes('link').href as string | undefined) ?? '',
      block: BLOCK_TYPES.find((b) => b.is(e))?.label ?? 'Text',
    }),
  });

  const mark = (active: boolean, label: string, Icon: typeof Bold, run: () => void, keys?: string) => (
    <button
      type="button"
      className={`bubble__btn ${active ? 'is-active' : ''}`}
      aria-label={label}
      title={keys ? withShortcut(label, keys) : label}
      aria-pressed={active}
      onClick={run}
    >
      <Icon width={15} height={15} strokeWidth={2.2} />
    </button>
  );

  const applyLink = () => {
    const url = href.trim();
    if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: /^[a-z]+:/i.test(url) ? url : `https://${url}` }).run();
    setPanel('none');
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 10 }}
      // only for text selections — not when a whole block (sketch, image…) is selected
      shouldShow={({ editor: e, from, to, state }) => from !== to && !(state.selection instanceof NodeSelection) && !e.isActive('codeBlock') && e.isEditable}
      className="bubble"
      onMouseDown={(e) => {
        // keep the selection alive unless the user clicks into the link input
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      <div className="bubble__bar">
        <button type="button" className="bubble__turn" onClick={() => setPanel(panel === 'turn' ? 'none' : 'turn')}>
          {state.block}
          <ChevronDown width={12} height={12} />
        </button>
        <span className="bubble__sep" />
        {mark(state.bold, 'Bold', Bold, () => editor.chain().focus().toggleBold().run(), 'Mod+B')}
        {mark(state.italic, 'Italic', Italic, () => editor.chain().focus().toggleItalic().run(), 'Mod+I')}
        {mark(state.underline, 'Underline', Underline, () => editor.chain().focus().toggleUnderline().run(), 'Mod+U')}
        {mark(state.strike, 'Strikethrough', Strikethrough, () => editor.chain().focus().toggleStrike().run())}
        {mark(state.code, 'Inline code', Code, () => editor.chain().focus().toggleCode().run(), 'Mod+E')}
        <span className="bubble__sep" />
        {mark(state.highlight, 'Highlight', Highlighter, () => setPanel(panel === 'highlight' ? 'none' : 'highlight'))}
        {mark(state.link, 'Link', Link2, () => {
          setHref(state.linkHref);
          setPanel(panel === 'link' ? 'none' : 'link');
        })}
      </div>

      <AnimatePresence>
        {panel !== 'none' && (
          <motion.div className="bubble__panel" initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 4 }} transition={spring.snappy}>
            {panel === 'link' && (
              <form
                className="bubble__link"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyLink();
                }}
              >
                <input autoFocus value={href} onChange={(e) => setHref(e.target.value)} placeholder="Paste or type a link…" aria-label="Link URL" onKeyDown={(e) => e.key === 'Escape' && setPanel('none')} />
                <button type="submit">{href ? 'Apply' : 'Remove'}</button>
              </form>
            )}
            {panel === 'highlight' && (
              <div className="bubble__swatches">
                {HIGHLIGHTS.map((h) => (
                  <button
                    key={h.name}
                    type="button"
                    aria-label={`${h.name} highlight`}
                    title={h.name}
                    style={{ background: h.color }}
                    onClick={() => {
                      editor.chain().focus().setHighlight({ color: h.color }).run();
                      setPanel('none');
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="bubble__swatch-none"
                  aria-label="Remove highlight"
                  onClick={() => {
                    editor.chain().focus().unsetHighlight().run();
                    setPanel('none');
                  }}
                >
                  ⌀
                </button>
              </div>
            )}
            {panel === 'turn' && (
              <div className="bubble__turn-list">
                {BLOCK_TYPES.map((b) => (
                  <button
                    key={b.label}
                    type="button"
                    className={state.block === b.label ? 'is-active' : ''}
                    onClick={() => {
                      b.run(editor);
                      setPanel('none');
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </BubbleMenu>
  );
}
