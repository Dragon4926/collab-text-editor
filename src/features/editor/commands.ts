import type { Editor, Range } from '@tiptap/react';
import { useWorkspace } from '@/store/workspace';
import { pickImages } from './extensions/media';
import {
  Code2,
  FileText,
  ImageIcon,
  Mic,
  PenLine,
  Info,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  type LucideIcon,
} from 'lucide-react';

/**
 * Block commands shown in the slash menu.
 *
 * Each command receives the editor and the `range` covering the typed
 * "/query" text. It deletes that range and then applies its transformation
 * in the same *chain*, so the whole thing is a single undo step.
 */
export interface BlockCommand {
  id: string;
  title: string;
  description: string;
  group: 'Basic blocks' | 'Media' | 'Ink & voice' | 'Advanced';
  icon: LucideIcon;
  keywords: string[];
  /** markdown-style shortcut, shown as a hint */
  hint?: string;
  run: (editor: Editor, range: Range) => void;
}

const base = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const BLOCK_COMMANDS: BlockCommand[] = [
  {
    id: 'text',
    title: 'Text',
    description: 'Plain paragraph',
    group: 'Basic blocks',
    icon: Pilcrow,
    keywords: ['paragraph', 'p', 'plain'],
    run: (e, r) => base(e, r).setParagraph().run(),
  },
  {
    id: 'h1',
    title: 'Heading 1',
    description: 'Big section heading',
    group: 'Basic blocks',
    icon: Heading1,
    keywords: ['title', 'h1', 'big'],
    hint: '#',
    run: (e, r) => base(e, r).setHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    title: 'Heading 2',
    description: 'Medium section heading',
    group: 'Basic blocks',
    icon: Heading2,
    keywords: ['subtitle', 'h2'],
    hint: '##',
    run: (e, r) => base(e, r).setHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    title: 'Heading 3',
    description: 'Small section heading',
    group: 'Basic blocks',
    icon: Heading3,
    keywords: ['h3', 'small'],
    hint: '###',
    run: (e, r) => base(e, r).setHeading({ level: 3 }).run(),
  },
  {
    id: 'todo',
    title: 'To-do list',
    description: 'Track tasks with checkboxes',
    group: 'Basic blocks',
    icon: ListChecks,
    keywords: ['task', 'checkbox', 'check', 'todo'],
    hint: '[]',
    run: (e, r) => base(e, r).toggleTaskList().run(),
  },
  {
    id: 'bullet',
    title: 'Bulleted list',
    description: 'A simple bulleted list',
    group: 'Basic blocks',
    icon: List,
    keywords: ['unordered', 'ul', 'bullet'],
    hint: '-',
    run: (e, r) => base(e, r).toggleBulletList().run(),
  },
  {
    id: 'numbered',
    title: 'Numbered list',
    description: 'A list with numbering',
    group: 'Basic blocks',
    icon: ListOrdered,
    keywords: ['ordered', 'ol', 'number'],
    hint: '1.',
    run: (e, r) => base(e, r).toggleOrderedList().run(),
  },
  {
    id: 'quote',
    title: 'Quote',
    description: 'Capture a quotation',
    group: 'Basic blocks',
    icon: Quote,
    keywords: ['blockquote', 'cite'],
    hint: '>',
    run: (e, r) => base(e, r).toggleBlockquote().run(),
  },
  {
    id: 'divider',
    title: 'Divider',
    description: 'Visually separate sections',
    group: 'Basic blocks',
    icon: Minus,
    keywords: ['hr', 'rule', 'separator', 'line'],
    hint: '---',
    run: (e, r) => base(e, r).setHorizontalRule().run(),
  },
  {
    id: 'callout',
    title: 'Callout',
    description: 'Make a note stand out',
    group: 'Basic blocks',
    icon: Info,
    keywords: ['note', 'info', 'warning', 'tip', 'aside'],
    run: (e, r) => base(e, r).setCallout('info').run(),
  },
  {
    id: 'sketch',
    title: 'Sketch',
    description: 'Handwrite or draw inline',
    group: 'Ink & voice',
    icon: PenLine,
    keywords: ['draw', 'ink', 'handwriting', 'pen', 'doodle', 'scribble'],
    run: (e, r) => base(e, r).insertSketch().run(),
  },
  {
    id: 'voice',
    title: 'Voice memo',
    description: 'Record audio into the note',
    group: 'Ink & voice',
    icon: Mic,
    keywords: ['audio', 'record', 'microphone', 'sound'],
    run: (e, r) => base(e, r).insertVoiceMemo().run(),
  },
  {
    id: 'image',
    title: 'Image',
    description: 'Upload a picture',
    group: 'Media',
    icon: ImageIcon,
    keywords: ['photo', 'picture', 'upload', 'img'],
    run: (e, r) => {
      base(e, r).run();
      pickImages(e.view);
    },
  },
  {
    id: 'page',
    title: 'Sub-page',
    description: 'Create a page inside this one',
    group: 'Media',
    icon: FileText,
    keywords: ['subpage', 'child', 'nested', 'link'],
    run: (e, r) => {
      const s = useWorkspace.getState();
      const id = s.createPage('doc', s.activeId);
      base(e, r).insertPageLink(id).run();
    },
  },
  {
    id: 'code',
    title: 'Code block',
    description: 'Monospaced code snippet',
    group: 'Advanced',
    icon: Code2,
    keywords: ['snippet', 'pre', 'program'],
    hint: '```',
    run: (e, r) => base(e, r).toggleCodeBlock().run(),
  },
];

/**
 * Rank commands for a query. Prefix matches on the title beat matches inside
 * the title, which beat keyword matches — a tiny but effective fuzzy search.
 */
export function filterCommands(commands: BlockCommand[], query: string) {
  const q = query.toLowerCase().trim();
  if (!q) return commands;
  const score = (c: BlockCommand) => {
    const t = c.title.toLowerCase();
    if (t.startsWith(q)) return 3;
    if (t.includes(q)) return 2;
    if (c.keywords.some((k) => k.startsWith(q))) return 1;
    return 0;
  };
  return commands
    .map((c) => [c, score(c)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
}
