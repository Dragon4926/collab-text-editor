import { nanoid } from 'nanoid';
import { useWorkspace } from '@/store/workspace';
import type { HighlightColor, ID, PdfHighlight } from '@/store/types';
import { importPdf } from '@/lib/pdf';

/** Import a PDF file as a new page. `parentId` nests it under another page. */
export async function addPdfFile(file: File, parentId: ID | null = null): Promise<ID> {
  const info = await importPdf(file);
  return useWorkspace.getState().createPage('pdf', parentId, {
    title: info.title,
    pdf: { blobId: info.blobId, pages: info.pages, lastPage: 1, highlights: [] },
  });
}

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink'];

export const makeHighlight = (h: Omit<PdfHighlight, 'id'>): PdfHighlight => ({ id: nanoid(8), ...h });

/** Highlight writes for one PDF page. */
export function pdfHighlightActions(pageId: ID) {
  const mutate = useWorkspace.getState().mutatePage;
  return {
    add: (h: PdfHighlight) => mutate(pageId, (p) => void p.pdf?.highlights.push(h)),
    remove: (id: ID) =>
      mutate(pageId, (p) => {
        if (p.pdf) p.pdf.highlights = p.pdf.highlights.filter((h) => h.id !== id);
      }),
    patch: (id: ID, patch: Partial<PdfHighlight>) =>
      mutate(pageId, (p) => {
        const h = p.pdf?.highlights.find((x) => x.id === id);
        if (h) Object.assign(h, patch);
      }),
    setLastPage: (n: number) =>
      mutate(pageId, (p) => {
        if (p.pdf && p.pdf.lastPage !== n) p.pdf.lastPage = n;
      }),
  };
}
