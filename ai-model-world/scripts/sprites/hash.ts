/**
 * Deterministic selection primitives.
 *
 * Every choice the pipeline makes is a pure function of (seed, salt), so the same
 * model always yields byte-identical art and two different models almost never
 * collide on every axis at once. SHA-256 is used instead of a cheap 32-bit hash
 * because the salts are short and highly similar ("hair", "hair2", …) and we want
 * the low bits to be well mixed.
 */

import { createHash } from 'node:crypto';

function digest(seed: string, salt: string): Buffer {
  return createHash('sha256').update(`${seed}\u0000${salt}`).digest();
}

/** Uniform-ish integer in `[0, max)`. */
export function hashInt(seed: string, salt: string, max: number): number {
  if (max <= 0) return 0;
  return digest(seed, salt).readUInt32BE(0) % max;
}

/** Deterministic float in `[0, 1)`. */
export function hashUnit(seed: string, salt: string): number {
  return digest(seed, salt).readUInt32BE(0) / 0x1_0000_0000;
}

export function pick<T>(items: readonly T[], seed: string, salt: string): T {
  if (items.length === 0) throw new Error(`pick from empty list (salt=${salt})`);
  return items[hashInt(seed, salt, items.length)];
}

/** `pick` that tolerates an empty pool, for optional layers. */
export function pickOrNull<T>(items: readonly T[], seed: string, salt: string): T | null {
  return items.length === 0 ? null : pick(items, seed, salt);
}

export function chance(seed: string, salt: string, percent: number): boolean {
  return hashInt(seed, salt, 100) < percent;
}
