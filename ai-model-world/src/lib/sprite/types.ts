/**
 * Contract between the sprite pipeline (`scripts/sprites/`) and the site.
 * Mirrors `public/sprites/manifest.json` exactly.
 */

export type Facing = 'up' | 'left' | 'down' | 'right';

/** Rows of the generated sheet. `stand` holds the front-facing display pose. */
export type SpriteRow = 'stand' | Facing;

export const FACINGS: readonly Facing[] = ['up', 'left', 'down', 'right'];

export interface FrameGrid {
  /** Edge length of one square cell, in source pixels. */
  size: number;
  columns: number;
  rows: number;
}

/** Which visual traits were applied, mirrored for tooltips and the credits page. */
export interface SpriteAppearance {
  /** LPC head species picked from the vendor motif, e.g. `human`, `lizard`. */
  motifFamily: string;
  /** LPC body frame: `child` | `teen` | `female` | `male`. */
  body: string;
  /** 1–5, derived from parameter count (or price when undisclosed). */
  sizeTier: number;
  /** 1–5, derived from output price. Drives garment richness. */
  priceTier: number;
  /** 1-based ECI rank, or null when the model has no ECI score. */
  rank: number | null;
  crown: 'gold' | 'laurel' | 'silver' | null;
  flags: {
    fresh: boolean;
    retired: boolean;
    opaqueParams: boolean;
    imageIn: boolean;
    audio: boolean;
    imageOut: boolean;
    toolCall: boolean;
    reasoning: boolean;
    /** Thinking-halo ring count, 0–3, from `signsOf().halo` in `derive.ts`. */
    haloLayers: number;
    openWeights: boolean;
  };
  /** Chosen LPC palette ramp per material. */
  ramps: Record<string, string>;
}

export interface AnchorBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Measured attachment points for the state overlays the site draws itself,
 * in standing-frame pixels (origin at the top-left of the 64 px cell, before any
 * display scaling). Measured off the composited character, so they already
 * account for body type, hairstyle volume and headgear.
 */
export interface SpriteAnchors {
  /** Head plus hair. Float haloes and sparkles above `y`. */
  head: AnchorBox;
  /** Bare skull. A crown rests on `y`; ear-level items sit at `y + height*0.45`. */
  skull: AnchorBox;
  /**
   * The whole character, excluding the ground shadow. `y + height` is the feet,
   * which is where ground fog belongs; the box also bounds the ghost tint.
   */
  body: AnchorBox;
}

export interface SpriteEntry {
  slug: string;
  modelId: string;
  vendorId: string;
  /** Public path, already root-relative. */
  file: string;
  width: number;
  height: number;
  bytes: number;
  /** Content hash of the PNG; stable across runs, safe as a cache key. */
  sha256: string;
  anchors: SpriteAnchors;
  appearance: SpriteAppearance;
  /** Catalog item ids that went into the sheet, for per-character attribution. */
  layers: string[];
}

export interface SpriteManifest {
  generatedAt: string;
  /** Bumped whenever the composer's output would change for identical input. */
  pipeline: string;
  /**
   * False: the PNGs carry identity only — body, clothes, eyewear, headset,
   * brush, key, tool belt. The five state overlays (crown, thinking halo, newborn
   * sparkle, fog cloak, retired ghost) are *not* drawn in, and the site must
   * render them itself over the sprite, using `anchors` for placement.
   *
   * State changes with the leaderboard and the calendar; baking it in would mean
   * re-rendering all 485 sheets every time a rank moves. `appearance.crown` and
   * `appearance.flags` still carry the computed values as metadata.
   */
  overlaysBaked: boolean;
  /** Pinned upstream LPC commit the art came from. */
  catalogCommit: string;
  frame: FrameGrid;
  rows: Record<SpriteRow, number>;
  /** Frames in one walk loop. */
  walkFrames: number;
  sprites: Record<string, SpriteEntry>;
}
