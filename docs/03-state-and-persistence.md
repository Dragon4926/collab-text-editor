# 03 · State & persistence

## What you see

Nothing — and that's the point. You never press *Save*. Close the tab, come
back next week, and every page, stroke and sticky note is where you left it.

## Concepts

### A store outside React

`useWorkspace` (in `src/store/workspace.ts`) is a [zustand](https://zustand.docs.pmnd.rs)
store. Unlike React state, it lives outside the component tree, so:

* any component can read it without prop drilling or context providers;
* non-React code (keyboard handlers, the seed script, exporters) can call
  `useWorkspace.getState()` and `setState()` directly.

### Selectors: re-render only what changed

```ts
const title = useWorkspace((s) => s.pages[id].title);
```

A component subscribes with a **selector**. After every change zustand re-runs
the selector and compares the result with the previous one (`Object.is`). If
it's the same, the component doesn't re-render.

When a selector builds a new array or object each time, use `useShallow` so
the comparison checks the *contents*:

```ts
// src/components/sidebar/PageTree.tsx
const ids = useWorkspace(useShallow((s) => childrenOf(s.pages, parentId).map((p) => p.id)));
```

Typing in a document changes that page's `doc` and `updatedAt`, but the list
of child ids is unchanged — so the tree doesn't re-render. Only the row whose
*title* changed does, because each row selects just `{ title, kind, icon… }`.

### Immutable updates with immer

React (and zustand's comparisons) rely on **immutability**: a changed object
must be a *new* object. Writing that by hand gets noisy:

```ts
set((s) => ({ pages: { ...s.pages, [id]: { ...s.pages[id], title } } }));
```

The `immer` middleware lets us write the obvious mutation instead:

```ts
set((s) => { s.pages[id].title = title; });
```

Immer hands us a *draft* proxy, records what we change, and produces a new
state where changed branches are copied and unchanged branches are **shared**
with the old state (structural sharing). That sharing is what makes cheap
undo history possible (chapter 05).

### Persistence: IndexedDB, structured objects, debounced

The `persist` middleware hands the state to a storage after each change and
restores it on startup. We give it our own storage, `src/store/idbStorage.ts`:

* **IndexedDB, not localStorage.** localStorage is synchronous (blocks the
  main thread) and capped at ~5 MB. IndexedDB is asynchronous and can store
  hundreds of MB.
* **Objects, not JSON.** zustand's ready-made `createJSONStorage` calls
  `JSON.stringify` on the whole state on *every* change — before any
  debouncing can help. Dragging a card fires ~60 changes a second; with images
  in the workspace that serialisation alone causes stutter. IndexedDB stores
  objects natively using the *structured clone* algorithm, so our storage
  simply remembers the latest value object (free) and lets IndexedDB clone it
  once, when it actually writes.
* **Debounced writes.** That write happens only after changes have been quiet
  for 400 ms:

  ```
  changes:  x x x x x          x x
  writes:              ▲(400ms)      ▲
  ```

* **Flush on hide.** When the tab becomes hidden (`visibilitychange`) a
  pending write is flushed immediately, because the page may be closed next.
* **`partialize`** excludes transient UI state (is the palette open?) from
  what's saved.

### Migrations

Saved data outlives the code that wrote it. The persist options carry a
`version` and a `migrate(persisted, oldVersion)` function. Version 2, for
example, rewrote the seeded "Keyboard shortcuts" page when Lumen switched
from Mac (⌘) to Windows (Ctrl) notation — users who already had the old page
get the new one, while their own pages are untouched. The storage also still
accepts the JSON strings written by version 1.

### Hydration

IndexedDB is async, so on startup the store briefly holds its *default*
(empty) state. `src/hooks/useHydrated.ts` delays rendering until
`persist.onFinishHydration` fires. Without it you'd see an empty workspace
flash — and the first-run seed could run against data that simply hadn't
loaded yet.

### Binary data in a separate store

Voice memos are Blobs of audio. Putting them inside the workspace JSON would
mean re-serialising megabytes on every keystroke. Instead `src/lib/blobs.ts`
keeps them in their own IndexedDB object store (which stores `Blob`s natively,
no base64), and the document only keeps the blob's id.

Images, by contrast, are downscaled first (`src/lib/image.ts`: draw onto a
canvas at ≤1600 px, re-encode as WebP) and stored inline as data URLs — small
enough not to matter, and it keeps backups self-contained.

### First-run seed

`src/store/seed.ts` creates the welcome tour once (`seeded` flag). Its demo
ink is *generated* from parametric curves — a wave is `y = sin(x)`, a spiral is
`r = a + bθ` — instead of shipping recorded stroke data.

## In the code

| File | Role |
|---|---|
| `src/store/types.ts` | the data model |
| `src/store/workspace.ts` | store, actions, selectors (`childrenOf`, `ancestry`, `displayTitle`) |
| `src/store/idbStorage.ts` | debounced IndexedDB adapter |
| `src/hooks/useHydrated.ts` | wait for rehydration |
| `src/lib/blobs.ts` | audio blob store |
| `src/store/seed.ts` | first-run content |

## Try it

1. Open devtools → Application → IndexedDB → `keyval-store` and watch the
   `lumen-workspace` entry update ~400 ms after you stop typing. Notice it's
   an object you can expand, not a string.
2. Swap `storage: idbStorage()` for `createJSONStorage(() => …)` and drag a
   card around with the Performance panel recording. Find `JSON.stringify`.
3. Add a `tags: string[]` field to `Page` and a "Tags" section in the sidebar.
   Bump the persist `version` and write a `migrate` function that adds
   `tags: []` to old pages.
