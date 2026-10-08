# 01 · Architecture

## What you see

One window: a glass **sidebar** on the left listing your pages, a **titlebar**
with breadcrumbs, and a **surface** that changes with the kind of page —
document, spatial space, whiteboard or notebook.

## Concepts

### Everything is a page

The whole app rests on one idea from `src/store/types.ts`:

```ts
interface Page {
  id; kind: 'doc' | 'space' | 'board' | 'notebook';
  title; icon; cover; parentId; order; favorite; trashed;
  doc?; space?; board?; notebook?;   // content, depending on kind
}
```

Because every kind shares the same metadata, generic features — the page
tree, favourites, trash, search, breadcrumbs, duplication, backups — are
written **once** and work for all four surfaces. Only the content field
differs, and only the matching surface reads it.

### Layers

```
┌───────────────────────────────────────────────────────────┐
│ components/shell   window chrome (sidebar frame,          │
│                    titlebar, traffic lights)               │
├───────────────────────────────────────────────────────────┤
│ features/*         one folder per feature: home, page,     │
│                    doc+editor, ink, notebook, canvas,      │
│                    space, board, command                   │
├───────────────────────────────────────────────────────────┤
│ components/ui      primitives with no app knowledge        │
│ hooks              reusable React hooks                    │
├───────────────────────────────────────────────────────────┤
│ store              data model + zustand store + IndexedDB  │
│ lib                pure helpers (no React)                 │
└───────────────────────────────────────────────────────────┘
```

Dependencies point **downwards**: features may use ui, hooks, store and lib;
lib never imports React components. Keeping `lib/` free of React means the
camera math or the Markdown serializer can be read, reused and reasoned
about in isolation.

### Feature folders

Code is grouped by *feature* (`features/space/…`) rather than by *type*
(`components/`, `reducers/`, `styles/`). Everything you need to understand the
spatial canvas — its model, views, CSS — sits in one folder. Shared pieces
graduate to a common folder only when a second feature needs them (that's how
`features/ink` and `features/canvas` came to be: the notebook, whiteboard,
sketch blocks and space all draw ink; the space and whiteboard share a camera).

### Data flow

```
          user input
              │
              ▼
   surface component (controller)        e.g. SpacePage, BoardPage
              │  calls an action
              ▼
   zustand store  ── immer draft ──▶ new immutable state
              │                              │
              │ selectors                    │ persist middleware
              ▼                              ▼
   components re-render              IndexedDB (debounced)
```

* State lives in **one store** (`useWorkspace`).
* Components **select** the slice they need and re-render only when it changes.
* Actions mutate an **immer draft**; immer produces the next immutable state.
* The **persist** middleware writes to IndexedDB (debounced), and reads it back
  on startup.

Transient, per-screen state (the current tool, the selection, an in-progress
stroke) stays in component state — it doesn't need to survive a reload.

### The surface router

`src/features/page/PageView.tsx` picks a surface by `kind`, wrapped in
`AnimatePresence` for page transitions and `Suspense` for lazy loading:

```tsx
switch (kind) {
  case 'doc': return <DocPage pageId={id} />;
  case 'space': return <SpacePage pageId={id} />;
  ...
}
```

## In the code

| File | Role |
|---|---|
| `src/main.tsx` | mounts React and imports global CSS |
| `src/App.tsx` | waits for hydration, applies theme, registers shortcuts, seeds first-run content |
| `src/components/shell/AppShell.tsx` | window layout and the animated sidebar |
| `src/features/page/PageView.tsx` | picks and lazy-loads the surface |
| `src/store/workspace.ts` | the store and its actions |

## Try it

1. Add a fifth page kind, `'gallery'`, that renders a grid of images. Follow
   the compiler: TypeScript will point to every `switch (kind)` that needs a
   new case — that's the payoff of a union type.
2. Open React DevTools' *Highlight updates* and type in a document. Notice
   that the sidebar tree barely re-renders (see chapter 03 for why).
