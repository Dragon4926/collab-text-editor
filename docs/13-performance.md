# 13 · Performance

Smoothness is a feature. These are the techniques that keep Lumen at 60 fps
while you type, draw and pan.

## Load less: code splitting

`src/features/page/PageView.tsx` loads each surface with `React.lazy`:

```ts
const DocPage = lazy(() => import('@/features/doc/DocPage').then((m) => ({ default: m.DocPage })));
```

Vite turns every dynamic `import()` into a separate file. The editor (TipTap,
ProseMirror and syntax highlighting — the heaviest dependencies) downloads
only when you open a document; canvas code only when you open a canvas.

| | before | after |
|---|---|---|
| entry chunk | ~1.2 MB | ~270 kB |

`Suspense` shows a spinner while a chunk loads — but only after 250 ms
(CSS `animation-delay`), so fast loads show nothing at all. Once the app is
idle, `preloadSurfaces()` fetches the remaining chunks in the background
(`requestIdleCallback`), so the first visit to a canvas doesn't wait on the
network in the middle of a page transition.

## Render less: selectors and memo

* **zustand selectors** (chapter 03) re-render a component only when *its*
  slice changes. The page tree selects ids with `useShallow`; each row
  selects just the fields it shows.
* **`memo` + stable props.** Space cards are memoised and receive handlers
  created once (they read fresh state from a ref). Dragging one card doesn't
  re-render the others.
* **`useMemo` per stroke.** Turning points into an SVG path is the most
  expensive step in ink. `StrokePath` memoises it per stroke object — drawing
  stroke #500 doesn't recompute strokes #1–499.
* **TipTap's `useEditorState`** re-renders the toolbar only when the
  *selected* editor state changes.
* **Label-only subscriptions.** A document's `doc` changes on every
  keystroke, so the titlebar breadcrumbs, favourites, trash and page header
  select only what they display (`usePageLabel(id)` returns title, kind and
  icon with shallow comparison). Typing re-renders the editor, not the
  window chrome.

## Write less: debounced persistence without JSON

The store changes on every keystroke and every pointer move. Our IndexedDB
storage keeps the latest state *object* (no `JSON.stringify` per change —
zustand's default JSON storage did that 60 times a second while dragging) and
writes at most once per 400 ms of quiet, letting IndexedDB's structured clone
do the copying (chapter 03). The canvas camera
persists only after it settles. Gesture history records one snapshot per
gesture, not per move.

## Copy less: structural sharing

Immer produces new objects only along the path that changed; everything else
is shared with the previous state. That's why:

* React's reference checks (`Object.is`) are cheap and accurate,
* undo history can keep 100 snapshots as plain references.

## Paint less: compositor-friendly motion

* Canvases move a single world layer with `transform` — the browser's
  compositor does the work, nothing re-lays out.
* The dot grid is a CSS background (no elements).
* The aurora animates only `transform` on blurred layers that never repaint.
* Blur transitions end by removing `filter` entirely, so finished elements
  drop their extra compositing layer.
* `will-change: transform` hints the browser to keep those layers on the GPU.

## Store less: images and blobs

* Imported images are downscaled to ≤1600 px WebP before storage.
* Audio is stored as native Blobs in a separate IndexedDB store, out of the
  workspace object that gets cloned on every save.

## Measure, don't guess

1. Chrome DevTools → **Performance** → record while drawing a long stroke.
   Look for long tasks; `strokePath` should be the only notable cost.
2. React DevTools → **Profiler** → record typing in a document; check which
   components rendered and why.
3. `npm run build` prints chunk sizes — watch them as you add dependencies.
