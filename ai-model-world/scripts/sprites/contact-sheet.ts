/**
 * QA contact sheet — one image that answers, at a glance:
 *   · does the whole cast share one art style?  (native-resolution tile grid)
 *   · are the five size tiers actually distinguishable?  (size ladder)
 *   · are the five richness tiers distinguishable?  (price ladder)
 *   · does every attribute overlay render?  (state matrix)
 *   · do the walk frames line up?  (walk strips)
 *
 * The ladders and the state matrix vary exactly one input at a time, so any
 * difference visible in them is caused by that input and nothing else.
 */

import sharp from 'sharp';

import { CELL, COLUMNS, OUT_ROW } from './compose.ts';
import { drawText } from './font.ts';
import { blank, fillRect, type Raster, type Rgba, setPixel } from './raster.ts';
import type { SpriteRow } from '../../src/lib/sprite/types.ts';

const CARD_SCALE = 3;
const CARD_COLS = 8;
const PAD = 8;
const LABEL_H = 22;
const CARD_W = CELL * CARD_SCALE + PAD;
const CARD_H = CELL * CARD_SCALE + LABEL_H;
const TILE_COLS = 24;
const TILE_W = CELL + 2;
const TILE_H = CELL + 2;
const HEADER_H = 40;
const SECTION_H = 20;
const SHEET_W = CARD_COLS * CARD_W + PAD;

const BG: Rgba = [17, 17, 25, 255];
const CHECK_A: Rgba = [38, 38, 52, 255];
const CHECK_B: Rgba = [28, 28, 40, 255];
const TILE_BG_A: Rgba = [32, 32, 45, 255];
const TILE_BG_B: Rgba = [24, 24, 35, 255];
const TEXT: Rgba = [216, 222, 238, 255];
const DIM: Rgba = [132, 140, 166, 255];
const ACCENT: Rgba = [246, 214, 106, 255];
const RULE: Rgba = [56, 58, 78, 255];

export interface Card {
  sheet: Raster;
  title: string;
  subtitle: string;
}

export type Section =
  | { kind: 'cards'; heading: string; cards: Card[] }
  | { kind: 'tiles'; heading: string; tiles: Raster[] }
  | { kind: 'strip'; heading: string; sheet: Raster; rows: SpriteRow[] };

function scaleCell(src: Raster, sx: number, sy: number, scale: number): Raster {
  const out = blank(CELL * scale, CELL * scale);
  for (let y = 0; y < CELL * scale; y++) {
    for (let x = 0; x < CELL * scale; x++) {
      const i = ((sy + ((y / scale) | 0)) * src.width + sx + ((x / scale) | 0)) * 4;
      const o = (y * out.width + x) * 4;
      out.data[o] = src.data[i];
      out.data[o + 1] = src.data[i + 1];
      out.data[o + 2] = src.data[i + 2];
      out.data[o + 3] = src.data[i + 3];
    }
  }
  return out;
}

function paste(dst: Raster, src: Raster, x: number, y: number): void {
  for (let py = 0; py < src.height; py++) {
    for (let px = 0; px < src.width; px++) {
      const i = (py * src.width + px) * 4;
      setPixel(dst, x + px, y + py, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
    }
  }
}

/** Transparency grid, so the semi-transparent ghost and fog states are readable. */
function checkerboard(dst: Raster, x: number, y: number, w: number, h: number, step = 6): void {
  for (let j = 0; j < h; j += step) {
    for (let i = 0; i < w; i += step) {
      const c = ((i / step + j / step) | 0) % 2 === 0 ? CHECK_A : CHECK_B;
      fillRect(dst, x + i, y + j, Math.min(step, w - i), Math.min(step, h - j), c);
    }
  }
}

function sectionHeight(s: Section): number {
  if (s.kind === 'cards') return SECTION_H + Math.ceil(s.cards.length / CARD_COLS) * CARD_H;
  if (s.kind === 'tiles') return SECTION_H + Math.ceil(s.tiles.length / TILE_COLS) * TILE_H;
  return SECTION_H + s.rows.length * (CELL + 3);
}

export async function renderContactSheet(sections: Section[], meta: string[]): Promise<Buffer> {
  const height = HEADER_H + sections.reduce((a, s) => a + sectionHeight(s), 0) + PAD * 2;
  const sheet = blank(SHEET_W, height);
  fillRect(sheet, 0, 0, SHEET_W, height, BG);

  drawText(sheet, 'AI MODEL WORLD - SPRITE CONTACT SHEET', PAD, 6, ACCENT, 2);
  meta.forEach((line, i) => drawText(sheet, line, PAD, 19 + i * 7, DIM, 1));

  let y = HEADER_H;
  for (const section of sections) {
    fillRect(sheet, PAD, y - 3, SHEET_W - PAD * 2, 1, RULE);
    drawText(sheet, section.heading, PAD, y + 4, TEXT, 2);
    y += SECTION_H;

    if (section.kind === 'cards') {
      section.cards.forEach((card, i) => {
        const cx = PAD + (i % CARD_COLS) * CARD_W;
        const cy = y + Math.floor(i / CARD_COLS) * CARD_H;
        checkerboard(sheet, cx, cy, CELL * CARD_SCALE, CELL * CARD_SCALE);
        paste(sheet, scaleCell(card.sheet, 0, OUT_ROW.stand * CELL, CARD_SCALE), cx, cy);
        drawText(sheet, card.title.slice(0, 23), cx + 1, cy + CELL * CARD_SCALE + 3, TEXT, 2);
        drawText(sheet, card.subtitle.slice(0, 47), cx + 1, cy + CELL * CARD_SCALE + 13, DIM, 1);
      });
    } else if (section.kind === 'tiles') {
      section.tiles.forEach((tile, i) => {
        const cx = PAD + (i % TILE_COLS) * TILE_W;
        const cy = y + Math.floor(i / TILE_COLS) * TILE_H;
        fillRect(sheet, cx, cy, CELL, CELL, i % 2 === 0 ? TILE_BG_A : TILE_BG_B);
        paste(sheet, scaleCell(tile, 0, OUT_ROW.stand * CELL, 1), cx, cy);
      });
    } else {
      section.rows.forEach((row, r) => {
        const cy = y + r * (CELL + 3);
        checkerboard(sheet, PAD, cy, CELL * COLUMNS, CELL);
        for (let col = 0; col < COLUMNS; col++) {
          paste(sheet, scaleCell(section.sheet, col * CELL, OUT_ROW[row] * CELL, 1), PAD + col * CELL, cy);
        }
        drawText(sheet, String(row).toUpperCase(), PAD + CELL * COLUMNS + 6, cy + CELL / 2 - 2, DIM, 1);
      });
    }
    y += sectionHeight(section) - SECTION_H;
  }

  return sharp(sheet.data, { raw: { width: SHEET_W, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Decode a PNG buffer back to RGBA so the contact sheet can sample it. */
export async function decode(png: Buffer): Promise<Raster> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}
