import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PenKind } from '@/store/types';

/**
 * The active ink tool, shared by every ink surface (whiteboard, notebook,
 * sketch blocks). Like Samsung Notes, each pen remembers its own colour and
 * size, so switching from the fountain pen to the highlighter and back
 * restores the fountain pen exactly as you left it.
 *
 * This tiny store persists to localStorage — it's a few bytes of user
 * preference, so the synchronous API is fine here.
 */

export type InkMode = 'draw' | 'erase' | 'lasso' | 'pan';

interface PenSettings {
  color: string;
  size: number;
}

interface InkToolState {
  mode: InkMode;
  pen: PenKind;
  settings: Record<PenKind, PenSettings>;
  /** when a stylus is detected, fingers only pan/scroll (palm rejection) */
  penOnly: boolean;
  setMode: (m: InkMode) => void;
  setPen: (p: PenKind) => void;
  setColor: (c: string) => void;
  setSize: (s: number) => void;
  setPenOnly: (v: boolean) => void;
}

export const useInkTool = create<InkToolState>()(
  persist(
    (set) => ({
      mode: 'draw',
      pen: 'fountain',
      settings: {
        fountain: { color: '#1d1d1f', size: 2 },
        pen: { color: '#0090ff', size: 2 },
        pencil: { color: '#1d1d1f', size: 2 },
        marker: { color: '#e5484d', size: 3 },
        highlighter: { color: '#ffc53d', size: 3 },
      },
      penOnly: false,
      setMode: (mode) => set({ mode }),
      setPen: (pen) => set({ pen, mode: 'draw' }),
      setColor: (color) => set((s) => ({ settings: { ...s.settings, [s.pen]: { ...s.settings[s.pen], color } }, mode: 'draw' })),
      setSize: (size) => set((s) => ({ settings: { ...s.settings, [s.pen]: { ...s.settings[s.pen], size } } })),
      setPenOnly: (penOnly) => set({ penOnly }),
    }),
    { name: 'lumen-ink-tool' },
  ),
);
