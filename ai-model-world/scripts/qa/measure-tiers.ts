/**
 * 体型档位的可辨性体检。
 *
 * 「体型 = 模型规模」是广场远景仅有的四个信号之一，如果五个档位在视觉上分不开，
 * 这个维度就等于不存在。这个脚本量出每档站立帧的实际像素高度，
 * 用数字而不是肉眼来判断档位是否真的拉开了差距。
 */

import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const FRAME = 64;
const ALPHA_THRESHOLD = 24;

interface SpriteEntry {
  slug: string;
  appearance: { sizeTier: number; body: string };
}

async function standContentHeight(slug: string): Promise<number> {
  const buf = await sharp(join(ROOT, 'public/sprites', `${slug}.png`))
    .extract({ left: 0, top: 0, width: FRAME, height: FRAME })
    .raw()
    .toBuffer();

  let top = FRAME;
  let bottom = -1;
  for (let y = 0; y < FRAME; y++) {
    for (let x = 0; x < FRAME; x++) {
      if (buf[(y * FRAME + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return bottom < 0 ? 0 : bottom - top + 1;
}

async function main() {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, 'public/sprites/manifest.json'), 'utf8'),
  ) as { sprites: Record<string, SpriteEntry> };

  const byTier = new Map<number, SpriteEntry[]>();
  for (const entry of Object.values(manifest.sprites)) {
    const list = byTier.get(entry.appearance.sizeTier);
    if (list) list.push(entry);
    else byTier.set(entry.appearance.sizeTier, [entry]);
  }

  const means: number[] = [];
  for (const tier of [1, 2, 3, 4, 5]) {
    const samples = (byTier.get(tier) ?? []).slice(0, 6);
    if (samples.length === 0) {
      console.log(`档位 ${tier}：无样本`);
      continue;
    }
    const heights = await Promise.all(samples.map((s) => standContentHeight(s.slug)));
    const mean = heights.reduce((a, b) => a + b, 0) / heights.length;
    means.push(mean);
    const bodies = Array.from(new Set(samples.map((s) => s.appearance.body))).join('/');
    console.log(
      `档位 ${tier}  身体类型 ${bodies.padEnd(14)} 高度 ${heights.join(', ').padEnd(28)} 平均 ${mean.toFixed(1)}px`,
    );
  }

  console.log('\n相邻档位差值：');
  for (let i = 1; i < means.length; i++) {
    const delta = means[i] - means[i - 1];
    const verdict = delta >= 4 ? '可辨' : delta >= 2 ? '勉强' : '不可辨';
    console.log(`  ${i} → ${i + 1}：${delta >= 0 ? '+' : ''}${delta.toFixed(1)}px  ${verdict}`);
  }
  const span = means[means.length - 1] - means[0];
  console.log(`\n最矮到最高跨度 ${span.toFixed(1)}px（占 64px 画布的 ${((span / 64) * 100).toFixed(0)}%）`);
}

main();
