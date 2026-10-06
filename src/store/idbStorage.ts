import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';

/**
 * A zustand `StateStorage` backed by IndexedDB.
 *
 * Why IndexedDB and not localStorage?
 *  - localStorage is synchronous: every save blocks the main thread while the
 *    browser writes to disk. With ink strokes and documents that gets janky.
 *  - localStorage is capped at ~5 MB per origin. IndexedDB can hold hundreds
 *    of megabytes (images, voice memos).
 *
 * Why debounce?
 *  The editor updates the store on every keystroke. Serialising the whole
 *  workspace that often is wasted work — only the *last* state matters. So
 *  `setItem` waits until writes have been quiet for `DELAY` ms, then saves
 *  once. `flush()` forces a pending write out immediately (we call it when
 *  the tab is hidden, because the page might be closed next).
 */
const DELAY = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { name: string; value: string } | null = null;

async function write() {
  if (!pending) return;
  const { name, value } = pending;
  pending = null;
  await set(name, value);
}

export const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => {
    pending = { name, value };
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void write();
    }, DELAY);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

export function flushStorage() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  void write();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushStorage();
  });
  window.addEventListener('pagehide', flushStorage);
}
