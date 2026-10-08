import { useWorkspace } from '@/store/workspace';
import type { Page } from '@/store/types';
import { download } from '@/lib/download';
import { sanitizePage } from '@/lib/sanitize';

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

/** backups larger than this are refused before parsing — a guard against freezing the tab */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

/**
 * Merge a backup into the current workspace. Pages with the same id are
 * replaced. A backup is untrusted input — it may have been edited by hand
 * or come from someone else — so every page is rebuilt field by field
 * (see lib/sanitize.ts) instead of being stored as-is.
 */
export async function importBackup(file: File): Promise<number> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('That backup is too large to import');
  let data: Partial<Backup>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('Not a Lumen backup file');
  }
  if (typeof data !== 'object' || data === null || data.app !== 'lumen' || typeof data.pages !== 'object' || !data.pages) throw new Error('Not a Lumen backup file');
  const incoming = Object.values(data.pages)
    .map(sanitizePage)
    .filter((p): p is Page => !!p);
  if (!incoming.length) throw new Error('That backup contains no pages');
  useWorkspace.setState((s) => {
    for (const p of incoming) s.pages[p.id] = p;
    // a parent that isn't in the workspace (or a cycle) would hide the page
    for (const p of incoming) {
      const seen = new Set<string>();
      let cur: string | null = p.id;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        cur = s.pages[cur]?.parentId ?? null;
      }
      if (cur || (p.parentId && !s.pages[p.parentId])) s.pages[p.id].parentId = null;
    }
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
