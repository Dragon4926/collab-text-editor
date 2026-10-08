/**
 * The Lumen data model.
 *
 * Everything the user creates is a `Page`. A page has shared metadata
 * (title, icon, place in the tree) and a `kind` that decides which surface
 * renders it and which content field is used:
 *
 *   kind       | surface                         | content field
 *   -----------|---------------------------------|--------------
 *   'doc'      | rich-text block editor          | doc
 *   'space'    | infinite spatial canvas         | space
 *   'board'    | infinite whiteboard (shapes+ink)| board
 *   'notebook' | paged paper for handwriting     | notebook
 *   'pdf'      | reader with highlights          | pdf
 *
 * Content is plain JSON so the whole workspace can be serialised to
 * IndexedDB (and exported) without custom encoders.
 */

export type PageKind = 'doc' | 'space' | 'board' | 'notebook' | 'pdf';

export type ID = string;

/* ------------------------------------------------------------------ */
/* Ink — shared by whiteboard, notebook, sketch blocks and space cards */
/* ------------------------------------------------------------------ */

/** A sampled pen position: x, y and pressure in [0, 1]. */
export type InkPoint = [x: number, y: number, pressure: number];

export type PenKind = 'fountain' | 'pen' | 'pencil' | 'marker' | 'highlighter';

export interface Stroke {
  id: ID;
  pen: PenKind;
  color: string;
  size: number;
  points: InkPoint[];
}

/* ------------------------------------------------------------------ */
/* Spatial space                                                       */
/* ------------------------------------------------------------------ */

export interface Camera {
  /** world-space point shown at the viewport's top-left corner */
  x: number;
  y: number;
  /** zoom factor: 1 = 100% */
  z: number;
}

export type NoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple' | 'gray';

export type SpaceCardType = 'note' | 'text' | 'page' | 'frame' | 'image' | 'sketch';

export interface SpaceCard {
  id: ID;
  type: SpaceCardType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** stacking order — larger draws on top */
  z: number;
  color?: NoteColor;
  text?: string;
  /** for 'page' cards: the page this card is a live window onto */
  pageId?: ID;
  /** for 'image' cards: a data URL */
  src?: string;
  /** for 'sketch' cards */
  strokes?: Stroke[];
  /** small random tilt for sticky notes, in degrees */
  tilt?: number;
  /** for 'page' cards onto a PDF: the card has grown into an in-place reader */
  reading?: boolean;
  /** for notes pinned from a PDF: where the quote came from */
  source?: { pageId: ID; page: number };
}

export interface SpaceEdge {
  id: ID;
  from: ID;
  to: ID;
  dashed?: boolean;
  label?: string;
}

export interface SpaceData {
  cards: SpaceCard[];
  edges: SpaceEdge[];
  camera: Camera;
}

/* ------------------------------------------------------------------ */
/* Whiteboard                                                          */
/* ------------------------------------------------------------------ */

export type ShapeKind = 'rect' | 'ellipse' | 'diamond';

interface BoardBase {
  id: ID;
}

export interface BoardStroke extends BoardBase {
  type: 'stroke';
  stroke: Stroke;
}

export interface BoardShape extends BoardBase {
  type: 'shape';
  shape: ShapeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  fill: boolean;
  text?: string;
}

export interface BoardArrow extends BoardBase {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export interface BoardText extends BoardBase {
  type: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export type BoardElement = BoardStroke | BoardShape | BoardArrow | BoardText;

export interface BoardData {
  elements: BoardElement[];
  camera: Camera;
}

/* ------------------------------------------------------------------ */
/* Notebook                                                            */
/* ------------------------------------------------------------------ */

export type PaperStyle = 'plain' | 'lined' | 'grid' | 'dotted' | 'cornell' | 'music';

export interface NotebookSheet {
  id: ID;
  strokes: Stroke[];
}

export interface NotebookData {
  paper: PaperStyle;
  /** paper tint name, see PAPER_TINTS in features/notebook/paper.ts */
  tint: 'white' | 'ivory' | 'mint' | 'night';
  sheets: NotebookSheet[];
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

export interface PageIcon {
  /** a name from the curated lucide icon set, see components/ui/PageIcon */
  name: string;
  color: string;
}

export interface Page {
  id: ID;
  kind: PageKind;
  title: string;
  icon: PageIcon | null;
  /** cover gradient preset id, see features/page/covers.ts */
  cover: string | null;
  parentId: ID | null;
  /** order among siblings */
  order: number;
  favorite: boolean;
  trashed: boolean;
  createdAt: number;
  updatedAt: number;

  /** TipTap / ProseMirror JSON document */
  doc?: unknown;
  space?: SpaceData;
  board?: BoardData;
  notebook?: NotebookData;
  pdf?: PdfData;
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface PdfHighlight {
  id: ID;
  /** 1-based page number */
  page: number;
  color: HighlightColor;
  text: string;
  /** line rectangles as fractions of the page: [x, y, w, h], each 0..1 */
  rects: [number, number, number, number][];
  note?: string;
  /** the sticky on a space this quote was pinned to, if any */
  pinned?: boolean;
}

export interface PdfData {
  /** the file itself lives in the blob store, see lib/blobs.ts */
  blobId: ID;
  pages: number;
  /** last page the reader was on, 1-based */
  lastPage: number;
  highlights: PdfHighlight[];
}

export type ThemePref = 'light' | 'dark' | 'system';
