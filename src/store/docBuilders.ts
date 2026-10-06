/* tiny ProseMirror JSON builders */
export function p(text: string) {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}
export function h(level: number, text: string) {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}
export function bullets(items: string[]) {
  return { type: 'bulletList', content: items.map((t) => ({ type: 'listItem', content: [p(t)] })) };
}
export function task(text: string, checked: boolean) {
  return { type: 'taskItem', attrs: { checked }, content: [p(text)] };
}

/**
 * The keyboard reference page. Exported so the store migration can refresh
 * copies created by earlier versions, which used Mac (⌘) notation.
 */
export function shortcutsDoc() {
  return {
    type: 'doc',
    content: [
      p('Lumen follows Windows keyboard conventions. On a Mac, ⌘ works wherever Ctrl is listed.'),
      h(2, 'Everywhere'),
      bullets([
        'Ctrl+K or Ctrl+P — command palette: search pages and run actions',
        'Alt+N — new document',
        'F2 — rename the current page',
        'Ctrl+\\ — show or hide the sidebar',
        'Ctrl+Shift+L — switch light / dark',
        'Delete — move the focused sidebar page to the trash',
      ]),
      h(2, 'Documents'),
      bullets([
        '/ — insert any block',
        'Ctrl+B / Ctrl+I / Ctrl+U — bold, italic, underline',
        '# ## ### — headings (Markdown shortcuts work everywhere)',
        '[] — to-do, - bullet, 1. numbered, > quote, ``` code',
        'Ctrl+Z / Ctrl+Y — undo / redo',
      ]),
      h(2, 'Canvases'),
      bullets([
        'Space + drag, middle-drag or scroll — pan',
        'Ctrl + scroll or pinch — zoom at the cursor',
        'Ctrl+0 — 100%, Ctrl+1 — zoom to fit, Ctrl+Plus / Ctrl+Minus — zoom',
        'Ctrl+A select all · Ctrl+D duplicate · Delete remove',
        'V select · H hand · N note · T text · F frame · S sketch',
        'Whiteboard: P pen · E eraser · R O D shapes · A arrow · T text',
      ]),
      h(2, 'Ink'),
      bullets([
        'Draw and hold still — snap to a perfect line, rectangle or ellipse',
        'Lasso — circle strokes to move, recolour or duplicate them',
        'Click the active pen again — size and colour',
        'Ctrl+Z / Ctrl+Y — undo / redo',
      ]),
    ],
  };
}
