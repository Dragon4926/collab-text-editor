# 07 · Infinite canvases

## What you see

The spatial space and the whiteboard scroll forever in every direction.
Two-finger scroll pans, pinch zooms *into the spot under your fingers*, and
the dot grid glides along at every zoom level.

## Concepts

### The camera

`src/features/canvas/camera.ts`

There are two coordinate systems:

* **World** — where cards and shapes live. Unbounded.
* **Screen** — pixels in the viewport.

A camera `{ x, y, z }` connects them: `(x, y)` is the world point at the
viewport's top-left corner and `z` is the zoom.

```
screen = (world − camera) × z
world  = screen ÷ z + camera
```

In CSS, the world layer gets

```css
transform: scale(z) translate(-x px, -y px);
transform-origin: 0 0;
```

which applies exactly that formula to every child. So cards simply use world
coordinates (`left: card.x; top: card.y`) and never think about zoom.

### Zooming at the cursor

Naïvely multiplying `z` zooms around the top-left corner — the content slides
away from your cursor. We want the world point *under the cursor* to stay put.

Let `p` be the cursor (screen), `w` the world point under it:

```
before:  w = p / z  + c
after:   w = p / z' + c'      (same w!)
⇒        c' = w − p / z'
```

That's `zoomAt()`. Every zoom path — wheel, pinch, buttons — goes through it.

### Wheel, trackpad and pinch

`src/features/canvas/useCamera.ts`

* A trackpad two-finger scroll arrives as `wheel` events with `deltaX/deltaY`
  → pan.
* A trackpad **pinch** arrives as `wheel` with `ctrlKey: true` (a browser
  convention) → zoom.
* Zoom is **exponential**: `z' = z × e^(−deltaY × k)`. Equal wheel movements
  give equal *ratios*, so zooming from 10%→20% feels the same as 100%→200%.
* The listener is registered natively with `{ passive: false }` — React's
  `onWheel` is passive, so it can't `preventDefault()` the browser's own page
  zoom.
* Touch screens: we track active pointers; with two down, the change in their
  distance gives the zoom factor and the movement of their midpoint gives the
  pan.
* **Space + drag** and middle-mouse drag pan, like every design tool.

### Smooth camera moves

"Zoom to fit" and the zoom buttons animate with a spring via framer-motion's
`animate(0, 1, { type: 'spring', onUpdate })`. Position interpolates linearly,
but zoom interpolates **geometrically**:

```ts
z = from.z * Math.pow(target.z / from.z, t)
```

Linear zoom interpolation feels like it accelerates as it zooms in; geometric
interpolation feels uniform.

### Don't persist at 60 fps

The camera lives in React state for instant feedback. It's written to the
store only after it **settles** for 300 ms.

### A grid that follows the camera

The dot grid is the viewport's CSS background, not DOM elements:

```ts
backgroundSize:     `${24 * z}px ${24 * z}px`
backgroundPosition: `${-x * z}px ${-y * z}px`
```

Infinite grid, zero elements.

### Semantic zoom

When `z < 0.5` the space adds `.is-far` to the world, and labels scale by
`1/z` (exposed as the CSS variable `--inv-z`) so titles stay readable when
you zoom out to see the big picture — the map-app trick of showing *different
detail* at different scales.

## In the code

| File | Role |
|---|---|
| `features/canvas/camera.ts` | pure math: convert, zoomAt, panBy, fitBounds |
| `features/canvas/useCamera.ts` | input handling, springs, persistence |
| `features/canvas/ZoomControls.tsx` | zoom pill |
| `features/canvas/canvas.css` | viewport, world layer, glass chrome |

## Try it

1. Add **zoom-to-selection** (`⌘2`): `fitBounds` over the selected cards.
2. Clamp panning so the content can't be scrolled entirely out of view.
3. Add inertia: after a drag-pan ends, keep moving with decaying velocity.
