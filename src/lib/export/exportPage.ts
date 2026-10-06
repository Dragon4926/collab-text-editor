import { displayTitle, useWorkspace } from '@/store/workspace';
import { toast } from '@/components/ui/Toast';
import { download, slug } from '@/lib/download';
import { toMarkdown } from './markdown';
import { boardSvg, notebookSvg, svgToPng } from './inkSvg';

/** Export one page in the requested format and download it. */
export async function exportPage(id: string, format: 'md' | 'svg' | 'png') {
  const { pages } = useWorkspace.getState();
  const page = pages[id];
  if (!page) return;
  const name = slug(displayTitle(page));

  if (format === 'md') {
    const md = toMarkdown(displayTitle(page), page.doc, (pid) => (pages[pid] ? displayTitle(pages[pid]) : undefined));
    download(new Blob([md], { type: 'text/markdown' }), `${name}.md`);
  } else {
    const svg = page.kind === 'notebook' && page.notebook ? notebookSvg(page.notebook) : boardSvg(page.board?.elements ?? []);
    if (format === 'svg') download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
    else download(await svgToPng(svg), `${name}.png`);
  }
  toast(`Exported “${displayTitle(page)}”`);
}
