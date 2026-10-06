/**
 * Keyboard conventions — Windows style.
 *
 * Lumen uses the Windows/Linux keyboard vocabulary everywhere: Ctrl is the
 * command modifier, shortcuts are written "Ctrl+Shift+Z", and Ctrl+Y redoes.
 * On a Mac, ⌘ is *also* accepted as Ctrl so muscle memory still works, but
 * every label stays in one consistent Windows notation.
 */

const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Is the command modifier held? Ctrl everywhere, plus ⌘ on Apple keyboards. */
export const isMod = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || (isApple && e.metaKey);

const NAMES: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Del: 'Delete', Esc: 'Esc' };

/** "Mod+Shift+Z" → ["Ctrl", "Shift", "Z"] */
export const shortcutParts = (keys: string) => keys.split('+').map((k) => NAMES[k] ?? k);

/** "Mod+Shift+Z" → "Ctrl+Shift+Z" */
export const shortcut = (keys: string) => shortcutParts(keys).join('+');

/** A tooltip such as "Undo (Ctrl+Z)". */
export const withShortcut = (label: string, keys: string) => `${label} (${shortcut(keys)})`;

/** Ignore single-key shortcuts while the user is typing into a field. */
export const isTyping = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');

/** Redo is Ctrl+Y on Windows, with Ctrl+Shift+Z accepted too. */
export const isRedo = (e: KeyboardEvent) => isMod(e) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'));
export const isUndo = (e: KeyboardEvent) => isMod(e) && !e.shiftKey && e.key.toLowerCase() === 'z';
