/**
 * 视觉自验证：按几个断点批量截图，供人工/AI 肉眼比对。
 *
 * 用法：npx tsx scripts/qa/shots.ts [baseUrl] [outDir]
 * 默认对着 http://localhost:3001 截，产物落在 docs/samples/shots/。
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const OUT = process.argv[3] ?? 'docs/samples/shots';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'laptop', width: 1180, height: 860 },
  { name: 'mobile', width: 390, height: 844 },
];

const PAGES = [
  { name: 'plaza', path: '/' },
  { name: 'leaderboard', path: '/leaderboard/' },
  { name: 'chronicle', path: '/chronicle/' },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      // 移动端只截首页，其余断点没必要每页都留档
      if (vp.name !== 'desktop' && p.name !== 'plaza') continue;
      await page.goto(BASE + p.path, { waitUntil: 'networkidle' });
      // 精灵图是背景图，networkidle 之后再给动画一点时间落定
      await page.waitForTimeout(600);
      const file = join(OUT, `${p.name}-${vp.name}.png`);
      await page.screenshot({ path: file });
      console.log('wrote', file);
      if (p.name === 'plaza' && vp.name === 'desktop') {
        const full = join(OUT, 'plaza-desktop-full.png');
        await page.screenshot({ path: full, fullPage: true });
        console.log('wrote', full);
      }
    }
    await ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
