# 11 · Commands & shortcuts

## What you see

Press **Ctrl+K** (or Ctrl+P) anywhere: the app behind softly blurs, a glass
panel comes into focus, you type a few letters, and it finds pages by title
*or* by words inside them (with a snippet), plus actions
like "New whiteboard", "Switch to dark appearance" or "Export workspace
backup". Arrow keys move a sliding highlight; Enter runs it.

![Command palette](images/command-palette-dark.png)

## Concepts

### A search index built on open

When the palette opens, it builds a list of `{ page, title, text }` where
`text` is the document's plain text from `docToText()` (`src/lib/text.ts`), a
recursive walk that concatenates every text leaf of the ProseMirror JSON.
`useMemo` keeps that index until the pages change.

### Fuzzy matching

`fuzzyScore(text, query)` asks: do the query's characters appear **in order**?
Then it rewards the matches people mean:

* +3 for a match at the **start of a word** (`wb` → **W**hite**b**oard),
* +2 per character of a **consecutive** run,
* a big bonus for a plain substring, bigger for a prefix.

Body-text matches score lower than title matches and show a snippet around
the hit. Whichever section — pages or actions — holds the best-scoring match
is listed first, so "new doc" runs *New document* instead of opening a page
that happens to contain those words.

### A fresh palette every time

The palette animates out with `AnimatePresence`. If you reopen it while that
exit animation is still running, framer-motion sees a child with the *same
key* reappear and revives the closing instance — old query and all. Giving
each opening its own key (a counter bumped whenever `paletteOpen` turns on)
guarantees a clean slate.

### Keyboard-first lists

The input keeps focus the whole time; ↑/↓ change an index in state and the
highlighted row is scrolled into view with `scrollIntoView({ block: 'nearest' })`.
The moving highlight is a shared-`layoutId` element (chapter 10).

### Global shortcuts

`src/hooks/useGlobalShortcuts.ts` registers **one** `keydown` listener on
`window`. It reads the store with `getState()` inside the handler instead of
subscribing, so it never needs to be re-registered.

Surface-specific shortcuts (tools on canvases, Ctrl+Z) are registered by
each surface and **ignore keys typed into fields**, through one shared guard
in `src/lib/keys.ts`:

```ts
export const isTyping = (target) => !!target?.closest?.('input, textarea, select, [contenteditable="true"]');
```

### Windows keyboard conventions

Lumen speaks the Windows/Linux keyboard dialect everywhere
(`src/lib/keys.ts`):

| Convention | Lumen |
|---|---|
| Ctrl is the command key | `isMod(e)` is `e.ctrlKey` (⌘ is also accepted on Apple keyboards) |
| Redo is **Ctrl+Y** | `isRedo(e)` accepts Ctrl+Y and Ctrl+Shift+Z on every canvas and ink surface |
| **F2** renames | renames the current page; documents select their title, canvases open the breadcrumb editor |
| **Delete** removes | on a focused sidebar row it moves the page to the trash; on canvases it deletes the selection |
| Shortcuts are written `Ctrl+Shift+Z` | `shortcut('Mod+Shift+Z')` → `"Ctrl+Shift+Z"`, `withShortcut('Undo', 'Mod+Z')` → `"Undo (Ctrl+Z)"` |

`<Kbd keys="Mod+K" />` renders the shortcut as small Windows-style key caps:
`[Ctrl] [K]`.

F2 is delivered as a window event (`RENAME_EVENT`) rather than through the
store: it's a momentary command, not state, and whichever component owns the
title (the document header or the breadcrumb) handles it.

Some shortcuts belong to the browser and can't be overridden — Ctrl+N opens a
new window — so Alt+N creates a document instead.

## Try it

1. Add a `>` prefix mode that shows only actions (like VS Code).
2. Add recent-search memory: show the last five opened pages when the query is
   empty (hint: store ids in the workspace store).
3. Add a `?` shortcut that opens a sheet listing every shortcut.
