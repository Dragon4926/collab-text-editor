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

/** Pop-in used by popovers and menus: scale up slightly from their anchor. */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  animate: { opacity: 1, scale: 1, y: 0, transition: spring.snappy },
  exit: { opacity: 0, scale: 0.97, y: -2, transition: { duration: 0.12 } },
};

/** Page-level cross fade with a hint of upward travel. */
export const pageFade: Variants = {
  initial: { opacity: 0, y: 8, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, y: -4, filter: 'blur(2px)', transition: { duration: 0.14 } },
};

/** Parent variant that staggers its children's entrance. */
export const stagger = (delay = 0.035): Variants => ({
  animate: { transition: { staggerChildren: delay } },
});

export const riseIn: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: spring.smooth },
};
