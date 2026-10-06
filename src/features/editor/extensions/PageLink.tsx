import { mergeAttributes, Node, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import { ArrowUpRight } from 'lucide-react';
import { displayTitle, useWorkspace } from '@/store/workspace';
import { PageIcon } from '@/components/ui/PageIcon';

/**
 * A block that links to another page (Notion's "sub-page" block).
 *
 * The node stores only the target page id. The node view subscribes to that
 * page in the zustand store, so renaming or re-icon-ing the target updates
 * every link to it instantly — the document never holds a stale copy.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      insertPageLink: (pageId: string) => ReturnType;
    };
  }
}

function PageLinkView({ node, selected }: ReactNodeViewProps) {
  const id = node.attrs.pageId as string;
  const page = useWorkspace((s) => s.pages[id]);
  const setActive = useWorkspace((s) => s.setActive);
  return (
    <NodeViewWrapper className={`page-link ${selected ? 'is-selected' : ''} ${!page || page.trashed ? 'is-missing' : ''}`} contentEditable={false}>
      <button type="button" onClick={() => page && setActive(id)}>
        {page ? <PageIcon page={page} size={18} /> : null}
        <span className="page-link__title">{page ? displayTitle(page) : 'Deleted page'}</span>
        <ArrowUpRight width={14} height={14} className="page-link__arrow" />
      </button>
    </NodeViewWrapper>
  );
}

export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { pageId: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'div[data-page-link]', getAttrs: (el) => ({ pageId: (el as HTMLElement).getAttribute('data-page-id') }) }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-link': '', 'data-page-id': node.attrs.pageId })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },

  addCommands() {
    return {
      insertPageLink:
        (pageId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { pageId } }),
    };
  },
});
