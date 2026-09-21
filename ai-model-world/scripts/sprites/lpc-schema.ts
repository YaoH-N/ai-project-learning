/**
 * Shape of the vendored LPC subset in `assets/lpc/`.
 *
 * The upstream project (LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator)
 * ships GPL-3.0 code plus multi-licensed art. We consume none of its code — only the
 * JSON metadata and the PNG sheets whose credit entry offers CC0 or OGA-BY.
 */

/** LPC body frames we are allowed to use (`muscular` / `pregnant` are CC-BY-SA only). */
export type BodyType = 'child' | 'teen' | 'female' | 'male';

export const BODY_TYPES: readonly BodyType[] = ['child', 'teen', 'female', 'male'];

/** Palette materials referenced by `recolors`. */
export type Material = 'body' | 'cloth' | 'eye' | 'hair' | 'metal' | 'wood';

export interface CatalogLayer {
  /** Upstream stacking order; lower draws first. */
  zPos: number;
  /** Body type → sheet directory relative to `assets/lpc/sheets/`. */
  dirs: Partial<Record<BodyType, string>>;
}

export interface CatalogCredit {
  /** Upstream asset directory the credit applies to. */
  file: string;
  authors: string[];
  /** Full upstream license list, kept verbatim for auditability. */
  licenses: string[];
  /** The permissive option we elect to comply with. */
  chosen: string;
  urls: string[];
}

export interface CatalogItem {
  /** Sheet-definition path without extension, e.g. `hair/long/hair_braid`. */
  id: string;
  name: string;
  /** Upstream `type_name`, e.g. `hair`, `clothes`, `facial_eyes`. */
  type: string;
  layers: CatalogLayer[];
  /** Colour folder names, when the item ships pre-coloured sheets. */
  variants: string[] | null;
  /** One material per colour slot, when the item is recoloured from a base ramp. */
  recolor: Material[] | null;
  credits: CatalogCredit[];
}

export interface PaletteBook {
  /** material → ramp name → ordered hex shades. */
  ramps: Record<string, Record<string, string[]>>;
  /** material → the ramp the source PNGs are drawn in. */
  base: Record<string, string>;
}

export interface Catalog {
  upstream: { repo: string; commit: string; fetchedAt: string };
  /** Only sheets for these animations were vendored. */
  animations: string[];
  /** Frame grid of every vendored sheet. */
  frame: { size: number; columns: number; rows: number };
  licenseFilter: string;
  items: CatalogItem[];
  palettes: PaletteBook;
}
