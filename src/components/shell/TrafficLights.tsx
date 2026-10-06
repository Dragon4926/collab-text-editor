import { useWorkspace } from '@/store/workspace';
import './TrafficLights.css';

/**
 * The three macOS window buttons. In a browser we can't close or minimise
 * the window, so each light maps to the closest in-app meaning:
 *
 *  red    → close the current page (back to the home screen)
 *  yellow → minimise the sidebar
 *  green  → enter / leave full-screen focus mode
 *
 * Like on macOS, the glyphs only appear while the group is hovered.
 */
export function TrafficLights() {
  const setActive = useWorkspace((s) => s.setActive);
  const setSidebarOpen = useWorkspace((s) => s.setSidebarOpen);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="lights">
      <button type="button" className="lights__btn lights__btn--close" aria-label="Close page" onClick={() => setActive(null)}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
        </svg>
      </button>
      <button type="button" className="lights__btn lights__btn--min" aria-label="Hide sidebar" onClick={() => setSidebarOpen(false)}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 6h6" />
        </svg>
      </button>
      <button type="button" className="lights__btn lights__btn--max" aria-label="Toggle full screen" onClick={toggleFullscreen}>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.5 7.5V3.5h4M8.5 4.5v4h-4" />
        </svg>
      </button>
    </div>
  );
}
