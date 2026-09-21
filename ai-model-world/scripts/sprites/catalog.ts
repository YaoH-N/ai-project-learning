/**
 * Reads the vendored LPC subset and hands out decoded, recoloured sheets.
 * Nothing here touches the network; `assets/lpc/` is the only input.
 */

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import type { BodyType, Catalog, CatalogItem, Material } from './lpc-schema.ts';
import { applyLut, Palettes, type RampChoice } from './palette.ts';
import type { Raster } from './raster.ts';

export const ASSET_ROOT = path.resolve(__dirname, '../../assets/lpc');

/** One resolved draw instruction: a sheet on disk plus where it sits in the stack. */
export interface LayerRef {
  itemId: string;
  type: string;
  zPos: number;
  /** Path relative to `assets/lpc/sheets/`. */
  sheet: string;
  recolor: Material[] | null;
}

export class LpcCatalog {
  readonly data: Catalog;
  readonly palettes: Palettes;
  private readonly byType = new Map<string, CatalogItem[]>();
  private readonly byId = new Map<string, CatalogItem>();
  private readonly cache = new Map<string, Raster>();

  private constructor(data: Catalog) {
    this.data = data;
    this.palettes = new Palettes(data.palettes);
    for (const item of data.items) {
      this.byId.set(item.id, item);
      const list = this.byType.get(item.type);
      if (list) list.push(item);
      else this.byType.set(item.type, [item]);
    }
  }

  static load(): LpcCatalog {
    const file = path.join(ASSET_ROOT, 'catalog.json');
    if (!fs.existsSync(file)) {
      throw new Error(`missing ${file} — run: npx tsx scripts/sprites/fetch-lpc.ts`);
    }
    return new LpcCatalog(JSON.parse(fs.readFileSync(file, 'utf8')) as Catalog);
  }

  /** Items of a category that have art for the given body type, in stable order. */
  options(type: string, body: BodyType): CatalogItem[] {
    return (this.byType.get(type) ?? [])
      .filter((item) => item.layers.some((l) => l.dirs[body]))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): CatalogItem | null {
    return this.byId.get(id) ?? null;
  }

  /**
   * Expand an item into per-layer sheet references for one body type.
   * `variant` names a pre-coloured folder; ignored by recolour-based items.
   */
  refs(item: CatalogItem, body: BodyType, variant?: string): LayerRef[] {
    const out: LayerRef[] = [];
    for (const layer of item.layers) {
      const dir = layer.dirs[body];
      if (!dir) continue;
      // A handful of colour folders exist for one body type but not another, so
      // fall back through the remaining colours rather than dropping the layer.
      const candidates =
        item.variants && item.variants.length > 0
          ? [variant, ...item.variants]
              .filter((v): v is string => typeof v === 'string' && item.variants!.includes(v))
              .map((v) => `${dir}/walk/${v}.png`)
          : [`${dir}/walk.png`];
      const sheet = candidates.find((s) => fs.existsSync(path.join(ASSET_ROOT, 'sheets', s)));
      if (!sheet) continue;
      out.push({ itemId: item.id, type: item.type, zPos: layer.zPos, sheet, recolor: item.recolor });
    }
    return out;
  }

  /** Decoded sheet, cached. Callers must not mutate the returned buffer. */
  private async raw(sheet: string): Promise<Raster> {
    const hit = this.cache.get(sheet);
    if (hit) return hit;
    const { data, info } = await sharp(path.join(ASSET_ROOT, 'sheets', sheet))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raster: Raster = { width: info.width, height: info.height, data };
    this.cache.set(sheet, raster);
    return raster;
  }

  /** A private, recoloured copy of a sheet, ready to composite. */
  async render(ref: LayerRef, choice: RampChoice): Promise<Raster> {
    const base = await this.raw(ref.sheet);
    const copy: Raster = { width: base.width, height: base.height, data: Buffer.from(base.data) };
    if (ref.recolor) {
      const lut = this.palettes.lut(ref.recolor, choice);
      if (lut) applyLut(copy.data, lut);
    }
    return copy;
  }
}
