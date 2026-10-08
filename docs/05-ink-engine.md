# 05 · The ink engine

## What you see

Five pens — fountain, ballpoint, pencil, marker, highlighter — that respond
to stylus pressure, an eraser that removes whole strokes, a lasso to move,
recolour and duplicate, and **draw-and-hold**: pause at the end of a wobbly
circle and it becomes a perfect ellipse. The same engine powers notebooks,
the whiteboard, sketch blocks in documents and sketch cards on the canvas.

## Concepts

### 1. Capturing input with Pointer Events

`src/features/ink/useInkCapture.ts`

The Pointer Events API unifies mouse, touch and pen:

| Property | Use |
|---|---|
| `pointerType` | `'mouse' \| 'pen' \| 'touch'` — enables palm rejection |
| `pressure` | 0–1 from a stylus; mice report 0.5 while pressed |
| `setPointerCapture(id)` | keep receiving moves even if the pointer leaves the element |
| `getCoalescedEvents()` | the in-between samples |

**Coalesced events** matter for quality. Browsers fire at most one
`pointermove` per frame (60 Hz), but a stylus reports at 120–240 Hz. The
extra samples are bundled into the event; reading them gives smooth curves on
fast strokes instead of polygons.

**Palm rejection.** The first time we see `pointerType === 'pen'` we set
`penOnly`. From then on touch input is ignored for drawing — a resting palm
doesn't draw — and in notebooks fingers scroll the page instead
(`touch-action: pan-y`).

`touch-action: none` on the drawing surface stops the browser from treating a
touch stroke as a scroll or zoom.

### 2. From points to a stroke shape: perfect-freehand

A pen stroke is a list of `[x, y, pressure]` points. To draw a variable-width
line we need its **outline polygon**. [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
computes it:

```
input points:      •   •    •     •      •
                   ─────────────────────────▶
outline polygon:  ╭──────────────────────────╮
                  ╰──────────────────────────╯   wider where pressure is higher
```

Its options are how we design pens (`src/features/ink/pens.ts`):

| Option | Effect | Fountain | Marker | Highlighter |
|---|---|---|---|---|
| `thinning` | how much pressure changes width | 0.7 | 0 | 0 |
| `streamline` | lag behind the pointer to hide jitter | 0.5 | 0.55 | 0.65 |
| `taper` | thin out at the start/end | 12 / 22 | – | – |

When there's no real pressure (mouse), `simulatePressure` derives it from
speed: fast = thin, slow = thick — just like real ink.

### 3. Smoothing the outline into SVG

`outlineToPath` in `src/features/ink/geometry.ts` turns the polygon into an
SVG path. Straight segments look faceted, so we use **quadratic Béziers**
with the *midpoint trick*: each outline point becomes a control point, and the
curve passes through the midpoints between consecutive points.

```
 P0 ●             ● P2
      ╲   M1    ╱          M1 = midpoint(P1, P2)
        ●──·──●            curve: … Q P1 M1 T M2 T M3 …
          P1
```

The result is a continuous, smooth curve that never overshoots.

### 4. Painting: opacity, blend modes, texture

* **Highlighter** uses `mix-blend-mode: multiply` — colours *darken* what's
  underneath instead of covering it, so text stays readable. On a *dark*
  surface multiply would make it vanish, so there it uses `screen`
  (multiply's mirror image) at higher opacity. The choice depends on the
  surface, not the app theme — light notebook paper in dark mode still
  multiplies — so surfaces set `--hl-blend` and `--hl-opacity` CSS variables.
* **Pencil** gets an SVG filter: `feTurbulence` makes fractal noise and
  `feDisplacementMap` nudges the stroke's edge pixels by it → graphite grain.
* **Black ink** is rendered through the `--ink-black` CSS variable, which
  flips to near-white in dark mode and on "night" paper.

### 5. Hit testing: the eraser

The eraser removes any stroke within its radius. For each stroke segment we
compute the **distance from a point to a segment**:

```
t = clamp( ((p − a) · (b − a)) / |b − a|² , 0, 1 )      ← projection onto ab
closest = a + t (b − a)
distance = |p − closest|
```

If any segment is closer than `radius + strokeWidth/2`, the stroke is hit.

Two refinements make it fast and reliable:

* **Swept erasing.** A fast swipe can move 40 px between two pointer
  samples — farther than a thin line is wide. So instead of testing only the
  sample points, we test the *segment* from the previous sample to the
  current one against each stroke segment (segment-to-segment distance: zero
  if they cross, otherwise the closest of the four endpoint-to-segment
  distances).
* **Bounding boxes first.** Each stroke's bounds are cached in a `WeakMap`
  (`cachedBounds`). Strokes are immutable, so the cache can't go stale. A
  quick box check skips nearly every stroke before any per-segment work, and
  comparisons use *squared* distances to avoid square roots.

While a swipe is in progress the surviving strokes are shown from local
state and committed once on pointer-up (see §7).

### 6. The lasso: ray casting

Is a point inside an arbitrary loop? Shoot a ray to the right and count how
many polygon edges it crosses. **Odd = inside, even = outside.**

```
      ┌────────┐
  ●───┼────────┼──▶   2 crossings → outside
      │   ●────┼──▶   1 crossing  → inside
      └────────┘
```

A stroke is selected when more than 60% of its points are inside the lasso
(`strokeInLasso`). Dragging inside the selection's bounding box moves it.

### 7. One gesture, one undo step

An eraser swipe may remove ten strokes over 200 pointer moves. We want *one*
Ctrl+Z to bring them all back — and we don't want 200 writes either: for a
sketch block each write is a ProseMirror transaction. So erase and lasso-move
gestures keep their working strokes in a local `preview`, repaint at most
once per animation frame, and commit once on pointer-up. `useInkCapture` calls `commit(next, before)` where
`before` is the state at the start of the gesture; `useInkDocument` records
`before` in history only the first time it sees that reference.

History itself (`src/hooks/useHistory.ts`) is a past/future stack of
**snapshots**. Thanks to immutability and structural sharing, a snapshot is
just a reference — keeping 100 steps costs very little memory.

### 8. Draw-and-hold shape recognition

`src/features/ink/shapes.ts` — no machine learning, just geometry:

1. **Line:** `chord / pathLength > 0.94`. A hand-drawn straight line is only
   slightly longer than the distance between its ends.
2. **Closed?** If the ends are farther apart than 25% of the path length, it
   isn't a loop — give up.
3. **Rectangle:** the average distance from each point to the nearest edge of
   the bounding box is under 6% of its size.
4. **Ellipse:** for a perfect ellipse, `((x−cx)/rx)² + ((y−cy)/ry)² = 1`.
   If the average error is under 0.14, it's an ellipse.

The "hold" is a timer restarted on every movement larger than ~2 units. If it
fires (550 ms of stillness), we swap the stroke's points for the ideal shape
and, where supported, tick the device's vibration motor.

## In the code

| File | Role |
|---|---|
| `features/ink/pens.ts` | pen presets |
| `features/ink/geometry.ts` | paths, bounds, hit tests, translation |
| `features/ink/shapes.ts` | shape recognition |
| `features/ink/useInkCapture.ts` | pointer handling: draw, erase, lasso, move |
| `features/ink/useInkDocument.ts` | gesture-level undo |
| `features/ink/InkLayer.tsx` | memoised stroke rendering + pencil filter |
| `features/ink/InkSurface.tsx` | a fixed-size drawing area (viewBox scaling) |
| `features/ink/InkToolbar.tsx` | the pen case |
| `features/ink/toolStore.ts` | per-pen colour/size memory |

## Try it

1. Add a **dashed pen** by rendering the stroke's centre line with
   `stroke-dasharray` instead of filling the outline.
2. Teach `recognizeShape` to detect a **triangle**: a closed loop with three
   sharp corners (look for points where the direction changes by > 60°).
3. Make the eraser a *partial* eraser that splits strokes instead of removing
   them whole (hint: split `points` at hit segments).
