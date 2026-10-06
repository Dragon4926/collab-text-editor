/**
 * ProseMirror JSON → Markdown.
 *
 * A serializer is a recursive walk over the document tree: block nodes map
 * to Markdown block syntax (headings, lists, quotes…), and text nodes are
 * wrapped in the syntax of their marks (**bold**, _italic_…). Nested lists
 * are handled by passing an indentation prefix down the recursion.
 */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: PMNode[];
}

type Resolve = (pageId: string) => string | undefined;

function inline(nodes: PMNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text' || !n.text) return '';
      let t = n.text;
      const marks = n.marks ?? [];
      // code is innermost and suppresses other syntax inside it
      if (marks.some((m) => m.type === 'code')) return '`' + t + '`';
      for (const m of marks) {
        if (m.type === 'bold') t = `**${t}**`;
        else if (m.type === 'italic') t = `_${t}_`;
        else if (m.type === 'strike') t = `~~${t}~~`;
        else if (m.type === 'highlight') t = `==${t}==`;
        else if (m.type === 'underline') t = `<u>${t}</u>`;
        else if (m.type === 'link') t = `[${t}](${String(m.attrs?.href ?? '')})`;
      }
      return t;
    })
    .join('');
}

function block(node: PMNode, resolve: Resolve, indent = ''): string {
  const kids = node.content ?? [];
  switch (node.type) {
    case 'paragraph':
      return indent + inline(kids);
    case 'heading':
      return '#'.repeat(Number(node.attrs?.level ?? 1)) + ' ' + inline(kids);
    case 'blockquote':
      return kids.map((k) => block(k, resolve)).join('\n\n').replace(/^/gm, '> ');
    case 'callout':
      return `> [!${String(node.attrs?.tone ?? 'note').toUpperCase()}]\n` + kids.map((k) => block(k, resolve)).join('\n').replace(/^/gm, '> ');
    case 'codeBlock':
      return '```' + (node.attrs?.language ?? '') + '\n' + kids.map((k) => k.text ?? '').join('') + '\n```';
    case 'horizontalRule':
      return '---';
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return kids
        .map((item, i) => {
          const marker = node.type === 'orderedList' ? `${i + 1}. ` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : '- ';
          const [first, ...rest] = item.content ?? [];
          const head = indent + marker + (first ? inline(first.content) : '');
          const tail = rest.map((r) => block(r, resolve, indent + '  ')).join('\n');
          return tail ? head + '\n' + tail : head;
        })
        .join('\n');
    case 'image':
      return `![](${String(node.attrs?.src ?? '')})`;
    case 'pageLink':
      return `📄 ${resolve(String(node.attrs?.pageId)) ?? 'Untitled'}`;
    case 'sketch':
      return '_[sketch]_';
    case 'voiceMemo':
      return `_[voice memo, ${Math.round(Number(node.attrs?.duration ?? 0))} s]_`;
    default:
      return kids.map((k) => block(k, resolve, indent)).join('\n\n');
  }
}

export function toMarkdown(title: string, doc: unknown, resolve: Resolve): string {
  const root = (doc ?? { type: 'doc', content: [] }) as PMNode;
  const body = (root.content ?? []).map((n) => block(n, resolve)).join('\n\n');
  return `# ${title}\n\n${body}\n`;
}
