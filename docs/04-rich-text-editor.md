# 04 · The block editor

## What you see

A Notion-style document: type `/` for a menu of blocks, use Markdown
shortcuts (`## `, `- `, `[] `, `> `, ` ``` `), select text for a floating
formatting toolbar, and insert callouts, code, images, sub-pages, handwriting
sketches and voice memos.

## Concepts

### ProseMirror's document model

TipTap is a friendly layer over [ProseMirror](https://prosemirror.net). Three
ideas from ProseMirror explain almost everything:

1. **The document is a tree of typed nodes.**

   ```
   doc
    ├─ heading (level 2)  ─ text "This week"
    ├─ taskList
    │   └─ taskItem (checked: false) ─ paragraph ─ text "Sketch the canvas"
    └─ paragraph ─ text "Ship it" [mark: bold]
   ```

   Text formatting (bold, link, highlight) is not nesting — it's **marks**
   attached to text.

2. **A schema says what's allowed.** Each node type declares its group and
   content (`content: 'paragraph+'` = one or more paragraphs). The editor can
   never produce an invalid document — paste HTML and it gets *parsed* into
   valid nodes.

3. **Every change is a transaction.** Edits create a new immutable document
   from the old one. That's why undo, collaborative editing and our "save on
   update" are straightforward.

We store `editor.getJSON()` — the tree as plain JSON — in the page. On mount we
pass it back as `content`. See `src/features/editor/DocEditor.tsx`.

> **Why not keep store and editor in sync both ways?** Feeding the store back
> into the editor on every keystroke would reset the cursor. The editor is the
> source of truth *while open*; the store is updated from it.

### Extensions

An editor is the sum of its extensions (`src/features/editor/extensions/index.ts`).
Each can add node/mark types, **input rules** (regexes that fire as you type,
e.g. `^## $` → heading), keyboard shortcuts and ProseMirror plugins.

### The slash menu: bridging a plugin to React

TipTap's `Suggestion` utility watches for a trigger character and reports the
typed query and its document range through callbacks (`onStart`,
`onUpdate`, `onKeyDown`, `onExit`). It renders nothing.

Many examples mount a *second* React root for the popup. We use a simpler
bridge (`extensions/SlashCommand.ts`):

```
Suggestion callbacks ──setState──▶ tiny zustand store ──▶ <SlashMenu/> (normal React)
```

`onKeyDown` reads the store to move the highlight and returns `true` to tell
ProseMirror "handled — don't insert a newline". Commands are ranked by a small
scorer: title prefix > title substring > keyword prefix (`commands.ts`).

Each command runs as one **chain**:

```ts
editor.chain().focus().deleteRange(range).toggleTaskList().run();
```

Chaining batches steps into a single transaction, so one Ctrl+Z undoes the whole
thing including the deletion of `/todo`.

### The bubble toolbar and `useEditorState`

TipTap 3 doesn't re-render React on every transaction (too slow). To show
which marks are active, `BubbleToolbar.tsx` uses `useEditorState` with a
selector — exactly the zustand idea from chapter 03, applied to the editor:

```ts
const state = useEditorState({ editor, selector: ({ editor }) => ({ bold: editor.isActive('bold'), … }) });
```

Sub-panels (link input, highlight swatches) float *above* the bar so they
never cover the selected text.

### Custom nodes and node views

| Node | File | Notes |
|---|---|---|
| Callout | `extensions/Callout.tsx` | `content: 'paragraph+'` — editable children inside a styled box |
| Sketch | `extensions/SketchBlock.tsx` | **atom**: strokes live in attributes |
| Voice memo | `extensions/VoiceMemo.tsx` | atom: blob id + duration + waveform peaks |
| Page link | `extensions/PageLink.tsx` | atom: only the target page id |
| Image | `extensions/media.ts` | TipTap Image + paste/drop plugin |

A **node view** renders a node with a React component. `NodeViewContent`
marks where ProseMirror renders editable children (callout); atoms have none.
For the ink and audio blocks we pass `stopEvent: () => true` so ProseMirror
leaves pointer events to our component instead of treating a pen stroke as a
text selection.

`PageLink` stores only an id and *subscribes* to that page in the store —
rename the target and every link updates instantly. Never copy data you can
reference.

### Voice memos: the Web Audio pipeline

```
mic ─▶ MediaStream ─┬─▶ MediaRecorder ─▶ Blob ─▶ IndexedDB (blob store)
                    └─▶ AnalyserNode ─▶ RMS every 60 ms ─▶ waveform peaks
```

RMS (root mean square) of the samples approximates loudness. Peaks are
resampled to a fixed number of bars and saved in the node, so the waveform
renders without decoding audio.

### Paste and drop

`media.ts` registers a ProseMirror plugin with `handlePaste` / `handleDrop`.
Returning `true` means "handled". We downscale the image, then dispatch a
transaction inserting an `image` node (at the drop point via
`view.posAtCoords`).

## Try it

1. Add a **Toggle** block (a collapsible section): a node with a `summary`
   attribute and `content: 'block+'`, rendered by a node view with a chevron.
2. Add a slash command "Today's date" that inserts the formatted date.
3. Inspect a document in IndexedDB and find the `sketch` node's strokes.
