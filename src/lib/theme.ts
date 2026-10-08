import { withViewTransition } from './viewTransition';
import { useWorkspace } from '@/store/workspace';
import type { ThemePref } from '@/store/types';

/**
 * Switch appearance with a soft, blurred cross-fade.
 *
 * Changing theme flips dozens of CSS variables at once. Animating each
 * colour separately looks messy — elements change at different speeds and
 * you glimpse half-light, half-dark frames. The View Transitions API does it
 * properly: the browser takes a screenshot of the old page, we update the
 * DOM, it takes a screenshot of the new page, then animates between the two
 * as images (see the ::view-transition rules in global.css).
 *
 * withViewTransition renders the new theme with `flushSync` *inside* the callback, so
 * the "after" screenshot already shows it. Browsers without the API (or
 * users who prefer reduced motion) just switch instantly.
 */
// The view-transition callback runs asynchronously (after the browser has
// captured the "before" screenshot). Remember the theme we're heading to, so
// a second quick toggle flips from *that* rather than from the stale DOM.
let target: 'light' | 'dark' | null = null;

const resolve = (pref: ThemePref): 'light' | 'dark' =>
  pref === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : pref;

export function changeTheme(pref: ThemePref) {
  target = resolve(pref);
  const apply = () => {
    useWorkspace.getState().setTheme(pref);
    target = null;
  };
  withViewTransition('theme', apply);
}

/** Toggle between light and dark based on what's currently shown. */
export const toggleTheme = () => {
  const current = target ?? resolve(useWorkspace.getState().theme);
  changeTheme(current === 'dark' ? 'light' : 'dark');
};
