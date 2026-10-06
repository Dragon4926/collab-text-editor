import type { StrokeOptions } from 'perfect-freehand';
import type { PenKind } from '@/store/types';

/**
 * Pen presets, modelled on the pen types in Samsung Notes.
 *
 * perfect-freehand turns a list of input points into the *outline polygon*
 * of a variable-width stroke. Its main knobs:
 *
 *  - size       base diameter of the nib
 *  - thinning   how much pressure changes the width (0 = constant width,
 *               negative = thinner when pressing harder)
 *  - smoothing  how much to soften the outline's edges
 *  - streamline how much to "drag" the stroke behind the pointer, hiding jitter
 *  - taper      length over which the start/end thins out to a point
 *
 * Each preset also carries how to *paint* the polygon: opacity and blend mode.
 * The highlighter uses `multiply` so overlapping strokes darken the text
 * underneath instead of covering it, just like a real highlighter.
 */
export interface PenPreset {
  label: string;
  options: StrokeOptions;
  /** multiply the user's size slider by this */
  sizeScale: number;
  opacity: number;
  blend?: 'multiply' | 'normal';
  /** draw a subtle grain texture (pencil) */
  textured?: boolean;
}

export const PENS: Record<PenKind, PenPreset> = {
  fountain: {
    label: 'Fountain pen',
    sizeScale: 1.2,
    opacity: 1,
    options: {
      thinning: 0.7,
      smoothing: 0.6,
      streamline: 0.5,
      easing: (t) => Math.sin((t * Math.PI) / 2), // ease-out: ink pools quickly
      start: { taper: 12, cap: true },
      end: { taper: 22, cap: true },
    },
  },
  pen: {
    label: 'Ballpoint',
    sizeScale: 0.8,
    opacity: 1,
    options: { thinning: 0.18, smoothing: 0.5, streamline: 0.45, start: { cap: true }, end: { cap: true } },
  },
  pencil: {
    label: 'Pencil',
    sizeScale: 0.7,
    opacity: 0.82,
    textured: true,
    options: { thinning: 0.45, smoothing: 0.3, streamline: 0.3, start: { taper: 6 }, end: { taper: 6 } },
  },
  marker: {
    label: 'Marker',
    sizeScale: 2.2,
    opacity: 0.95,
    options: { thinning: 0, smoothing: 0.6, streamline: 0.55, start: { cap: true }, end: { cap: true } },
  },
  highlighter: {
    label: 'Highlighter',
    sizeScale: 5,
    opacity: 0.38,
    blend: 'multiply',
    options: { thinning: 0, smoothing: 0.7, streamline: 0.65, start: { cap: false }, end: { cap: false } },
  },
};

export const PEN_ORDER: PenKind[] = ['fountain', 'pen', 'pencil', 'marker', 'highlighter'];

/** Samsung Notes-style default palette. */
export const INK_COLORS = ['#1d1d1f', '#e5484d', '#f76b15', '#ffc53d', '#30a46c', '#0090ff', '#5b4cf0', '#8e4ec6', '#ffffff'];

export const SIZES = [1, 2, 3, 5, 8];
