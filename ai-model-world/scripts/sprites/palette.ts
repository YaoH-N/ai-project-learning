/**
 * LPC palette swapping.
 *
 * Every recolourable sheet is drawn in its material's "base" ramp (skin in `light`,
 * hair in `orange`, cloth in `white`, …). Re-tinting is therefore an exact
 * index-for-index colour substitution — no blending, no colour-space maths, so the
 * result stays inside the original palette and keeps the pixel-art look intact.
 */

import type { Material, PaletteBook } from './lpc-schema.ts';

export type RampChoice = Partial<Record<Material, string>>;

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const packRgb = (r: number, g: number, b: number) => (r << 16) | (g << 8) | b;

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function toHsl(hex: string): Hsl {
  const [r, g, b] = parseHex(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, s, l };
}

/** Below this saturation a colour reads as grey and its hue is meaningless. */
const NEUTRAL_S = 0.18;

const hueGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export class Palettes {
  constructor(private readonly book: PaletteBook) {}

  rampNames(material: Material): string[] {
    return Object.keys(this.book.ramps[material] ?? {}).sort();
  }

  ramp(material: Material, name: string): string[] | null {
    return this.book.ramps[material]?.[name] ?? null;
  }

  /**
   * Nearest ramp to an arbitrary brand colour, compared on the ramp's upper-middle
   * shade — that is the one that reads as "the" colour at sprite scale.
   */
  nearestRamp(material: Material, hex: string, allowed?: readonly string[]): string {
    const [r, g, b] = parseHex(hex);
    const names = allowed?.length ? [...allowed] : this.rampNames(material);
    let best = names[0];
    let bestD = Infinity;
    for (const name of names.sort()) {
      const ramp = this.ramp(material, name);
      if (!ramp || ramp.length === 0) continue;
      const [rr, rg, rb] = parseHex(ramp[Math.min(ramp.length - 1, Math.floor(ramp.length * 0.7))]);
      // Weighted RGB distance; green dominates perceived brightness.
      const d = 2 * (r - rr) ** 2 + 4 * (g - rg) ** 2 + 3 * (b - rb) ** 2;
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
    return best;
  }

  /** The shade that reads as "the" colour of a ramp at sprite scale. */
  representative(material: Material, name: string): string | null {
    const ramp = this.ramp(material, name);
    if (!ramp || ramp.length === 0) return null;
    return ramp[Math.min(ramp.length - 1, Math.floor(ramp.length * 0.7))];
  }

  /**
   * Ramps ordered by how well they match a brand colour, nearest first.
   *
   * Hue leads. Saturation is only a gate between "chromatic" and "neutral",
   * never a linear penalty: pixel-art ramps are far less saturated than a web
   * brand colour, so scoring the saturation gap directly makes every vivid brand
   * converge on whichever ramp happens to be the most saturated, regardless of
   * hue. That is exactly how three different blue brands all ended up in teal.
   */
  rampsByAffinity(material: Material, hex: string, allowed?: readonly string[]): string[] {
    const target = toHsl(hex);
    const targetNeutral = target.s < NEUTRAL_S;
    const names = (allowed?.length ? [...allowed] : this.rampNames(material)).sort();
    return names
      .map((name) => {
        const rep = this.representative(material, name);
        if (!rep) return { name, score: Infinity };
        const c = toHsl(rep);
        const mismatch = targetNeutral !== c.s < NEUTRAL_S ? 150 : 0;
        const hue = targetNeutral ? 0 : hueGap(target.h, c.h);
        return { name, score: hue + mismatch + Math.abs(target.l - c.l) * 40 };
      })
      .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
      .map((x) => x.name);
  }

  /**
   * `count` ramps that read as shades of one another, starting from `anchor`.
   *
   * Affinity ranking alone is not enough: a near-neutral anchor makes hue drop
   * out of the score, so its "nearest" ramps come back ordered by lightness
   * across every hue — which is how one vendor ended up wearing green, raven and
   * strawberry as a single house palette. Candidates therefore have to be either
   * neutral like the anchor, or within 60° of its hue.
   */
  family(material: Material, anchor: string, count: number, allowed?: readonly string[]): string[] {
    const rep = this.representative(material, anchor);
    if (!rep) return [anchor];
    const a = toHsl(rep);
    const anchorNeutral = a.s < NEUTRAL_S;
    const ranked = this.rampsByAffinity(material, rep, allowed);
    const compatible = ranked.filter((name) => {
      if (name === anchor) return true;
      const c = this.representative(material, name);
      if (!c) return false;
      const hsl = toHsl(c);
      if (anchorNeutral !== hsl.s < NEUTRAL_S) return false;
      return anchorNeutral || hueGap(a.h, hsl.h) <= 60;
    });
    // Deliberately may return fewer than `count`: some ramps, such as the single
    // green in the hair set, have no neighbours at all. Callers use the short
    // result to reject that ramp as an anchor rather than padding it with
    // unrelated shades.
    return [...new Set([anchor, ...compatible])].slice(0, count);
  }

  /**
   * Build a packed-RGB → packed-RGB lookup for the given material slots.
   * Earlier materials win on the (rare) shared colour.
   */
  lut(slots: readonly Material[], choice: RampChoice): Map<number, number> | null {
    const map = new Map<number, number>();
    for (const material of slots) {
      const target = choice[material];
      if (!target) continue;
      const from = this.ramp(material, this.book.base[material]);
      const to = this.ramp(material, target);
      if (!from || !to || target === this.book.base[material]) continue;
      const n = Math.min(from.length, to.length);
      for (let i = 0; i < n; i++) {
        const [fr, fg, fb] = parseHex(from[i]);
        const [tr, tg, tb] = parseHex(to[i]);
        const key = packRgb(fr, fg, fb);
        if (!map.has(key)) map.set(key, packRgb(tr, tg, tb));
      }
    }
    return map.size > 0 ? map : null;
  }
}

/** In-place recolour of an RGBA buffer. Fully transparent pixels are skipped. */
export function applyLut(rgba: Buffer, lut: Map<number, number>): void {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] === 0) continue;
    const to = lut.get((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
    if (to === undefined) continue;
    rgba[i] = (to >> 16) & 0xff;
    rgba[i + 1] = (to >> 8) & 0xff;
    rgba[i + 2] = to & 0xff;
  }
}
