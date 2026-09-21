/**
 * `CharacterSpec` → sprite sheet PNG.
 *
 * Output grid is 9 × 5 cells of 64 px (576 × 320):
 *   row 0 — standing frame, facing the camera (only column 0 is used)
 *   row 1 — walk up      row 2 — walk left
 *   row 3 — walk down    row 4 — walk right
 *
 * LPC's own walk sheet is 9 × 4 (up / left / down / right), and its frame 0 is a
 * neutral standing pose, which is what row 0 is copied from.
 */

import sharp from 'sharp';

import type { LpcCatalog, LayerRef } from './catalog.ts';
import { drawHeadphones, drawKey, drawPaintPalette, type FrameCtx } from './overlays.ts';
import type { SpriteAnchors } from '../../src/lib/sprite/types.ts';
import type { RampChoice } from './palette.ts';
import { blank, blit, type Box, bounds, over, type Raster } from './raster.ts';
import type { CharacterSpec } from './spec.ts';

export const CELL = 64;
export const COLUMNS = 9;
export const SRC_ROWS = 4;
export const OUT_ROWS = 5;
export const SRC_W = CELL * COLUMNS;
export const SRC_H = CELL * SRC_ROWS;
export const OUT_W = SRC_W;
export const OUT_H = CELL * OUT_ROWS;

/** Row index inside the source LPC walk sheet. */
const SRC_ROW = { up: 0, left: 1, down: 2, right: 3 } as const;
/** Row index inside our output sheet. */
export const OUT_ROW = { stand: 0, up: 1, left: 2, down: 3, right: 4 } as const;

/** Layers excluded when measuring the character's own silhouette. */
const NOT_SILHOUETTE = new Set(['shadow', 'cape']);
/** Layers that make up the head cluster, used to place crowns and headsets. */
const HEAD_CLUSTER = new Set(['head', 'hair', 'ears', 'headwear']);

export interface ComposeResult {
  png: Buffer;
  layerCount: number;
  /** Layers requested by the spec that had no sheet for this body type. */
  dropped: string[];
  /** Where to hang the un-baked state overlays, in standing-frame pixels. */
  anchors: SpriteAnchors;
}

export async function compose(spec: CharacterSpec, catalog: LpcCatalog): Promise<ComposeResult> {
  const resolved: { slot: string; ref: LayerRef; alpha: number; ramps: RampChoice }[] = [];
  const dropped: string[] = [];

  for (const p of spec.picks) {
    const item = catalog.get(p.itemId);
    if (!item) {
      dropped.push(`${p.slot}:${p.itemId}`);
      continue;
    }
    const refs = catalog.refs(item, spec.body, p.variant ?? undefined);
    if (refs.length === 0) {
      dropped.push(`${p.slot}:${p.itemId}`);
      continue;
    }
    const ramps = p.ramps ? { ...spec.ramps, ...p.ramps } : spec.ramps;
    for (const ref of refs) resolved.push({ slot: p.slot, ref, alpha: p.alpha, ramps });
  }
  // Stable sort keeps the spec's own ordering for equal zPos.
  resolved.sort((a, b) => a.ref.zPos - b.ref.zPos);

  const full = blank(SRC_W, SRC_H);
  const silhouette = blank(SRC_W, SRC_H);
  const head = blank(SRC_W, SRC_H);
  const headCore = blank(SRC_W, SRC_H);

  for (const { slot, ref, alpha, ramps } of resolved) {
    const layer = await catalog.render(ref, ramps);
    if (layer.width !== SRC_W || layer.height !== SRC_H) {
      dropped.push(`${slot}:${ref.sheet}(${layer.width}x${layer.height})`);
      continue;
    }
    over(full, layer, alpha);
    if (!NOT_SILHOUETTE.has(slot)) over(silhouette, layer, alpha);
    if (HEAD_CLUSTER.has(slot)) over(head, layer, alpha);
    if (slot === 'head') over(headCore, layer, alpha);
  }

  // Only identity overlays are baked. Crown, halo, sparkle, fog and ghost are
  // state — they change with the leaderboard and the calendar, not with the model
  // — so they are drawn by the site over the sprite and are absent here. See
  // `overlaysBaked` in the manifest.
  const { flags } = spec;
  if (flags.audio) {
    for (let row = 0; row < SRC_ROWS; row++) {
      for (let col = 0; col < COLUMNS; col++) {
        const ox = col * CELL;
        const oy = row * CELL;
        drawHeadphones({
          raster: full,
          ox,
          oy,
          head: bounds(head, ox, oy, CELL, CELL),
          headCore: bounds(headCore, ox, oy, CELL, CELL),
          body: bounds(silhouette, ox, oy, CELL, CELL),
          frame: col,
        });
      }
    }
  }

  const out = blank(OUT_W, OUT_H);
  blit(out, full, 0, 0, SRC_W, SRC_H, 0, CELL);
  blit(out, full, 0, SRC_ROW.down * CELL, CELL, CELL, 0, 0);

  const standCtx: FrameCtx = {
    raster: out,
    ox: 0,
    oy: 0,
    head: bounds(head, 0, SRC_ROW.down * CELL, CELL, CELL),
    headCore: bounds(headCore, 0, SRC_ROW.down * CELL, CELL, CELL),
    body: bounds(silhouette, 0, SRC_ROW.down * CELL, CELL, CELL),
    frame: 0,
  };
  if (flags.imageOut) drawPaintPalette(standCtx);
  if (flags.openWeights) drawKey(standCtx);

  const png = await sharp(out.data, { raw: { width: OUT_W, height: OUT_H, channels: 4 } })
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false })
    .toBuffer();

  return {
    png,
    layerCount: resolved.length,
    dropped,
    anchors: {
      head: toBox(standCtx.head),
      skull: toBox(standCtx.headCore ?? standCtx.head),
      body: toBox(standCtx.body),
    },
  };
}

function toBox(box: Box | null): SpriteAnchors['head'] {
  if (!box) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: box.x0, y: box.y0, width: box.x1 - box.x0 + 1, height: box.y1 - box.y0 + 1 };
}

/** Bottom-aligned single-cell crop, used by the contact sheet. */
export function standFrame(sheet: Raster): Raster {
  const cell = blank(CELL, CELL);
  blit(cell, sheet, 0, 0, CELL, CELL, 0, 0);
  return cell;
}
