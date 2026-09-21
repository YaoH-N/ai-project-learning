/**
 * Minimal RGBA raster ops. Everything is straight-alpha, non-premultiplied,
 * integer-only — the same input bytes always produce the same output bytes.
 */

export interface Raster {
  width: number;
  height: number;
  data: Buffer;
}

export function blank(width: number, height: number): Raster {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

export function clone(src: Raster): Raster {
  return { width: src.width, height: src.height, data: Buffer.from(src.data) };
}

/** Source-over composite of `src` onto `dst` at the origin, with optional layer alpha. */
export function over(dst: Raster, src: Raster, alpha = 1): void {
  if (dst.width !== src.width || dst.height !== src.height) {
    throw new Error(`size mismatch ${src.width}x${src.height} onto ${dst.width}x${dst.height}`);
  }
  const d = dst.data;
  const s = src.data;
  for (let i = 0; i < s.length; i += 4) {
    const sa = alpha === 1 ? s[i + 3] : Math.round(s[i + 3] * alpha);
    if (sa === 0) continue;
    if (sa === 255) {
      d[i] = s[i];
      d[i + 1] = s[i + 1];
      d[i + 2] = s[i + 2];
      d[i + 3] = 255;
      continue;
    }
    const da = d[i + 3];
    const outA = sa + Math.round((da * (255 - sa)) / 255);
    if (outA === 0) continue;
    for (let c = 0; c < 3; c++) {
      const sc = s[i + c] * sa;
      const dc = (d[i + c] * da * (255 - sa)) / 255;
      d[i + c] = Math.round((sc + dc) / outA);
    }
    d[i + 3] = outA;
  }
}

export function blit(dst: Raster, src: Raster, sx: number, sy: number, w: number, h: number, dx: number, dy: number): void {
  for (let y = 0; y < h; y++) {
    const from = ((sy + y) * src.width + sx) * 4;
    const to = ((dy + y) * dst.width + dx) * 4;
    src.data.copy(dst.data, to, from, from + w * 4);
  }
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tight bounds of non-transparent pixels inside a sub-rectangle, or null if empty. */
export function bounds(src: Raster, rx: number, ry: number, rw: number, rh: number, minAlpha = 8): Box | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let y = 0; y < rh; y++) {
    const row = (ry + y) * src.width;
    for (let x = 0; x < rw; x++) {
      if (src.data[(row + rx + x) * 4 + 3] < minAlpha) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export type Rgba = readonly [number, number, number, number];

export function setPixel(dst: Raster, x: number, y: number, [r, g, b, a]: Rgba): void {
  if (x < 0 || y < 0 || x >= dst.width || y >= dst.height || a === 0) return;
  const i = (y * dst.width + x) * 4;
  if (a === 255) {
    dst.data[i] = r;
    dst.data[i + 1] = g;
    dst.data[i + 2] = b;
    dst.data[i + 3] = 255;
    return;
  }
  const da = dst.data[i + 3];
  const outA = a + Math.round((da * (255 - a)) / 255);
  if (outA === 0) return;
  const src = [r, g, b];
  for (let c = 0; c < 3; c++) {
    dst.data[i + c] = Math.round((src[c] * a + (dst.data[i + c] * da * (255 - a)) / 255) / outA);
  }
  dst.data[i + 3] = outA;
}

export function fillRect(dst: Raster, x: number, y: number, w: number, h: number, color: Rgba): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPixel(dst, x + i, y + j, color);
}
