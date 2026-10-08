# 10 · Motion & polish

## What you see

Things *come into focus*: menus, popovers, the palette, toasts and new cards
fade in from a soft blur, and defocus as they leave. Pages cross-fade — one
blurring away while the next sharpens. Switching light/dark dissolves the
whole window through a blur. The sidebar glides open and its contents fade,
the selected tool's highlight slides between buttons, pens
rise out of the pen case, the favourite star bounces, checkboxes pop and toasts
spring up.

## Concepts

### Springs instead of durations

A CSS transition is defined by a *duration* and an *easing curve*. Interrupt
it halfway and the new transition starts from zero velocity — a visible jerk.

A **spring** is defined by physics: `stiffness` (how hard it pulls toward the
target) and `damping` (how quickly oscillation dies). Interrupt it and it
simply continues from its current velocity toward the new target. Rapid
interactions — toggling the sidebar twice, sweeping across a toolbar — stay
fluid.

Presets live in `src/lib/motion.ts`:

| Preset | stiffness / damping | Feel | Used for |
|---|---|---|---|
| `snappy` | 520 / 38 | decisive | menus, popovers, tool highlight |
| `smooth` | 300 / 30 | soft | sidebar, collapsibles |
| `gentle` | 170 / 24 | relaxed | large movements |
| `bouncy` | 420 / 18 | playful | star, new cards, toasts |

CSS transitions are still used for colour and hover changes, where
interruption doesn't matter.

### Blur into focus

Apple's interfaces rarely just *fade*. Since macOS Big Sur and iOS 15, and
even more with the glass of recent releases, elements **materialise**: they
start a few pixels out of focus and sharpen as they arrive. Blur makes a
transition feel optical — like a camera pulling focus — and it hides the
awkward first frames of a scale change.

The building blocks in `src/lib/motion.ts`:

```ts
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.94, y: -6, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)',
             transition: withFocus(spring.snappy), transitionEnd: { filter: 'none' } },
  exit:    { opacity: 0, scale: 0.97, y: -3, filter: 'blur(6px)' },
};
```

Two details make it work well:

1. **Blur never springs.** Springs overshoot; a blur that overshoots would
   pass through negative pixels, which is invalid. `withFocus()` gives the
   `filter` property its own short ease-out tween while everything else keeps
   the spring — framer-motion accepts a different transition per property.
2. **Remove the filter afterwards.** An element left at `filter: blur(0px)`
   still gets its own compositing layer: text can look slightly soft, and a
   `backdrop-filter` inside it stops working. `transitionEnd: { filter: 'none' }`
   clears it once the animation finishes.

Where it's used: `popIn` (menus, popovers, slash menu), `riseIn` (home screen
and notebook sheets, staggered), `blurFade` (the sticky-note colour bar), plus
the palette, toasts, ink selection bar, whiteboard pen bar, sidebar sections
and tree rows, space cards, the page icon and the formatting toolbar (a CSS
keyframe there, because TipTap mounts that element itself).

The palette also animates `backdropFilter` on its scrim, so the whole app
behind it softly defocuses — Spotlight's trick.

### Page switches and theme changes: the View Transitions API

Both page switches and theme changes go through `withViewTransition()` in
`src/lib/viewTransition.ts`.

Page switches used to be animated in React with framer-motion. That fell
apart on heavy pages: mounting an editor, a canvas or a PDF reader blocks the
main thread for 100–200 ms at exactly the moment the fade should start, so
the first half of it never reached the screen. A view transition animates
*snapshots* on the compositor instead, so nothing the new page does while it
settles in can drop a frame.

The main area has `view-transition-name: page`, so only it cross-fades: the
old page drifts back and defocuses (`page-out`) while the new one sharpens
into place (`page-in`), overlapping, as one optical motion. The sidebar
just swaps its highlighted row. `<html data-vt="page">` or `"theme"` is set
for the duration, so `global.css` can give each kind its own choreography.

Before the "after" snapshot, the transition waits for the next surface's
code (`registerSurfaceLoader` in `PageView`). Otherwise the first visit to a
canvas would cross-fade into a loading spinner.

#### Theme changes

Switching theme changes dozens of CSS variables in one go. Animating each
colour with CSS transitions looked muddy: some elements changed instantly,
others lagged, and you could catch a half-light, half-dark frame.

`src/lib/theme.ts` uses `document.startViewTransition()` instead:

```
old screen ──snapshot──┐
                       ├──▶ cross-fade the two *images* (with blur) ──▶ live page
update DOM ──snapshot──┘
```

The browser snapshots the current page, runs our callback (which applies the
new theme synchronously via `flushSync`, with the theme attribute set in a
layout effect), snapshots the result, and animates
`::view-transition-old(root)` into `::view-transition-new(root)` using the
`theme-out` / `theme-in` keyframes in `global.css`.

One subtlety: the update callback runs *asynchronously*, after the "before"
snapshot. If you toggle twice quickly, reading the theme from the DOM would
still see the old value. `theme.ts` remembers the theme it's heading to, so a
second toggle flips from there.

### Enter and exit with `AnimatePresence`

React removes elements immediately, so there's nothing to animate *out*.
`AnimatePresence` keeps a removed child mounted until its `exit` animation
finishes. Its `mode` decides how old and new overlap: `"sync"` (default) runs
both at once in normal layout, `"wait"` finishes the exit before the enter
starts, and `"popLayout"` overlaps them with the outgoing element taken out
of the layout.

### Shared layout animations

When an element with `layoutId="x"` unmounts in one place and mounts in
another, framer-motion measures both positions and animates between them.
That one prop powers:

* the theme switcher's sliding pill (`Sidebar.tsx`),
* the toolbar's active-tool highlight (`SpacePage.tsx`, `BoardPage.tsx`),
* the command palette's selection highlight.

### Staggered entrances

A parent with `staggerChildren` delays each child's animation slightly
(`stagger()` in `motion.ts`). The home screen uses it so the greeting, cards
and recents arrive in a gentle cascade rather than all at once.

### When *not* to animate

The aurora behind the sidebar (`components/shell/Aurora.tsx`) used to be
three `blur(80px)` blobs drifting forever, seen through the sidebar's
`backdrop-filter`. "Only `transform`" sounds free, but a translucent
`backdrop-filter` over a moving backdrop must be re-blurred every frame. On
many Windows GPUs that flickered — and when the huge blurred layers didn't
fit in tile memory, the browser's own window colour showed through and the
sidebar went black. The aurora is now three static gradients painted
*inside* the opaque sidebar (`AppShell.css`) — no separate layer to lose.

The same lesson shaped the sidebar's open/close: only its `width` springs,
and only the *contents* fade. Animating `filter` on the panel itself put it on
a fresh compositing layer every frame of the spring, which flickered.

### Respecting the user

`global.css` disables CSS transitions and animations under
`prefers-reduced-motion: reduce`, `<MotionConfig reducedMotion="user">` in
`App.tsx` makes framer-motion skip movement (transform and layout
animations) while keeping gentle fades, and the theme cross-fade is skipped
entirely. Motion
should delight, never disorient.

### Small details that add up

* `:active { transform: scale(0.94) }` on buttons gives tactile feedback.
* Menus set `transform-origin` to where they open from.
* Loading spinners appear only after 250 ms — fast loads show nothing at all.
* The checkbox tick uses a keyframe "pop" from 30% scale.
* The selection marquee and lasso use animated `stroke-dashoffset`
  ("marching ants").

## Try it

1. Make the sidebar's tree rows animate their reordering when you drag one
   (hint: `layout` is already on the rows — try dropping and watch).
2. Measure it: record the sidebar toggling in DevTools → Performance with
   *Rendering → Paint flashing* on, before and after adding a `filter`.
3. Tweak `spring.snappy` and feel the difference in the command palette.
