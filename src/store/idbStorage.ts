import { del, get, set } from 'idb-keyval';
import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * A zustand `PersistStorage` backed by IndexedDB.
 *
 * Why IndexedDB and not localStorage?
 *  - localStorage is synchronous: every save blocks the main thread while the
 *    browser writes to disk. With ink strokes and documents that gets janky.
 *  - localStorage is capped at ~5 MB per origin. IndexedDB can hold hundreds
 *    of megabytes (images, voice memos).
 *
 * Why store objects instead of JSON strings?
 *  zustand's default `createJSONStorage` calls `JSON.stringify` on *every*
 *  state change — before any debouncing can help. Dragging a card fires 60
 *  changes a second, and stringifying a workspace full of images that often
 *  is what makes an app stutter. IndexedDB stores structured objects
 *  natively (via the structured-clone algorithm), so we skip JSON entirely:
 *  `setItem` just remembers the latest value object, which costs nothing.
 *
 * Why debounce?
 *  Only the *last* state matters. The real write happens once writes have
 *  been quiet for `DELAY` ms. `flushStorage()` forces a pending write out
 *  immediately (we call it when the tab is hidden, because the page might be
 *  closed next).
 */
const DELAY = 400;

type Value = StorageValue<unknown>;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { name: string; value: Value } | null = null;

async function write() {
  if (!pending) return;
  const { name, value } = pending;
  pending = null;
  await set(name, value);
}

export function idbStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      const raw = await get<StorageValue<S> | string>(name);
      if (raw == null) return null;
      // workspaces saved by earlier versions were JSON strings
      return typeof raw === 'string' ? (JSON.parse(raw) as StorageValue<S>) : raw;
    },
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
}

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
