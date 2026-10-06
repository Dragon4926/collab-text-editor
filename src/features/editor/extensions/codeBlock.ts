import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

/**
 * Syntax-highlighted code blocks.
 *
 * lowlight is highlight.js packaged as a virtual syntax tree instead of an
 * HTML string. The extension turns that tree into ProseMirror *decorations*
 * (styling that sits on top of the document without changing it), so
 * highlighting never pollutes the stored content.
 *
 * `common` registers ~35 popular languages and auto-detection.
 */
const lowlight = createLowlight(common);

export const CodeBlock = CodeBlockLowlight.configure({
  lowlight,
  defaultLanguage: null,
  HTMLAttributes: { spellcheck: 'false' },
});
