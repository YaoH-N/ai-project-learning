/**
 * Hand-drawn pixel overlays for the identity traits LPC has no permissively
 * licensed art for: the headset, the paint palette and the key.
 *
 * Placement is measured, not hard-coded: each frame's head and body bounding
 * boxes are read back off the composited sprite, so a headset lands correctly on
 * a child, on a broad adult, under a tall hairstyle, and on all four facings.
 *
 * The state overlays that used to live here — crown, thinking halo, newborn
 * sparkle, fog cloak, retired ghost — are no longer baked. They change with the
 * leaderboard and the calendar, so the site draws them in the DOM over the
 * sprite, positioned from the `anchors` published in the manifest.
 */

import { type Box, fillRect, type Raster, type Rgba, setPixel } from './raster.ts';

export interface FrameCtx {
  raster: Raster;
  /** Frame origin inside `raster`. */
  ox: number;
  oy: number;
  /** Frame-local bounds of the head + hair stack; anchors anything worn on top. */
  head: Box | null;
  /** Frame-local bounds of the bare head; anchors anything at ear height. */
  headCore: Box | null;
  /** Frame-local bounds of the whole character. */
  body: Box | null;
  /** Walk-cycle frame index, used for the sparkle twinkle. */
  frame: number;
}

const GOLD: Rgba[] = [
  [90, 58, 12, 255],
  [196, 148, 40, 255],
  [246, 214, 106, 255],
];
const CUP: Rgba = [38, 40, 52, 255];
const CUP_LIT: Rgba = [110, 118, 140, 255];
const BAND: Rgba = [66, 70, 88, 255];

const px = (c: FrameCtx, x: number, y: number, color: Rgba) => setPixel(c.raster, c.ox + x, c.oy + y, color);
const rect = (c: FrameCtx, x: number, y: number, w: number, h: number, color: Rgba) =>
  fillRect(c.raster, c.ox + x, c.oy + y, w, h, color);

/**
 * Audio models get an over-ear headset. Anchored to the bare head rather than the
 * head + hair box, otherwise a tall hairstyle buries the cups inside the hair.
 */
export function drawHeadphones(c: FrameCtx): void {
  const core = c.headCore ?? c.head;
  if (!core) return;
  const cx = Math.round((core.x0 + core.x1) / 2);
  const left = core.x0;
  const right = core.x1;
  const earY = core.y0 + Math.max(3, Math.round((core.y1 - core.y0 + 1) * 0.45));
  const span = right - left;
  if (span < 3) return;
  // Band arcs over the top of the skull, clearing any hat or hair by a pixel.
  const apex = Math.min(core.y0, c.head ? c.head.y0 + 1 : core.y0) - 1;
  for (let x = 0; x <= span; x++) {
    const t = x / span;
    const y = Math.round(earY - (earY - apex) * Math.sin(Math.PI * t));
    px(c, left + x, y, BAND);
    if (t > 0.15 && t < 0.85) px(c, left + x, y - 1, CUP_LIT);
  }
  for (const cupX of [left - 2, right + 1]) {
    rect(c, cupX, earY - 1, 2, 4, CUP);
    px(c, cupX + (cupX < cx ? 1 : 0), earY, CUP_LIT);
    px(c, cupX + (cupX < cx ? 1 : 0), earY + 1, CUP_LIT);
  }
}

/**
 * Held items exist only on the standing frame: LPC ships no walk-cycle art for
 * anything held in the hand, so carrying them through the walk rows would make
 * them float. Hand position is inferred from the body box.
 */
function hands(c: FrameCtx): { leftX: number; rightX: number; y: number } | null {
  if (!c.body) return null;
  const h = c.body.y1 - c.body.y0;
  return {
    leftX: c.body.x0,
    rightX: c.body.x1,
    y: c.body.y0 + Math.round(h * 0.62),
  };
}

const WOOD: Rgba = [126, 88, 52, 255];
const WOOD_DARK: Rgba = [84, 58, 34, 255];

/** Image generation: a paint palette with a brush, held in the left hand. */
export function drawPaintPalette(c: FrameCtx): void {
  const h = hands(c);
  if (!h) return;
  const x = h.leftX - 3;
  const y = h.y - 1;
  rect(c, x, y, 5, 4, WOOD);
  px(c, x, y, WOOD_DARK);
  px(c, x + 4, y, WOOD_DARK);
  px(c, x, y + 3, WOOD_DARK);
  px(c, x + 1, y + 1, [212, 64, 64, 255]);
  px(c, x + 3, y + 1, [70, 120, 220, 255]);
  px(c, x + 2, y + 2, [240, 208, 72, 255]);
  // Brush tucked against the palette.
  for (let i = 0; i < 4; i++) px(c, x + 5, y - i, WOOD_DARK);
  px(c, x + 5, y - 4, [226, 96, 132, 255]);
}

/** Open weights: a key held in the right hand. */
export function drawKey(c: FrameCtx): void {
  const h = hands(c);
  if (!h) return;
  const x = h.rightX;
  const y = h.y - 3;
  const shape = ['.#.', '#.#', '.#.', '.#.', '.##', '.#.', '.##'];
  for (let r = 0; r < shape.length; r++) {
    for (let col = 0; col < 3; col++) {
      if (shape[r][col] !== '#') continue;
      px(c, x + col, y + r, r <= 1 ? GOLD[2] : GOLD[1]);
    }
  }
  px(c, x + 1, y + shape.length - 1, GOLD[2]);
}
