import { useCallback, useRef } from 'react';
import type { Editor } from '@tiptap/react';
import type { ID } from '@/store/types';
import { PageHeader } from '@/features/page/PageHeader';
import { DocEditor } from '@/features/editor/DocEditor';
import './DocPage.css';

/** A document page: header + rich text body in a centred reading column. */
export function DocPage({ pageId }: { pageId: ID }) {
  const editorRef = useRef<Editor | null>(null);
  const onReady = useCallback((e: Editor) => (editorRef.current = e), []);

  return (
    <div className="doc-page">
      <PageHeader pageId={pageId} onExitDown={() => editorRef.current?.commands.focus('start')} />
      <div className="doc-page__body">
        <DocEditor pageId={pageId} onReady={onReady} />
      </div>
    </div>
  );
}
