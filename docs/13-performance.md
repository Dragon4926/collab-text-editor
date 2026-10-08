# 13 · Performance

Smoothness is a feature. These are the techniques that keep Lumen at 60 fps
while you type, draw and pan.

## Load less: code splitting

`src/features/page/PageView.tsx` loads each surface with a dynamic import:

```ts
doc: () => import('@/features/doc/DocPage').then((m) => m.DocPage),
```

Loaded surfaces are cached in a plain object, so after the first load a
surface renders synchronously. `React.lazy` would suspend for a tick on its
first render even when the code is already there, and the page transition
would capture the spinner.

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
* The aurora is static gradients painted inside the opaque sidebar — no
  full-window layer, no `backdrop-filter`. A translucent blur over an
  animated backdrop has to be recomposited every frame; on Windows GPUs it
  flickered, and when the layer was dropped the sidebar went black
  (chapter 10).
* Blur transitions end by removing `filter` entirely, so finished elements
  drop their extra compositing layer.
* `will-change: transform` hints the browser to keep those layers on the GPU.

## Gesture less: preview locally, commit once

* **Eraser and lasso-move** keep the working strokes in local state, repaint
  at most once per animation frame, and write to the store *once* on
  pointer-up. Before, every hit was a store update — and in a document's
  sketch block a whole ProseMirror transaction — several times per
  pointermove.
* **Bounding boxes first.** Each stroke's bounds are cached in a `WeakMap`
  keyed by the (immutable) stroke, so the eraser rejects almost every stroke
  with four comparisons before any per-segment maths.
* **Cursors outside React.** The eraser circle is moved by setting its
  `cx`/`cy` attributes directly; hovering re-renders nothing.
* **Canvas drags** write card positions once per frame (`requestAnimationFrame`),
  not once per pointer event, and only cards created while a space is open
  play the entrance animation — opening a big space no longer blurs and
  scales every card at once.

## Store less: images and blobs

* Imported images are downscaled to ≤1600 px WebP before storage.
* Audio is stored as native Blobs in a separate IndexedDB store, out of the
  workspace object that gets cloned on every save.

## Draw less: PDF pages

A scanned book is hundreds of full-page images. `PdfPageView`
(`src/features/pdf/`) keeps that affordable:

* **Only near pages exist.** An `IntersectionObserver` draws a page as it
  comes within ~1200 px of the view and frees its canvas once it leaves.
  Without that, scrolling a 300-page book at 2× resolution would hold
  gigabytes of canvases until the browser gave up and drew blank pages.
* **A render queue.** At most two pages draw at once, and the reading
  column (priority 0) goes ahead of thumbnails (priority 1), so a fast scroll
  doesn't starve the page you stopped on.
* **Off-screen, then swap.** Each render draws into a new canvas and replaces
  the old one when it's finished. Turning a page or zooming never flashes
  white, and two renders never fight over one canvas.
* **Resolution in steps.** On the spatial canvas, a PDF card redraws at 2×
  detail only when the camera zoom crosses a threshold, never on every
  zoom frame.

## Load less from elsewhere: bundled fonts

Inter and JetBrains Mono ship with the app (`@fontsource/*`)
instead of coming from a font CDN: no render-blocking third-party stylesheet,
no extra DNS + TLS handshakes, and they work offline. Each font is split by
Unicode range, so only the Latin files download for English text.

## Measure, don't guess

1. Chrome DevTools → **Performance** → record while drawing a long stroke.
   Look for long tasks; `strokePath` should be the only notable cost.
2. React DevTools → **Profiler** → record typing in a document; check which
   components rendered and why.
3. `npm run build` prints chunk sizes — watch them as you add dependencies.
