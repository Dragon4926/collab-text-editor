import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useWorkspace } from '@/store/workspace';
import type { ID } from '@/store/types';
import { createExtensions } from './extensions';
import { SlashMenu } from './SlashMenu';
import './editor.css';

interface Props {
  pageId: ID;
  /** called once the editor exists, so the page header can focus it */
  onReady?: (editor: Editor) => void;
}

/**
 * The rich-text block editor.
 *
 * TipTap is a React-friendly layer over ProseMirror. ProseMirror keeps the
 * document as an immutable tree of typed *nodes* (paragraph, heading,
 * taskItem…) carrying *marks* (bold, link…). Every edit is a *transaction*
 * that produces a new document — a model that maps neatly onto our store.
 *
 * Data flow:
 *   store.pages[id].doc  ──(initial content)──▶  editor
 *   editor.onUpdate      ──(getJSON())──────────▶  store.pages[id].doc
 *
 * We read the stored document only once, on mount. After that the editor is
 * the source of truth while it's open; pushing store changes back into it on
 * every keystroke would reset the cursor.
 */
export function DocEditor({ pageId, onReady }: Props) {
  const mutatePage = useWorkspace((s) => s.mutatePage);

  const editor = useEditor(
    {
      extensions: createExtensions(),
      content: (useWorkspace.getState().pages[pageId]?.doc as object | undefined) ?? '',
      editorProps: {
        attributes: { class: 'prose', spellcheck: 'true' },
      },
      onUpdate: ({ editor }) => {
        mutatePage(pageId, (p) => {
          p.doc = editor.getJSON();
        });
      },
      // Render synchronously on mount, avoiding a hydration mismatch warning.
      immediatelyRender: true,
    },
    [pageId],
  );

  useEffect(() => {
    if (editor && onReady) onReady(editor);
  }, [editor, onReady]);

  return (
    <>
      <EditorContent editor={editor} className="doc-editor" />
      <SlashMenu />
    </>
  );
}
