import type { Transition, Variants } from 'framer-motion';

/**
 * Motion presets.
 *
 * Springs feel more physical than duration-based easing because they keep
 * the velocity of an interrupted animation. We use three "personalities":
 *
 *  - snappy: menus, popovers, toolbars — quick and decisive
 *  - smooth: panels and sidebars — a touch softer
 *  - gentle: page-level transitions — slow enough to read the change
 *
 * `stiffness` controls how hard the spring pulls toward the target,
 * `damping` how quickly oscillation dies out. Higher damping = less bounce.
 */
export const spring = {
  snappy: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 },
  smooth: { type: 'spring', stiffness: 300, damping: 30 },
  gentle: { type: 'spring', stiffness: 170, damping: 24 },
  bouncy: { type: 'spring', stiffness: 420, damping: 18 },
} satisfies Record<string, Transition>;

/*
 * Blur + fade — the "materialise" transition Apple uses across macOS and
 * iOS: things don't just fade, they come into focus. Pairing a few pixels
 * of blur with opacity makes the change feel optical rather than digital,
 * and hides the first frames of a scale change.
 *
 * Note `transitionEnd: { filter: 'none' }`: an element left at
 * `filter: blur(0px)` still gets its own compositing layer, which can make
 * text render slightly soft and breaks `backdrop-filter` on descendants.
 * Removing the filter entirely once the animation ends avoids both.
 */
const SHARP = { filter: 'none' };

/**
 * Springs can overshoot, and an overshooting blur would dip below 0px (an
 * invalid value). So blur always runs on a short ease-out tween while the
 * other properties keep their spring: framer-motion accepts a per-property
 * transition, e.g. `{ ...spring.snappy, filter: focus }`.
 */
export const focus: Transition = { duration: 0.28, ease: [0.22, 1, 0.36, 1] };
export const withFocus = (t: Transition): Transition => ({ ...t, filter: focus });

/** Menus, popovers, slash menu: grow from the anchor while coming into focus. */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.94, y: -6, filter: 'blur(8px)' },
  animate: { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', transition: withFocus(spring.snappy), transitionEnd: SHARP },
  exit: { opacity: 0, scale: 0.97, y: -3, filter: 'blur(6px)', transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } },
};

/** Parent variant that staggers its children's entrance. */
export const stagger = (delay = 0.035): Variants => ({
  animate: { transition: { staggerChildren: delay } },
});

/** Children of a stagger: rise a little while coming into focus. */
export const riseIn: Variants = {
  initial: { opacity: 0, y: 10, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: withFocus(spring.smooth), transitionEnd: SHARP },
};

/** Generic props for anything that should appear/disappear with blur-fade. */
export const blurFade = {
  initial: { opacity: 0, filter: 'blur(6px)', scale: 0.98 },
  animate: { opacity: 1, filter: 'blur(0px)', scale: 1, transitionEnd: SHARP },
  exit: { opacity: 0, filter: 'blur(6px)', scale: 0.98 },
  transition: withFocus(spring.snappy),
} as const;
