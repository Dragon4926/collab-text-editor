import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getBlob, putBlob } from '@/lib/blobs';

/**
 * PDF loading. pdf.js is big (~1 MB with its worker), so it is imported on
 * demand — the app only pays for it once someone opens or imports a PDF.
 *
 * The file itself is kept in the blob store (like voice memos); the page
 * only stores the blob id. Parsed documents are cached by blob id so a card
 * on the canvas and the full reader share one parse.
 */
let lib: Promise<typeof import('pdfjs-dist')> | null = null;

export function pdfjs() {
  lib ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(([m, worker]) => {
    m.GlobalWorkerOptions.workerSrc = worker.default;
    return m;
  });
  return lib;
}

/*
 * Runtime files pdf.js fetches itself (served by the pdfjs-assets plugin in
 * vite.config.ts). Without the WebAssembly decoders, scanned books — whose
 * pages are JPEG 2000 images — render as blank white pages.
 */
const asset = (folder: string) => new URL(`${import.meta.env.BASE_URL}pdfjs/${folder}/`, window.location.href).href;

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function loadPdf(blobId: string): Promise<PDFDocumentProxy> {
  let doc = docs.get(blobId);
  if (!doc) {
    doc = (async () => {
      const [m, blob] = await Promise.all([pdfjs(), getBlob(blobId)]);
      if (!blob) throw new Error('This PDF is no longer stored on this device');
      return m.getDocument({
        data: new Uint8Array(await blob.arrayBuffer()),
        wasmUrl: asset('wasm'),
        standardFontDataUrl: asset('standard_fonts'),
        cMapUrl: asset('cmaps'),
        cMapPacked: true,
        iccUrl: asset('iccs'),
      }).promise;
    })();
    docs.set(blobId, doc);
    doc.catch(() => docs.delete(blobId));
  }
  return doc;
}

/* ------------------------------------------------------------------ */
/* Render queue                                                        */
/* ------------------------------------------------------------------ */

/*
 * Drawing a page is CPU-heavy (a scanned page decodes a full-resolution
 * image). Scrolling a book fast would otherwise start dozens of renders at
 * once and starve the one page you're looking at. So renders queue up, two
 * at a time, and the reading column (priority 0) always goes before
 * thumbnails (priority 1).
 */
interface Job {
  priority: number;
  run: () => Promise<void>;
}
const queue: Job[] = [];
let active = 0;
const MAX_ACTIVE = 2;

function pump() {
  while (active < MAX_ACTIVE && queue.length) {
    queue.sort((a, b) => a.priority - b.priority);
    const job = queue.shift()!;
    active++;
    job.run().finally(() => {
      active--;
      pump();
    });
  }
}

/** Queue a render. `cancel()` drops it if it hasn't started yet. */
export function scheduleRender(priority: number, run: () => Promise<void>) {
  const job: Job = { priority, run };
  queue.push(job);
  pump();
  return {
    cancel: () => {
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export const isPdfFile = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export interface ImportedPdf {
  blobId: string;
  pages: number;
  title: string;
}

/** Store a PDF file and read its page count and title. */
export async function importPdf(file: File): Promise<ImportedPdf> {
  const blobId = await putBlob(file);
  const doc = await loadPdf(blobId);
  let title = file.name.replace(/\.pdf$/i, '');
  try {
    const meta = await doc.getMetadata();
    const embedded = (meta.info as { Title?: string }).Title?.trim();
    if (embedded) title = embedded;
  } catch {
    /* metadata is optional */
  }
  return { blobId, pages: doc.numPages, title };
}

/** Ask the user for PDF files. */
export function pickPdfs(onFiles: (files: File[]) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/pdf,.pdf';
  input.multiple = true;
  input.onchange = () => {
    const files = [...(input.files ?? [])].filter(isPdfFile);
    if (files.length) onFiles(files);
  };
  input.click();
}
