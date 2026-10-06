import { nanoid } from 'nanoid';
import type { BoardElement, InkPoint, PenKind, SpaceCard, Stroke } from './types';
import { useWorkspace } from './workspace';
import { h, p, shortcutsDoc, task } from './docBuilders';

/**
 * First-run content. An empty app teaches nothing, so new users land on a
 * small tour: a welcome document, a spatial space, a whiteboard and a
 * notebook — each one demonstrating its own features.
 *
 * Ink is generated from parametric curves (a wave is sin(x), a loop is a
 * circle with drift…) so we don't have to ship recorded stroke data.
 */

const stroke = (pen: PenKind, color: string, size: number, pts: [number, number][], pressure = (t: number) => 0.35 + Math.sin(t * Math.PI) * 0.45): Stroke => ({
  id: nanoid(8),
  pen,
  color,
  size,
  points: pts.map(([x, y], i) => [x, y, pressure(i / (pts.length - 1))] as InkPoint),
});

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const wave = (x: number, y: number, w: number, amp: number, cycles = 2): [number, number][] => range(60).map((i) => [x + (i / 59) * w, y + Math.sin((i / 59) * Math.PI * 2 * cycles) * amp]);
const loop = (cx: number, cy: number, r: number, turns = 1.1): [number, number][] => range(70).map((i) => {
  const a = (i / 69) * Math.PI * 2 * turns - Math.PI / 2;
  return [cx + Math.cos(a) * r * (1 + i / 400), cy + Math.sin(a) * r * 0.8];
});
const spiral = (cx: number, cy: number): [number, number][] => range(120).map((i) => {
  const a = i / 8;
  const r = 4 + i * 0.9;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
});
const line = (x1: number, y1: number, x2: number, y2: number): [number, number][] => range(20).map((i) => [x1 + ((x2 - x1) * i) / 19, y1 + ((y2 - y1) * i) / 19 + Math.sin(i / 2) * 0.8]);

export function seedWorkspace() {
  const s = useWorkspace.getState();
  if (s.seeded || Object.keys(s.pages).length) return;

  /* ---------- notebook ---------- */
  const notebookId = s.createPage('notebook', null, {
    title: 'Sketchbook',
    icon: { name: 'Palette', color: '#30a46c' },
    notebook: {
      paper: 'dotted',
      tint: 'ivory',
      sheets: [
        {
          id: nanoid(8),
          strokes: [
            stroke('fountain', '#1d1d1f', 2, wave(90, 140, 420, 26, 2.5)),
            stroke('highlighter', '#ffc53d', 3, line(90, 228, 470, 226), () => 0.5),
            stroke('pen', '#0090ff', 2, loop(200, 380, 90)),
            stroke('pencil', '#1d1d1f', 2, spiral(560, 380)),
            stroke('marker', '#e5484d', 2, line(120, 560, 420, 520)),
            stroke('fountain', '#8e4ec6', 2, wave(120, 680, 520, 14, 6)),
          ],
        },
      ],
    },
  });

  /* ---------- whiteboard ---------- */
  // Omit<> on a union must be distributed over each member, or TypeScript
  // collapses it to only the keys every member shares
  type NoId<T> = T extends unknown ? Omit<T, 'id'> : never;
  const el = (e: NoId<BoardElement>) => ({ ...e, id: nanoid(8) }) as BoardElement;
  const boardId = s.createPage('board', null, {
    title: 'Ideas whiteboard',
    icon: { name: 'Shapes', color: '#f76b15' },
    board: {
      camera: { x: -120, y: -100, z: 1 },
      elements: [
        el({ type: 'text', x: 0, y: -10, text: 'How an idea grows', color: '#1d1d1f', size: 30 }),
        el({ type: 'shape', shape: 'rect', x: 0, y: 80, w: 180, h: 100, color: '#5b4cf0', fill: true, text: 'Capture' }),
        el({ type: 'shape', shape: 'ellipse', x: 280, y: 70, w: 190, h: 120, color: '#0090ff', fill: true, text: 'Connect' }),
        el({ type: 'shape', shape: 'diamond', x: 570, y: 60, w: 170, h: 140, color: '#30a46c', fill: true, text: 'Decide' }),
        el({ type: 'arrow', x1: 190, y1: 130, x2: 270, y2: 130, color: '#1d1d1f' }),
        el({ type: 'arrow', x1: 480, y1: 130, x2: 560, y2: 130, color: '#1d1d1f' }),
        { id: nanoid(8), type: 'stroke', stroke: stroke('marker', '#e5484d', 2, loop(655, 130, 110)) },
        el({ type: 'text', x: 520, y: 240, text: 'the fun part ↑', color: '#e5484d', size: 20 }),
      ],
    },
  });

  /* ---------- welcome doc (created before the space so the space can show it) ---------- */
  const welcomeId = s.createPage('doc', null, {
    title: 'Welcome to Lumen',
    icon: { name: 'Sparkles', color: '#5b4cf0' },
    cover: 'iris',
    favorite: true,
  });

  const shortcutsId = s.createPage('doc', welcomeId, {
    title: 'Keyboard shortcuts',
    icon: { name: 'Zap', color: '#f76b15' },
    doc: shortcutsDoc(),
  });

  const spaceId = s.createPage('space', null, { title: 'Research board', icon: { name: 'Orbit', color: '#0090ff' } });
  const card = (c: Partial<SpaceCard> & Pick<SpaceCard, 'type' | 'x' | 'y' | 'w' | 'h'>, z: number): SpaceCard => ({ id: nanoid(10), z, ...c });
  const frame = card({ type: 'frame', x: 0, y: 0, w: 540, h: 400, text: 'Interviews' }, 0);
  const n1 = card({ type: 'note', x: 30, y: 40, w: 220, h: 170, color: 'yellow', tilt: -1.5, text: 'People want a place where messy thinking is allowed.' }, 1);
  const n2 = card({ type: 'note', x: 290, y: 120, w: 220, h: 160, color: 'green', tilt: 1.2, text: 'Handwriting beats typing for early ideas.' }, 2);
  const n3 = card({ type: 'note', x: 60, y: 250, w: 200, h: 120, color: 'pink', tilt: 0.6, text: 'Voice memos for walks ✶' }, 3);
  const pc = card({ type: 'page', x: 660, y: 40, w: 300, h: 230, pageId: welcomeId }, 4);
  const nb = card({ type: 'page', x: 660, y: 340, w: 300, h: 260, pageId: notebookId }, 5);
  const title = card({ type: 'text', x: 0, y: -130, w: 560, h: 60, text: 'Drag, connect, zoom out ↘' }, 6);
  s.mutatePage(spaceId, (p) => {
    p.space = {
      camera: { x: -140, y: -200, z: 0.85 },
      cards: [frame, n1, n2, n3, pc, nb, title],
      edges: [
        { id: nanoid(8), from: n2.id, to: pc.id },
        { id: nanoid(8), from: n1.id, to: n2.id, dashed: true },
        { id: nanoid(8), from: pc.id, to: nb.id },
      ],
    };
  });

  /* ---------- welcome doc content ---------- */
  s.mutatePage(welcomeId, (pg) => {
    pg.doc = {
      type: 'doc',
      content: [
        p('A calm place for documents, spatial thinking and ink. Everything stays on this device, saved as you go.'),
        { type: 'callout', attrs: { tone: 'magic' }, content: [p('Press Ctrl+K at any time to search or jump anywhere. Type / on an empty line to insert blocks.')] },
        h(2, 'Four ways to think'),
        { type: 'pageLink', attrs: { pageId: spaceId } },
        { type: 'pageLink', attrs: { pageId: boardId } },
        { type: 'pageLink', attrs: { pageId: notebookId } },
        { type: 'pageLink', attrs: { pageId: shortcutsId } },
        h(2, 'Try these'),
        {
          type: 'taskList',
          content: [
            task('Select some text and give it a highlight', false),
            task('Type /sketch and draw right inside this page', false),
            task('Record a voice memo with /voice', false),
            task('Drag this page from the sidebar onto the Research board', false),
            task('Open Lumen for the first time', true),
          ],
        },
        h(2, 'Ink lives in documents too'),
        { type: 'sketch', attrs: { height: 220, strokes: [stroke('fountain', '#1d1d1f', 2, wave(40, 110, 300, 30, 2)), stroke('highlighter', '#ffc53d', 3, line(380, 112, 660, 110), () => 0.5), stroke('pen', '#5b4cf0', 2, loop(520, 110, 70))] } },
        { type: 'blockquote', content: [p('“The details are not the details. They make the design.” — Charles Eames')] },
        { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: "const thought = capture('idea');\nconnect(thought, 'everything else');" }] },
      ],
    };
  });

  // sidebar order: the tour reads top to bottom
  [welcomeId, spaceId, boardId, notebookId].forEach((id, i) => s.updatePage(id, { order: i }));
  s.setActive(welcomeId);
  s.markSeeded();
}
