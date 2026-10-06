import { Extension } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { create } from 'zustand';
import { BLOCK_COMMANDS, filterCommands, type BlockCommand } from '../commands';

/**
 * Slash commands, built on TipTap's Suggestion utility.
 *
 * Suggestion watches the document for a trigger character ("/") and reports
 * the text typed after it (the *query*) plus the document *range* covering
 * "/query". It doesn't render anything itself — it calls lifecycle hooks
 * (onStart / onUpdate / onKeyDown / onExit) and leaves the UI to us.
 *
 * Bridging pattern: the hooks write into a tiny zustand store, and a normal
 * React component (SlashMenu) renders from that store. This keeps the menu
 * inside React (animations, hooks, styling) instead of manually mounting a
 * second React root as many examples do.
 */

interface SlashState {
  open: boolean;
  rect: DOMRect | null;
  items: BlockCommand[];
  index: number;
  select: ((item: BlockCommand) => void) | null;
}

export const useSlash = create<SlashState>(() => ({
  open: false,
  rect: null,
  items: [],
  index: 0,
  select: null,
}));

function onKeyDown({ event }: SuggestionKeyDownProps) {
  const s = useSlash.getState();
  if (!s.open) return false;
  const n = s.items.length;
  if (event.key === 'ArrowDown') {
    useSlash.setState({ index: (s.index + 1) % Math.max(n, 1) });
    return true;
  }
  if (event.key === 'ArrowUp') {
    useSlash.setState({ index: (s.index - 1 + n) % Math.max(n, 1) });
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const item = s.items[s.index];
    if (item && s.select) s.select(item);
    return true;
  }
  if (event.key === 'Escape') {
    useSlash.setState({ open: false });
    return true;
  }
  return false;
}

export const slashKey = new PluginKey('slash');

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<BlockCommand, BlockCommand>({
        editor: this.editor,
        pluginKey: slashKey,
        char: '/',
        // only trigger at the start of a line or after a space
        allowedPrefixes: [' '],
        items: ({ query }) => filterCommands(BLOCK_COMMANDS, query),
        command: ({ editor, range, props }) => props.run(editor, range),
        // don't open inside code blocks
        allow: ({ state, range }) => !state.doc.resolve(range.from).parent.type.spec.code,
        render: () => ({
          onStart: (props) =>
            useSlash.setState({
              open: true,
              rect: props.clientRect?.() ?? null,
              items: props.items,
              index: 0,
              select: props.command,
            }),
          onUpdate: (props) =>
            useSlash.setState({
              rect: props.clientRect?.() ?? null,
              items: props.items,
              index: 0,
              select: props.command,
            }),
          onKeyDown,
          onExit: () => useSlash.setState({ open: false, select: null }),
        }),
      }),
    ];
  },
});
