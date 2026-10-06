import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { useShallow } from 'zustand/react/shallow';
import { nanoid } from 'nanoid';
import { idbStorage } from './idbStorage';
import type {
  BoardData,
  ID,
  NotebookData,
  Page,
  PageKind,
  SpaceData,
  ThemePref,
} from './types';

/**
 * The workspace store.
 *
 * zustand keeps state outside React. Components subscribe to *slices* with a
 * selector (`useWorkspace(s => s.pages[id])`) and only re-render when that
 * slice changes — much cheaper than a React context holding everything.
 *
 * Two middlewares wrap the store:
 *  - `immer` lets actions "mutate" a draft (`s.pages[id].title = t`). Immer
 *    records the changes and produces a new immutable object, so React's
 *    reference-equality checks still work.
 *  - `persist` serialises the state to IndexedDB after every change and
 *    rehydrates it on startup. `partialize` excludes transient UI state.
 */

export const emptySpace = (): SpaceData => ({ cards: [], edges: [], camera: { x: -80, y: -60, z: 1 } });
export const emptyBoard = (): BoardData => ({ elements: [], camera: { x: -200, y: -120, z: 1 } });
export const emptyNotebook = (): NotebookData => ({
  paper: 'lined',
  tint: 'ivory',
  sheets: [{ id: nanoid(8), strokes: [] }],
});

export interface WorkspaceState {
  pages: Record<ID, Page>;
  activeId: ID | null;
  /** ids of tree rows the user expanded */
  expanded: Record<ID, boolean>;
  theme: ThemePref;
  sidebarOpen: boolean;
  seeded: boolean;

  // ----- transient UI (not persisted) -----
  paletteOpen: boolean;

  // ----- actions -----
  createPage: (kind: PageKind, parentId?: ID | null, init?: Partial<Omit<Page, 'id'>>) => ID;
  updatePage: (id: ID, patch: Partial<Page>) => void;
  /** run a mutation against a page's draft — for nested content edits */
  mutatePage: (id: ID, fn: (p: Page) => void) => void;
  setActive: (id: ID | null) => void;
  toggleExpanded: (id: ID, open?: boolean) => void;
  toggleFavorite: (id: ID) => void;
  trashPage: (id: ID) => void;
  restorePage: (id: ID) => void;
  deleteForever: (id: ID) => void;
  duplicatePage: (id: ID) => ID | null;
  movePage: (id: ID, parentId: ID | null, index: number) => void;
  setTheme: (t: ThemePref) => void;
  setSidebarOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  markSeeded: () => void;
}

/** fallback names shown while a page has no title */
const untitled: Record<PageKind, string> = {
  doc: 'Untitled',
  space: 'Untitled space',
  board: 'Untitled board',
  notebook: 'Untitled notebook',
};

/** collect a page and all of its descendants */
function subtree(pages: Record<ID, Page>, id: ID): ID[] {
  const out = [id];
  for (const p of Object.values(pages)) {
    if (p.parentId === id) out.push(...subtree(pages, p.id));
  }
  return out;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    immer((set, get) => ({
      pages: {},
      activeId: null,
      expanded: {},
      theme: 'system',
      sidebarOpen: true,
      seeded: false,
      paletteOpen: false,

      createPage: (kind, parentId = null, init = {}) => {
        const id = nanoid(10);
        const now = Date.now();
        const siblings = Object.values(get().pages).filter((p) => p.parentId === parentId);
        set((s) => {
          s.pages[id] = {
            id,
            kind,
            title: '',
            icon: null,
            cover: null,
            parentId,
            order: siblings.length,
            favorite: false,
            trashed: false,
            createdAt: now,
            updatedAt: now,
            ...(kind === 'space' && { space: emptySpace() }),
            ...(kind === 'board' && { board: emptyBoard() }),
            ...(kind === 'notebook' && { notebook: emptyNotebook() }),
            ...init,
          };
          if (parentId) s.expanded[parentId] = true;
        });
        return id;
      },

      updatePage: (id, patch) =>
        set((s) => {
          const p = s.pages[id];
          if (!p) return;
          Object.assign(p, patch, { updatedAt: Date.now() });
        }),

      mutatePage: (id, fn) =>
        set((s) => {
          const p = s.pages[id];
          if (!p) return;
          fn(p);
          p.updatedAt = Date.now();
        }),

      setActive: (id) => set({ activeId: id }),

      toggleExpanded: (id, open) =>
        set((s) => {
          s.expanded[id] = open ?? !s.expanded[id];
        }),

      toggleFavorite: (id) =>
        set((s) => {
          const p = s.pages[id];
          if (p) p.favorite = !p.favorite;
        }),

      trashPage: (id) =>
        set((s) => {
          for (const pid of subtree(s.pages, id)) s.pages[pid].trashed = true;
          if (s.activeId && s.pages[s.activeId]?.trashed) {
            const next = Object.values(s.pages).find((p) => !p.trashed);
            s.activeId = next?.id ?? null;
          }
        }),

      restorePage: (id) =>
        set((s) => {
          for (const pid of subtree(s.pages, id)) s.pages[pid].trashed = false;
          const p = s.pages[id];
          // if the parent is still in the trash, restore to the root
          if (p.parentId && s.pages[p.parentId]?.trashed) p.parentId = null;
        }),

      deleteForever: (id) =>
        set((s) => {
          for (const pid of subtree(s.pages, id)) delete s.pages[pid];
        }),

      duplicatePage: (id) => {
        const src = get().pages[id];
        if (!src) return null;
        const { id: _oldId, ...copy } = structuredClone(src);
        return get().createPage(src.kind, src.parentId, {
          ...copy,
          title: src.title ? `${src.title} copy` : '',
          favorite: false,
          createdAt: Date.now(),
        });
      },

      movePage: (id, parentId, index) =>
        set((s) => {
          const page = s.pages[id];
          if (!page) return;
          // refuse to move a page inside its own subtree
          if (parentId && subtree(s.pages, id).includes(parentId)) return;
          const siblings = Object.values(s.pages)
            .filter((p) => p.parentId === parentId && p.id !== id && !p.trashed)
            .sort((a, b) => a.order - b.order);
          siblings.splice(index, 0, page);
          siblings.forEach((p, i) => (p.order = i));
          page.parentId = parentId;
        }),

      setTheme: (t) => set({ theme: t }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setPaletteOpen: (open) => set({ paletteOpen: open }),
      markSeeded: () => set({ seeded: true }),
    })),
    {
      name: 'lumen-workspace',
      version: 1,
      storage: idbStorage(),
      partialize: ({ pages, activeId, expanded, theme, sidebarOpen, seeded }) => ({
        pages,
        activeId,
        expanded,
        theme,
        sidebarOpen,
        seeded,
      }),
    },
  ),
);

/* ---------------- selectors & helpers ---------------- */

export const selectActivePage = (s: WorkspaceState) => (s.activeId ? s.pages[s.activeId] : undefined);

/** children of a page (or root when parentId is null), in order */
export function childrenOf(pages: Record<ID, Page>, parentId: ID | null) {
  return Object.values(pages)
    .filter((p) => p.parentId === parentId && !p.trashed)
    .sort((a, b) => a.order - b.order);
}

/** walk up the tree to build a breadcrumb */
export function ancestry(pages: Record<ID, Page>, id: ID): Page[] {
  const out: Page[] = [];
  let cur: Page | undefined = pages[id];
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? pages[cur.parentId] : undefined;
  }
  return out;
}

export const displayTitle = (p: Pick<Page, 'title' | 'kind'>) => p.title.trim() || untitled[p.kind];

/**
 * Subscribe to just what's needed to *label* a page (title, kind, icon).
 * Typing in a document changes its `doc` on every keystroke; components that
 * only show the page's name shouldn't re-render for that.
 */
export function usePageLabel(id: ID | null | undefined) {
  return useWorkspace(
    useShallow((s) => {
      const p = id ? s.pages[id] : undefined;
      return p ? { id: p.id, title: p.title, kind: p.kind, icon: p.icon, favorite: p.favorite } : null;
    }),
  );
}
