# The Lumen learning guide

This folder explains **what** was built, **how** it works and **why** it was
built that way. Every chapter follows the same shape:

1. **What you see** — the feature from a user's point of view.
2. **Concepts** — the ideas you need (with small diagrams and formulas).
3. **In the code** — a walk through the files that implement it, with
   pointers like `src/features/ink/geometry.ts`.
4. **Try it** — small exercises to cement the idea by changing the code.

Read them in order for a full course, or jump to the topic you need.

| # | Chapter | You'll learn |
|---|---|---|
| 01 | [Architecture](01-architecture.md) | how the app is layered, folder conventions, data flow |
| 02 | [Design system](02-design-system.md) | design tokens, glass, layered shadows, type, dark mode |
| 03 | [State & persistence](03-state-and-persistence.md) | zustand selectors, immer, IndexedDB, debouncing, hydration |
| 04 | [The block editor](04-rich-text-editor.md) | ProseMirror's model, TipTap extensions, slash menus, node views |
| 05 | [The ink engine](05-ink-engine.md) | pointer events, pressure, perfect-freehand, Bézier smoothing, hit testing, shape recognition |
| 06 | [Notebooks](06-notebook.md) | SVG patterns for paper, multi-sheet undo |
| 07 | [Infinite canvases](07-infinite-canvas.md) | camera math, zoom-at-cursor, wheel & pinch, springs |
| 08 | [The spatial space](08-spatial-space.md) | controller/view split, gestures, frames, connectors, minimap |
| 09 | [The whiteboard](09-whiteboard.md) | discriminated unions, event delegation, pointer-capture pitfalls |
| 10 | [Motion & polish](10-motion.md) | springs, layout animations, shared `layoutId`, presence |
| 11 | [Commands & shortcuts](11-commands-and-shortcuts.md) | the ⌘K palette, fuzzy search, platform modifiers |
| 12 | [Export & backup](12-export.md) | Markdown serialisation, SVG/PNG rendering, JSON backups |
| 13 | [Performance](13-performance.md) | code splitting, memoisation, structural sharing |
| 14 | [Git workflow](14-git-workflow.md) | how the history was written, commit conventions |

## Prerequisites

Comfort with JavaScript and the basics of React (components, props, state,
hooks). Everything else — TypeScript patterns, SVG, the Pointer Events API,
a little trigonometry — is introduced where it's used.

## Running the code while you read

```bash
npm install
npm run dev
```

Open the browser devtools next to the app. Most chapters suggest something
to inspect (an IndexedDB entry, an SVG path, a CSS variable) so you can see
the concept live.
