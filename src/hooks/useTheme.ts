import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useWorkspace } from '@/store/workspace';

const query = '(prefers-color-scheme: dark)';

/**
 * Subscribe to the OS colour scheme.
 *
 * `useSyncExternalStore` is React's official way to read a value that lives
 * outside React (here: a media query) without tearing during concurrent
 * rendering. It needs a `subscribe` function and a `getSnapshot` function.
 */
function useSystemDark() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Resolve the user's preference to 'light' | 'dark' and apply it to <html>. */
export function useTheme() {
  const pref = useWorkspace((s) => s.theme);
  const systemDark = useSystemDark();
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  // a *layout* effect runs synchronously during commit, so the theme is on
  // <html> before the browser paints — and within changeTheme's flushSync
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#19191c' : '#f5f5f7');
  }, [resolved]);

  return resolved;
}
