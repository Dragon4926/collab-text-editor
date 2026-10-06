# 10 · Motion & polish

## What you see

Things *come into focus*: menus, popovers, the palette, toasts and new cards
fade in from a soft blur, and defocus as they leave. Pages cross-fade — one
blurring away while the next sharpens. Switching light/dark dissolves the
whole window through a blur. The sidebar glides and defocuses as it folds,
the selected tool's highlight slides between buttons, pens
rise out of the pen case, the favourite star bounces, checkboxes pop, toasts
spring up, and the aurora behind the glass drifts slowly forever.

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

### Overlapping page transitions

`PageView` keys each page by id inside
`<AnimatePresence mode="popLayout">`. "popLayout" pops the outgoing page out
of the layout (absolutely positioned where it was) so the incoming page can
animate **at the same time**. One defocuses and drifts back while the other
sharpens into place: a true cross-fade, in roughly half the time of
fade-out-then-fade-in. The exiting page gets `pointerEvents: 'none'` so it
can't swallow clicks meant for the new one.

### Theme changes: the View Transitions API

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
starts, and `"popLayout"` (used by `PageView`, above) overlaps them with the
outgoing element taken out of the layout.

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

### Ambient motion that costs nothing

The aurora (`components/shell/Aurora.tsx`) is three large blurred gradients
animated with CSS keyframes that only change `transform`. Transforms are
handled by the GPU compositor — no layout, no paint — so the effect runs at
full frame rate with negligible CPU. The three animations have durations of
38 s, 47 s and 53 s; because they share no common factor, the combined
pattern takes minutes to repeat and never feels like a loop.

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
2. Add a subtle parallax: move the aurora a few pixels opposite to the canvas
   camera.
3. Tweak `spring.snappy` and feel the difference in the command palette.
