import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 构建期扫描已生成的精灵图。
 *
 * 美术管线与数据管线是解耦的：数据管线可能先发现一个新模型，
 * 精灵图要等下一次合成才生成。缺图的角色会回退到剪影而不是破图，
 * 所以两条管线的时序不需要严格对齐。
 */

const SPRITES_DIR = join(process.cwd(), 'public', 'sprites');

/* 与 snapshot.ts 同理：只在生产构建缓存，开发时补了图立刻可见 */
let cached: ReadonlySet<string> | null = null;
const CACHE = process.env.NODE_ENV === 'production';

/**
 * 精灵图里是否已经烘焙了皇冠、光环这类状态叠加层。
 * 实现在 sprite-manifest 里，这里只做转发，避免两处各自解析同一份清单。
 */
export { overlaysBaked as spriteOverlaysBaked } from './sprite-manifest';

export function listSpriteSlugs(): ReadonlySet<string> {
  if (cached) return cached;
  const set: ReadonlySet<string> = existsSync(SPRITES_DIR)
    ? new Set(
        readdirSync(SPRITES_DIR)
          .filter((f) => f.endsWith('.png'))
          .map((f) => f.slice(0, -4)),
      )
    : new Set();
  if (CACHE) cached = set;
  return set;
}
