/**
 * Side-by-side comparison of a sprite change, for visual sign-off.
 *
 *   # stash the current output, make the change, rebuild, then:
 *   npx tsx scripts/sprites/before-after.ts <before-dir> <out.png> [slug ...]
 *
 * Reads the same slugs from `<before-dir>` and from `public/sprites`, blows both
 * up with nearest-neighbour sampling and labels each pair. With no slugs given it
 * compares every PNG present in `<before-dir>`.
 */

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { SpriteManifest } from '../../src/lib/sprite/types.ts';
import { CELL } from './compose.ts';
import { decode } from './contact-sheet.ts';
import { drawText } from './font.ts';
import { blank, fillRect, type Raster, type Rgba, setPixel } from './raster.ts';

const ROOT = path.resolve(__dirname, '../..');
const ZOOM = 4;
const PANEL = CELL * ZOOM;
const GUTTER = 10;
const LABEL_H = 26;
const HEADER_H = 30;

const BG: Rgba = [17, 17, 25, 255];
const CHECK_A: Rgba = [38, 38, 52, 255];
const CHECK_B: Rgba = [28, 28, 40, 255];
const TEXT: Rgba = [216, 222, 238, 255];
const DIM: Rgba = [132, 140, 166, 255];
const ACCENT: Rgba = [246, 214, 106, 255];

function checkerboard(dst: Raster, x: number, y: number, w: number, h: number): void {
  for (let j = 0; j < h; j += 8) {
    for (let i = 0; i < w; i += 8) {
      fillRect(dst, x + i, y + j, Math.min(8, w - i), Math.min(8, h - j), ((i / 8 + j / 8) | 0) % 2 === 0 ? CHECK_A : CHECK_B);
    }
  }
}

function paste(dst: Raster, src: Raster, x: number, y: number): void {
  for (let py = 0; py < PANEL; py++) {
    for (let pxi = 0; pxi < PANEL; pxi++) {
      const i = ((py / ZOOM) | 0) * src.width * 4 + (((pxi / ZOOM) | 0) * 4);
      setPixel(dst, x + pxi, y + py, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
    }
  }
}

/** Which of the three overlays this character actually exercises. */
function changeTags(manifest: SpriteManifest, slug: string): string {
  const a = manifest.sprites[slug]?.appearance;
  if (!a) return '';
  return [
    a.flags.opaqueParams ? 'FOG' : '',
    a.flags.haloLayers > 0 ? `HALO x${a.flags.haloLayers}` : '',
    a.flags.fresh ? 'SPARKLE' : '',
  ]
    .filter(Boolean)
    .join('  ');
}

async function main() {
  const [beforeDir, outFile, ...slugArgs] = process.argv.slice(2);
  if (!beforeDir || !outFile) {
    throw new Error('usage: before-after.ts <before-dir> <out.png> [slug ...]');
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/sprites/manifest.json'), 'utf8'),
  ) as SpriteManifest;

  const slugs =
    slugArgs.length > 0
      ? slugArgs
      : fs
          .readdirSync(beforeDir)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.replace(/\.png$/, ''))
          .sort();

  const width = GUTTER + PANEL * 2 + GUTTER * 2;
  const height = HEADER_H + slugs.length * (PANEL + LABEL_H) + GUTTER;
  const sheet = blank(width, height);
  fillRect(sheet, 0, 0, width, height, BG);

  drawText(sheet, 'SPRITE OVERLAY FIX - BEFORE / AFTER', GUTTER, 6, ACCENT, 2);
  drawText(sheet, 'FOG: DOT ROWS -> DITHERED VAPOUR   HALO: SAUCER -> NESTED RINGS   NEW: PLUS -> FOUR-POINT STAR', GUTTER, 19, DIM, 1);

  let y = HEADER_H;
  for (const slug of slugs) {
    const beforePath = path.join(beforeDir, `${slug}.png`);
    const afterPath = path.join(ROOT, 'public/sprites', `${slug}.png`);
    if (!fs.existsSync(beforePath) || !fs.existsSync(afterPath)) {
      console.warn(`[skip] ${slug}`);
      continue;
    }
    const before = await decode(
      await sharp(beforePath).extract({ left: 0, top: 0, width: CELL, height: CELL }).png().toBuffer(),
    );
    const after = await decode(
      await sharp(afterPath).extract({ left: 0, top: 0, width: CELL, height: CELL }).png().toBuffer(),
    );

    for (const [i, img] of [before, after].entries()) {
      const x = GUTTER + i * (PANEL + GUTTER);
      checkerboard(sheet, x, y, PANEL, PANEL);
      paste(sheet, img, x, y);
      drawText(sheet, i === 0 ? 'BEFORE' : 'AFTER', x + 2, y + 2, i === 0 ? DIM : ACCENT, 2);
    }
    drawText(sheet, slug.slice(0, 46), GUTTER, y + PANEL + 4, TEXT, 2);
    drawText(sheet, changeTags(manifest, slug), GUTTER, y + PANEL + 15, DIM, 1);
    y += PANEL + LABEL_H;
  }

  const png = await sharp(sheet.data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dest = path.isAbsolute(outFile) ? outFile : path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
  console.log(`${slugs.length} pairs -> ${path.relative(ROOT, dest)} (${width}x${height}, ${(png.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
