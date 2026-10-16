/**
 * Optical sizing for the client logo strip: every logo gets the same visual area, not the same height, so a wide
 * wordmark and a compact mark look equally present. Logos printed on a filled box carry more ink for their size, so
 * they get a smaller share. The result is the display width in CSS pixels; the height follows the file's aspect ratio.
 */
export const LOGO_AREA = 2600;
export const LOGO_MAX = { width: 108, height: 48 } as const;
export const BOXED_WEIGHT = 0.7;

export function logoWidth({ width, height, boxed = false }: { width: number; height: number; boxed?: boolean }): number {
  const aspect = width / height;
  const area = LOGO_AREA * (boxed ? BOXED_WEIGHT : 1);
  const h = Math.sqrt(area / aspect);
  const w = h * aspect;
  const scale = Math.min(1, LOGO_MAX.width / w, LOGO_MAX.height / h);
  return Math.round(w * scale);
}
