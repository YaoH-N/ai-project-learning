/**
 * Frame maths for consuming `public/sprites/*.png`.
 *
 * Deliberately renderer-agnostic: `spriteStyle` covers the CSS/DOM path used by
 * the SEO-facing pages, `spritesheetData` emits the frame table a canvas or
 * PixiJS renderer needs. Both read the same manifest, so the two paths can never
 * drift apart.
 */

import type { CSSProperties } from 'react';

import type { Facing, FrameGrid, SpriteEntry, SpriteManifest, SpriteRow } from './types.ts';

export * from './types.ts';

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Source rectangle of one cell. */
export function frameRect(manifest: SpriteManifest, row: SpriteRow, column = 0): FrameRect {
  const { size } = manifest.frame;
  return { x: column * size, y: manifest.rows[row] * size, width: size, height: size };
}

/**
 * Integer scaling only. Fractional factors produce uneven pixel widths even with
 * nearest-neighbour sampling, which is the classic way pixel art gets ruined.
 */
function assertIntegerScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new Error(`sprite scale must be a positive integer, got ${scale}`);
  }
}

export interface SpriteStyleOptions {
  row?: SpriteRow;
  column?: number;
  /** Integer upscale factor. */
  scale?: number;
}

/**
 * Inline style for a `<div>`/`<span>` showing one frame. Pair with an
 * accessible label — the sprite itself carries no text.
 */
export function spriteStyle(
  entry: SpriteEntry,
  manifest: SpriteManifest,
  { row = 'stand', column = 0, scale = 1 }: SpriteStyleOptions = {},
): CSSProperties {
  assertIntegerScale(scale);
  const { size } = manifest.frame;
  const rect = frameRect(manifest, row, column);
  return {
    width: size * scale,
    height: size * scale,
    backgroundImage: `url(${entry.file})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${entry.width * scale}px ${entry.height * scale}px`,
    backgroundPosition: `-${rect.x * scale}px -${rect.y * scale}px`,
    imageRendering: 'pixelated',
  };
}

/**
 * Keyframes for a pure-CSS walk loop. Use with
 * `animation: <name> 0.9s steps(1) infinite` — `steps()` on the whole track
 * would interpolate the background position, which smears the pixels.
 */
export function walkKeyframes(entry: SpriteEntry, manifest: SpriteManifest, facing: Facing, scale = 1): string {
  assertIntegerScale(scale);
  const { size } = manifest.frame;
  const y = manifest.rows[facing] * size * scale;
  const steps: string[] = [];
  for (let i = 0; i < manifest.walkFrames; i++) {
    const pct = ((i / manifest.walkFrames) * 100).toFixed(4).replace(/\.?0+$/, '');
    steps.push(`${pct}% { background-position: -${i * size * scale}px -${y}px; }`);
  }
  return steps.join('\n');
}

export interface SpritesheetFrame {
  frame: FrameRect;
  sourceSize: { w: number; h: number };
  spriteSourceSize: FrameRect;
}

export interface SpritesheetData {
  frames: Record<string, SpritesheetFrame>;
  animations: Record<string, string[]>;
  meta: { image: string; scale: string; size: { w: number; h: number } };
}

/** Frame table in the shape PixiJS `Spritesheet` and most canvas loops expect. */
export function spritesheetData(entry: SpriteEntry, manifest: SpriteManifest): SpritesheetData {
  const { size } = manifest.frame;
  const frames: Record<string, SpritesheetFrame> = {};
  const animations: Record<string, string[]> = {};

  const cell = (name: string, row: SpriteRow, column: number) => {
    const rect = frameRect(manifest, row, column);
    frames[name] = {
      frame: rect,
      sourceSize: { w: size, h: size },
      spriteSourceSize: { x: 0, y: 0, width: size, height: size },
    };
    return name;
  };

  cell('stand', 'stand', 0);
  animations.stand = ['stand'];
  for (const facing of ['up', 'left', 'down', 'right'] as const) {
    animations[facing] = Array.from({ length: manifest.walkFrames }, (_, i) =>
      cell(`${facing}${i}`, facing, i),
    );
  }

  return {
    frames,
    animations,
    meta: { image: entry.file, scale: '1', size: { w: entry.width, h: entry.height } },
  };
}

/** Total cell count in the sheet, handy for sanity checks. */
export function gridCells(frame: FrameGrid): number {
  return frame.columns * frame.rows;
}

export function lookup(manifest: SpriteManifest, slug: string): SpriteEntry | null {
  return manifest.sprites[slug] ?? null;
}
