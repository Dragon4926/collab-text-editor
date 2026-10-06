import type { Extensions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import Typography from '@tiptap/extension-typography';

/**
 * The editor's schema is the sum of its extensions. Each extension
 * contributes node or mark types, input rules (markdown shortcuts such as
 * `## ` → heading), keyboard shortcuts and plugins.
 */
export function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      dropcursor: { color: 'var(--c-accent)', width: 2 },
    }),
    Placeholder.configure({
      // Different hints for different block types make the empty state teach.
      placeholder: ({ node }) => {
        if (node.type.name === 'heading') return `Heading ${node.attrs.level}`;
        return "Write something, or press '/' for commands…";
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    // smart quotes, em-dashes, arrows (->), ellipses…
    Typography,
  ];
}
