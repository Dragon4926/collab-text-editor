# 10 · Motion & polish

## What you see

Menus pop from where you clicked, the sidebar glides, pages cross-fade with a
whisper of blur, the selected tool's highlight slides between buttons, pens
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

### Enter and exit with `AnimatePresence`

React removes elements immediately, so there's nothing to animate *out*.
`AnimatePresence` keeps a removed child mounted until its `exit` animation
finishes. `mode="wait"` (used by `PageView`) waits for the old page to leave
before the new one enters.

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

`global.css` disables transitions and animations under
`prefers-reduced-motion: reduce`. Motion should delight, never disorient.

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
