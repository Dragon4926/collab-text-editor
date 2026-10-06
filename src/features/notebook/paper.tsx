import type { NotebookData, PaperStyle } from '@/store/types';

/**
 * Paper templates, drawn as SVG <pattern>s underneath the ink.
 *
 * A <pattern> describes one tile (e.g. one 32px band with a line at the
 * bottom); filling a rect with `url(#pattern)` repeats it across the sheet.
 * Because the paper lives in the same SVG as the ink, exporting the SVG
 * exports the lines too.
 */

export const SHEET_W = 794; // A4 at 96 dpi
export const SHEET_H = 1123;

export const PAPER_TINTS: Record<NotebookData['tint'], { label: string; bg: string; line: string; margin: string; inkBlack: string }> = {
  white: { label: 'White', bg: '#ffffff', line: 'rgba(70, 110, 190, 0.2)', margin: 'rgba(229, 72, 77, 0.35)', inkBlack: '#1d1d1f' },
  ivory: { label: 'Ivory', bg: '#fffcf3', line: 'rgba(120, 100, 60, 0.2)', margin: 'rgba(229, 72, 77, 0.3)', inkBlack: '#1d1d1f' },
  mint: { label: 'Mint', bg: '#f1faf4', line: 'rgba(40, 130, 90, 0.2)', margin: 'rgba(229, 72, 77, 0.3)', inkBlack: '#1d1d1f' },
  night: { label: 'Night', bg: '#1f2024', line: 'rgba(255, 255, 255, 0.1)', margin: 'rgba(255, 120, 120, 0.3)', inkBlack: '#f2f2f5' },
};

export const PAPERS: { id: PaperStyle; label: string }[] = [
  { id: 'plain', label: 'Plain' },
  { id: 'lined', label: 'Lined' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'cornell', label: 'Cornell' },
  { id: 'music', label: 'Music' },
];

const LINE = 32;

export function PaperPattern({ style, tint, id, width = SHEET_W, height = SHEET_H }: { style: PaperStyle; tint: NotebookData['tint']; id: string; width?: number; height?: number }) {
  const t = PAPER_TINTS[tint];
  return (
    <g className="paper" aria-hidden="true">
      <defs>
        <pattern id={`${id}-lined`} width={width} height={LINE} patternUnits="userSpaceOnUse" y={96 % LINE}>
          <line x1="0" x2={width} y1={LINE - 0.5} y2={LINE - 0.5} stroke={t.line} strokeWidth="1" />
        </pattern>
        <pattern id={`${id}-grid`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke={t.line} strokeWidth="0.8" />
        </pattern>
        <pattern id={`${id}-dotted`} width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1.3" fill={t.line} opacity="1.6" />
        </pattern>
        <pattern id={`${id}-music`} width={width} height="120" patternUnits="userSpaceOnUse" y="40">
          {[0, 1, 2, 3, 4].map((i) => (
            <line key={i} x1="56" x2={width - 56} y1={30 + i * 10} y2={30 + i * 10} stroke={t.line} strokeWidth="1" />
          ))}
        </pattern>
      </defs>

      <rect width={width} height={height} fill={t.bg} />

      {style === 'lined' && (
        <>
          <rect y="96" width={width} height={height - 96} fill={`url(#${id}-lined)`} />
          <line x1="80" x2="80" y1="0" y2={height} stroke={t.margin} strokeWidth="1.2" />
        </>
      )}
      {style === 'grid' && <rect width={width} height={height} fill={`url(#${id}-grid)`} />}
      {style === 'dotted' && <rect width={width} height={height} fill={`url(#${id}-dotted)`} />}
      {style === 'music' && <rect width={width} height={height} fill={`url(#${id}-music)`} />}
      {style === 'cornell' && (
        <>
          {/* Cornell notes: cue column, notes area, summary band */}
          <rect y="128" width={width} height={height - 360} fill={`url(#${id}-lined)`} />
          <line x1="0" x2={width} y1="128" y2="128" stroke={t.margin} strokeWidth="1.5" />
          <line x1="220" x2="220" y1="128" y2={height - 232} stroke={t.margin} strokeWidth="1.5" />
          <line x1="0" x2={width} y1={height - 232} y2={height - 232} stroke={t.margin} strokeWidth="1.5" />
          <text x="24" y="156" className="paper__label" fill={t.line}>
            CUES
          </text>
          <text x="244" y="156" className="paper__label" fill={t.line}>
            NOTES
          </text>
          <text x="24" y={height - 204} className="paper__label" fill={t.line}>
            SUMMARY
          </text>
        </>
      )}
    </g>
  );
}
