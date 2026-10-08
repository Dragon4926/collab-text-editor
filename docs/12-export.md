# 12 · Export & backup

## What you see

The **⋯** menu on a page offers *Export as Markdown* for documents and
*Export as PNG / SVG* for whiteboards and notebooks. The command palette
offers *Export workspace backup* and *Import backup…*.

## Concepts

### Local-first means "your data can leave"

Everything lives in your browser's IndexedDB. That's fast and private, but a
local-first app must also make it easy to get data *out*: in open formats
(Markdown, SVG, PNG) and as a complete backup.

### Serialising documents to Markdown

`src/lib/export/markdown.ts` is a classic recursive serializer:

* **Block nodes** map to Markdown block syntax — `heading` → `## `,
  `blockquote` → `> ` on every line, `codeBlock` → fenced code,
  `taskList` → `- [ ]` / `- [x]`.
* **Text nodes** are wrapped in the syntax of their marks, innermost first:
  `**bold**`, `_italic_`, `~~strike~~`, `==highlight==`, `[text](href)`.
  Inline `code` suppresses other marks, as Markdown requires.
* **Nested lists** pass an indentation prefix down the recursion.
* Callouts become GitHub-style admonitions (`> [!NOTE]`).
* Nodes Markdown can't represent (sketches, voice memos) become readable
  placeholders.

### Rendering ink to SVG — from data, not the DOM

It's tempting to grab `svg.outerHTML`. But on screen, ink depends on CSS
variables (`var(--ink-black)`), classes and blend modes defined in our
stylesheets — none of which exist inside a standalone file.

`src/lib/export/inkSvg.ts` therefore **re-renders from data**, writing every
colour explicitly. The same `strokePath()` used on screen produces the paths,
so exports match what you see.

### SVG → PNG

```
SVG string ─▶ Blob ─▶ object URL ─▶ <img> ─▶ <canvas> (2× scale) ─▶ toBlob('image/png')
```

Drawing at 2× gives crisp images on high-density screens.

### Downloading a Blob

`src/lib/download.ts` uses the classic trick: create an object URL for the
Blob, point a temporary `<a download="name">` at it, click it, then revoke the
URL.

### Backups

A backup is `{ app: 'lumen', version: 1, exportedAt, pages }` as JSON.
A backup is *untrusted input* — it may be hand-edited or come from someone
else — and because the workspace is persisted, one malformed value would
crash Lumen on every launch. So importing rebuilds each page field by field
(`lib/sanitize.ts`): ids must look like ids (and never `__proto__`), colours
must be hex, images must be embedded `data:image/…`, numbers are clamped,
unknown kinds and icons are dropped, and parents that don't exist (or form a
cycle) are reset to the root. Then pages are merged by id. The `version` field
leaves room for future migrations. Voice-memo audio lives in a separate blob
store and isn't included (a good exercise below).

## Try it

1. Include voice memos in backups: read each referenced blob, base64-encode
   it, and restore it on import.
2. Add **Markdown import**: parse headings, lists and paragraphs into
   ProseMirror JSON (or use TipTap's `setContent` with HTML from a Markdown
   library).
3. Export a spatial space to PNG (cards are HTML — try rendering their
   *data* into SVG, as `boardSvg` does).
