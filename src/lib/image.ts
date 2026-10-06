/**
 * Read an image file into a data URL, downscaling large photos first.
 *
 * Everything is stored in IndexedDB as JSON, so a 12-megapixel photo would
 * bloat the workspace by several megabytes. Drawing it onto a <canvas> at a
 * capped size and re-encoding as WebP keeps it sharp on screen but small.
 */
export async function readImageFile(file: File, maxSide = 1600): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const src = canvas.toDataURL('image/webp', 0.86);
    // display size on the canvas: at most 360 units wide
    const display = Math.min(1, 360 / w);
    return { src, w: Math.round(w * display), h: Math.round(h * display) };
  } finally {
    URL.revokeObjectURL(url);
  }
}
