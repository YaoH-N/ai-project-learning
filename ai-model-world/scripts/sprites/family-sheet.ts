/**
 * Family-resemblance check: four models per vendor, side by side.
 *
 *   npx tsx scripts/sprites/family-sheet.ts <out.png> [before-dir]
 *
 * With a before-dir it renders two blocks so the change in house colouring can be
 * compared directly. Vendors are the ones with the most models, so the grouping
 * is the same set a visitor actually sees most often.
 */

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { SpriteManifest } from '../../src/lib/sprite/types.ts';
import { CELL, OUT_ROW } from './compose.ts';
import { decode } from './contact-sheet.ts';
import { drawText } from './font.ts';
import { blank, fillRect, type Raster, type Rgba, setPixel } from './raster.ts';

const ROOT = path.resolve(__dirname, '../..');
const ZOOM = 3;
const PANEL = CELL * ZOOM;
const PER_VENDOR = 4;
const VENDORS = 6;
const PAD = 8;
const ROW_LABEL_H = 12;
const BLOCK_HEAD_H = 18;
const HEADER_H = 32;

const BG: Rgba = [17, 17, 25, 255];
const CHECK_A: Rgba = [38, 38, 52, 255];
const CHECK_B: Rgba = [28, 28, 40, 255];
const TEXT: Rgba = [216, 222, 238, 255];
const DIM: Rgba = [132, 140, 166, 255];
const ACCENT: Rgba = [246, 214, 106, 255];
const RULE: Rgba = [56, 58, 78, 255];

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
      const i = (((py / ZOOM) | 0) + OUT_ROW.stand * CELL) * src.width * 4 + (((pxi / ZOOM) | 0) * 4);
      setPixel(dst, x + pxi, y + py, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
    }
  }
}

async function main() {
  const [outFile, beforeDir] = process.argv.slice(2);
  if (!outFile) throw new Error('usage: family-sheet.ts <out.png> [before-dir]');

  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'public/sprites/manifest.json'), 'utf8'),
  ) as SpriteManifest;

  const byVendor = new Map<string, string[]>();
  for (const entry of Object.values(manifest.sprites)) {
    const list = byVendor.get(entry.vendorId) ?? [];
    list.push(entry.slug);
    byVendor.set(entry.vendorId, list);
  }
  const vendors = [...byVendor.entries()]
    .filter(([, list]) => list.length >= PER_VENDOR)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, VENDORS)
    .map(([id, list]) => ({ id, slugs: list.slice(0, PER_VENDOR) }));

  const blocks: { title: string; dir: string }[] = [];
  if (beforeDir) blocks.push({ title: 'BEFORE - COLOUR CHOSEN PER MODEL', dir: beforeDir });
  blocks.push({ title: 'AFTER - HOUSE PALETTE PER VENDOR', dir: path.join(ROOT, 'public/sprites') });

  const width = PAD * 2 + PER_VENDOR * PANEL + (PER_VENDOR - 1) * PAD;
  const blockH = BLOCK_HEAD_H + vendors.length * (PANEL + ROW_LABEL_H);
  const height = HEADER_H + blocks.length * (blockH + PAD) + PAD;
  const sheet = blank(width, height);
  fillRect(sheet, 0, 0, width, height, BG);

  drawText(sheet, 'FAMILY RESEMBLANCE - 4 MODELS PER VENDOR', PAD, 6, ACCENT, 2);
  drawText(sheet, 'HAIR, SKIN AND CLOTH ARE FIXED BY VENDOR; MODEL ID ONLY PICKS WITHIN THE HOUSE PALETTE', PAD, 19, DIM, 1);

  let y = HEADER_H;
  for (const block of blocks) {
    fillRect(sheet, PAD, y - 3, width - PAD * 2, 1, RULE);
    drawText(sheet, block.title, PAD, y + 3, TEXT, 2);
    y += BLOCK_HEAD_H;

    for (const vendor of vendors) {
      // Ramp names describe the current build, so only label the block they
      // actually belong to; captioning the old images with them would lie.
      const ramps = manifest.sprites[vendor.slugs[0]]?.appearance.ramps ?? {};
      const detail = block.dir === beforeDir ? '' : `   HAIR ${ramps.hair ?? '?'}  SKIN ${ramps.body ?? '?'}  CLOTH ${ramps.cloth ?? '?'}`;
      drawText(sheet, `${vendor.id.toUpperCase()}${detail}`, PAD, y + 2, DIM, 1);
      for (const [i, slug] of vendor.slugs.entries()) {
        const file = path.join(block.dir, `${slug}.png`);
        const x = PAD + i * (PANEL + PAD);
        checkerboard(sheet, x, y + ROW_LABEL_H, PANEL, PANEL);
        if (fs.existsSync(file)) paste(sheet, await decode(fs.readFileSync(file)), x, y + ROW_LABEL_H);
      }
      y += PANEL + ROW_LABEL_H;
    }
    y += PAD;
  }

  const png = await sharp(sheet.data, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dest = path.isAbsolute(outFile) ? outFile : path.join(ROOT, outFile);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png);
  console.log(
    `${vendors.length} vendors x ${PER_VENDOR} -> ${path.relative(ROOT, dest)} (${width}x${height}, ${(png.length / 1024).toFixed(0)} KB)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
