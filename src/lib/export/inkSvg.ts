import type { BoardElement, NotebookData, Stroke } from '@/store/types';
import { strokePath, unionBounds } from '@/features/ink/geometry';
import { PENS } from '@/features/ink/pens';
import { elementBounds, diamondPath, TEXT_LINE } from '@/features/board/boardModel';
import { PAPER_TINTS, SHEET_H, SHEET_W } from '@/features/notebook/paper';
import { safeColor } from '@/lib/sanitize';

/**
 * Build standalone SVG files from ink data.
 *
 * We don't copy the on-screen DOM: it depends on CSS variables and classes
 * that don't exist outside the app. Instead we re-render from the data with
 * every colour written out explicitly, so the file opens correctly in any
 * viewer (and converts cleanly to PNG).
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function strokeSvg(s: Stroke, black = '#1d1d1f', darkPaper = false) {
  const pen = PENS[s.pen];
  // colours are interpolated into attributes, so only well-formed hex gets through
  const fill = s.color.toLowerCase() === '#1d1d1f' ? black : safeColor(s.color);
  const hl = pen.blend === 'multiply';
  const blend = hl ? ` style="mix-blend-mode:${darkPaper ? 'screen' : 'multiply'}"` : '';
  const opacity = hl && darkPaper ? 0.8 : pen.opacity;
  return `<path d="${strokePath(s)}" fill="${fill}" opacity="${opacity}"${blend}/>`;
}

export function notebookSvg(nb: NotebookData): string {
  const tint = PAPER_TINTS[nb.tint];
  const gap = 40;
  const h = nb.sheets.length * SHEET_H + (nb.sheets.length - 1) * gap;
  const sheets = nb.sheets
    .map((sheet, i) => `<g transform="translate(0 ${i * (SHEET_H + gap)})"><rect width="${SHEET_W}" height="${SHEET_H}" fill="${tint.bg}"/>${sheet.strokes.map((s) => strokeSvg(s, tint.inkBlack, tint.dark)).join('')}</g>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${h}" width="${SHEET_W}" height="${h}">${sheets}</svg>`;
}

export function boardSvg(elements: BoardElement[], background = '#ffffff'): string {
  const box = unionBounds(elements.map(elementBounds)) ?? { x: 0, y: 0, w: 400, h: 300 };
  const pad = 40;
  const x = box.x - pad;
  const y = box.y - pad;
  const w = box.w + pad * 2;
  const h = box.h + pad * 2;
  const font = `font-family="Inter, 'Segoe UI', sans-serif"`;
  const parts = elements.map((el) => {
    switch (el.type) {
      case 'stroke':
        return strokeSvg(el.stroke);
      case 'shape': {
        const fill = el.fill ? `${safeColor(el.color)}29` : 'none'; // 29 hex ≈ 16% alpha
        const attrs = `stroke="${safeColor(el.color)}" stroke-width="2.5" fill="${fill}"`;
        const shape =
          el.shape === 'rect'
            ? `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${Math.min(14, el.w / 4, el.h / 4)}" ${attrs}/>`
            : el.shape === 'ellipse'
              ? `<ellipse cx="${el.x + el.w / 2}" cy="${el.y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" ${attrs}/>`
              : `<path d="${diamondPath(el.x, el.y, el.w, el.h)}" ${attrs}/>`;
        const label = el.text ? `<text x="${el.x + el.w / 2}" y="${el.y + el.h / 2}" fill="${safeColor(el.color)}" font-size="18" font-weight="500" text-anchor="middle" dominant-baseline="central" ${font}>${esc(el.text)}</text>` : '';
        return shape + label;
      }
      case 'arrow': {
        const a = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
        const hd = (d: number) => `${el.x2 - 16 * Math.cos(a + d)},${el.y2 - 16 * Math.sin(a + d)}`;
        return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${safeColor(el.color)}" stroke-width="2.5" stroke-linecap="round"/><polyline points="${hd(0.5)} ${el.x2},${el.y2} ${hd(-0.5)}" fill="none" stroke="${safeColor(el.color)}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      case 'text':
        return `<text x="${el.x}" y="${el.y}" fill="${safeColor(el.color)}" font-size="${el.size}" font-weight="500" ${font}>${el.text
          .split('\n')
          .map((l, i) => `<tspan x="${el.x}" dy="${i === 0 ? el.size : el.size * TEXT_LINE}">${esc(l) || ' '}</tspan>`)
          .join('')}</text>`;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${background}"/>${parts.join('')}</svg>`;
}

/**
 * Rasterise an SVG string to PNG: load it as an <img>, draw it on a canvas
 * at 2× for crisp results on Retina screens, then encode.
 */
export async function svgToPng(svg: string, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
