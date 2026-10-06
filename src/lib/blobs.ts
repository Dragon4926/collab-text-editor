import { createStore, del, get, set } from 'idb-keyval';
import { nanoid } from 'nanoid';

/**
 * Binary attachments (voice memos) live in their own IndexedDB store, keyed
 * by id. Documents only keep the id.
 *
 * Why not inline them as base64 like images? Audio is large, and the
 * workspace JSON is re-serialised on every save; keeping blobs out of it
 * means typing in a document with a 5-minute recording stays fast.
 * IndexedDB stores Blob objects natively — no base64 overhead at all.
 */
const store = createStore('lumen-blobs', 'blobs');

export async function putBlob(blob: Blob): Promise<string> {
  const id = nanoid(12);
  await set(id, blob, store);
  return id;
}

export const getBlob = (id: string) => get<Blob>(id, store);
export const deleteBlob = (id: string) => del(id, store);
