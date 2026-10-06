import { useWorkspace } from '@/store/workspace';
import type { Page } from '@/store/types';
import { download } from '@/lib/download';

/**
 * Whole-workspace backup as a single JSON file — the escape hatch every
 * local-first app needs: your data is never locked inside the browser.
 * (Voice memo audio lives in a separate blob store and is not included.)
 */

interface Backup {
  app: 'lumen';
  version: 1;
  exportedAt: string;
  pages: Record<string, Page>;
}

export function exportBackup() {
  const { pages } = useWorkspace.getState();
  const data: Backup = { app: 'lumen', version: 1, exportedAt: new Date().toISOString(), pages };
  const date = new Date().toISOString().slice(0, 10);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `lumen-backup-${date}.json`);
}

/** Merge a backup into the current workspace. Pages with the same id are replaced. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<Backup>;
  if (data.app !== 'lumen' || typeof data.pages !== 'object' || !data.pages) throw new Error('Not a Lumen backup file');
  const incoming = Object.values(data.pages).filter((p): p is Page => !!p && typeof p.id === 'string' && typeof p.kind === 'string');
  useWorkspace.setState((s) => {
    for (const p of incoming) s.pages[p.id] = p;
  });
  return incoming.length;
}

/** Ask the user for a file and import it. */
export function pickBackup(onDone: (count: number | Error) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      onDone(await importBackup(f));
    } catch (e) {
      onDone(e as Error);
    }
  };
  input.click();
}
