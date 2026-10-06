import './ui.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** The platform's primary modifier symbol: ⌘ on Apple devices, Ctrl elsewhere. */
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Render a keyboard shortcut like "Mod+K" using platform-appropriate glyphs. */
export function Kbd({ keys }: { keys: string }) {
  const parts = keys
    .split('+')
    .map((k) => (k === 'Mod' ? MOD : k === 'Shift' ? '⇧' : k === 'Alt' ? (isMac ? '⌥' : 'Alt') : k));
  return (
    <kbd className="kbd">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </kbd>
  );
}

/** True when the platform modifier (⌘ or Ctrl) is held for this event. */
export const isMod = (e: { metaKey: boolean; ctrlKey: boolean }) => (isMac ? e.metaKey : e.ctrlKey);
