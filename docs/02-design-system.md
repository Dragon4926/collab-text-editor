# 02 · Design system

> **Concept:** *Light through glass.* Chrome (sidebars, toolbars, menus) is
> frosted glass floating over a soft ambient glow. Content (documents, notes,
> ink) sits on opaque paper. The accent colour is used sparingly so that when
> it appears, it means something: "selected", "active", "you are here".

The visual concept was explored first as a design board (a Claude Design
canvas: [Lumen — Design Concept](https://claude.ai/artifact/R5GCWMN1G1kjHDaFphNJcz),
private to the project owner unless shared) with four artboards — concept &
tokens, document editor, spatial space and ink notebook — before any code was
written. This document is the written version of that board, and
`src/styles/tokens.css` is its implementation.

```
 Concept & tokens          Document editor
 ┌──────────────────┐      ┌──────────────────────────┐
 │ Light through     │      │ ▢ glass sidebar │ cover  │
 │ glass.            │      │ favorites       │ Title  │
 │ colour·type·depth │      │ spaces          │ blocks │
 └──────────────────┘      └──────────────────────────┘
 Spatial space             Ink notebook
 ┌──────────────────┐      ┌──────────────────────────┐
 │ notes  ──▶ page  │      │   pen case toolbar       │
 │ frame     card   │      │   ┌──────────┐ paper     │
 │ minimap  zoom    │      │   │ lined A4 │ picker    │
 └──────────────────┘      └──────────────────────────┘
```

## Why design tokens?

A *design token* is a named design decision: `--c-accent` instead of
`#5b4cf0`, `--r-lg` instead of `14px`. Tokens give you:

1. **One source of truth.** Change the accent once, every button follows.
2. **Theming for free.** Dark mode re-declares the same names under
   `:root[data-theme='dark']`. Components never contain `if (dark)` logic.
3. **A shared vocabulary** between design and code. The design board and the
   CSS use the same names.

We use plain **CSS custom properties** (variables) rather than a CSS-in-JS
theme object. They cascade, can be changed at runtime, and are readable in the
browser devtools.

## Token groups

| Group | Prefix | Examples | Notes |
|---|---|---|---|
| Typography | `--font-*`, `--text-*` | `--font-ui`, `--text-body` | System SF stack for UI; *Instrument Serif* only for page titles; *JetBrains Mono* for code |
| Surfaces | `--c-desktop`, `--c-canvas`, `--c-paper` … | | Ordered from "far away" to "close to you" |
| Glass | `--c-glass`, `--c-sidebar`, `--blur` | | `--c-glass` is paired with `backdrop-filter: var(--blur)`; the sidebar is a plain translucent fill (see below) |
| Text | `--c-text` … `--c-text-4` | | Four steps of emphasis, like Apple's label colours |
| Lines & fills | `--c-line`, `--c-fill-*` | | Translucent black/white so they work on any surface |
| Accent | `--c-accent*` | `--c-accent-soft` | "Iris" violet-blue |
| Ink palette | `--ink-*` | `--ink-red` | Seven pen colours, Samsung Notes style |
| Sticky notes | `--note-*` | `--note-yellow` | Pastel in light, deep in dark |
| Radius | `--r-*` | `--r-sm` … `--r-xl` | Small radius for small controls, large for windows |
| Shadow | `--shadow-*` | `--shadow-lg` | Layered: a hairline + a soft ambient blur |
| Motion | `--ease-*`, `--dur-*` | | CSS transitions; JS springs live in `src/lib/motion.ts` |

### Translucent lines instead of greys

Borders and hover fills are `rgba(0,0,0,0.08)` rather than a solid grey. A
translucent line looks right on white paper, on the grey canvas and on glass,
because it *darkens whatever is beneath it*. In dark mode we flip to
translucent white.

### The glass recipe

```css
background: var(--c-glass);          /* ~70% opaque tint */
backdrop-filter: var(--blur);        /* saturate(180%) blur(24px) */
```

`saturate()` matters as much as `blur()`: blurring alone makes the background
look muddy; boosting saturation keeps the colours behind the glass vivid,
which is what makes macOS vibrancy feel "lit".

Backdrop blur is for *small, floating* panes. The full-height sidebar sits
over the drifting aurora, so a backdrop filter there would be recomputed
every frame, and under GPU memory pressure Chromium drops such layers,
letting the browser's window colour show through. The sidebar uses a plain
translucent `--c-sidebar` fill instead. The aurora is soft already, so it
looks the same.

Floating glass (toolbars, menus, popovers, the palette) adds one more token:

```css
--glass-edge: inset 0 1px 0 rgba(255,255,255,.65), inset 0 0 0 .5px rgba(255,255,255,.35);
```

a bright top edge and faint rim, as if light catches the pane. It's the
difference between "translucent rectangle" and "piece of glass". Dark mode
dims it to a whisper.

### Layered shadows

Real objects cast a tight contact shadow *and* a wide soft one. A single
`box-shadow` can't do both, so tokens stack two or three:

```css
--shadow-md: 0 1px 2px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.07);
```

## Typography

* **UI & body:** `-apple-system, BlinkMacSystemFont, 'SF Pro Text'…` — on a Mac
  this resolves to San Francisco, the system font, which is the single biggest
  contributor to an app "feeling native".
* **Display:** *Instrument Serif* for page titles only. A serif headline over
  sans body gives documents an editorial warmth (like Apple Notes' or Bear's
  title styles) without hurting readability.
* **Body text** is 16px with `line-height: 1.65` and a max measure of
  `--doc-max-w: 720px` (~75 characters), the classic comfortable reading width.

## Motion

Motion has three jobs here: show *where something came from*, confirm an
action, and add a little delight. It must never block input.

* CSS transitions (`--dur-fast/med/slow`, `--ease-out`) for hover and colour
  changes.
* **Springs** (framer-motion) for anything that moves. See `src/lib/motion.ts`:

| Preset | stiffness / damping | Used for |
|---|---|---|
| `snappy` | 520 / 38 | menus, popovers, toolbars |
| `smooth` | 300 / 30 | sidebar, panels |
| `gentle` | 170 / 24 | page transitions |
| `bouncy` | 420 / 18 | playful confirmations (favourite star) |

Why springs? A duration-based tween restarts from zero velocity when it's
interrupted, which looks jerky. A spring carries its current velocity into the
new target, so rapid interactions (hovering across a list, toggling a panel
twice) stay fluid.

`prefers-reduced-motion` is honoured globally in `global.css`.

## Dark mode

Dark mode is "graphite glass": near-black surfaces with a faint violet cast,
lifted accent (`#8b7dff` — the light accent would be too dark on black), and
heavier shadows (light shadows disappear on dark backgrounds, so the alpha goes
up). The theme is applied by setting `data-theme="dark"` on `<html>`, and
the switch is animated as a blurred cross-fade of the whole window (chapter 10).

Some things depend on the *surface* rather than the theme. A highlighter on
light notebook paper must multiply even in dark mode; on a dark sketch it must
lighten instead. So surfaces set `--hl-blend` / `--hl-opacity` (and
`--ink-black`) themselves, and the theme only provides the defaults.

## Accessibility checklist

* Text tokens `--c-text` → `--c-text-3` all pass 4.5:1 on paper.
  `--c-text-4` is reserved for non-essential hints.
* Every interactive element gets a visible `:focus-visible` ring using
  `--c-focus`.
* Icon-only buttons carry `aria-label`.
