import { shortcutParts } from '@/lib/keys';
import './ui.css';

export { isMod } from '@/lib/keys';

/**
 * Render a shortcut such as "Mod+K" as Windows-style key caps: [Ctrl] [K].
 */
export function Kbd({ keys }: { keys: string }) {
  return (
    <kbd className="kbd" aria-label={shortcutParts(keys).join(' plus ')}>
      {shortcutParts(keys).map((p, i) => (
        <span key={i} className="kbd__key">
          {p}
        </span>
      ))}
    </kbd>
  );
}
