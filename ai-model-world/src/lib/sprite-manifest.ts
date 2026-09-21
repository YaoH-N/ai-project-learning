import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 精灵图清单。
 *
 * 除了「哪些角色有图」之外，最重要的是 `anchors`——
 * 合成时实测出来的头部、颅骨、身体包围盒。
 *
 * 状态叠加层（皇冠、光环、雾气）从 PNG 里拆出来交给前端之后，
 * 前端就得知道「头在哪」。而头的位置随体型、发型体积、有没有戴耳机而变：
 * 实测 Qwen3.8 Max 的颅骨顶在 y=19，Claude Fable 5 在 y=16，
 * 差的这 3 像素在两倍显示下就是 6 像素，硬编码百分比一定会有角色戴歪。
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpriteAnchors {
  /** 含头发的头部整体，光环与星星浮在它上方 */
  head: Box;
  /** 颅骨，皇冠压在它顶上 */
  skull: Box;
  /** 不含影子的整个人，脚底是 y + height */
  body: Box;
}

interface Manifest {
  overlaysBaked?: boolean;
  frame?: { size: number; columns: number; rows: number };
  sprites?: Record<string, { anchors?: SpriteAnchors }>;
}

const MANIFEST_PATH = join(process.cwd(), 'public', 'sprites', 'manifest.json');

/** 锚点坐标所在的画布边长，用来把像素换算成百分比 */
export const FRAME_SIZE = 64;

let cached: Manifest | null = null;

function load(): Manifest {
  if (cached) return cached;
  if (!existsSync(MANIFEST_PATH)) {
    cached = {};
    return cached;
  }
  try {
    cached = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    cached = {};
  }
  return cached;
}

/**
 * 缺锚点时的兜底，取自全量的中位数。
 * 精灵图缺失或清单损坏时叠加层仍然画得出来，只是位置不那么贴合。
 */
const FALLBACK: SpriteAnchors = {
  head: { x: 20, y: 11, width: 24, height: 29 },
  skull: { x: 21, y: 17, width: 22, height: 22 },
  body: { x: 18, y: 11, width: 28, height: 51 },
};

export function anchorsFor(slug: string): SpriteAnchors {
  return load().sprites?.[slug]?.anchors ?? FALLBACK;
}

export function overlaysBaked(): boolean {
  // 读不到清单时保守地认为已烘焙：宁可少画一顶皇冠，也不要画出两顶
  return load().overlaysBaked !== false;
}
