/**
 * 单个角色详情页的整页截图，供视觉自验证。
 *
 * 用法：npx tsx scripts/qa/shot-detail.ts <slug> [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const slug = process.argv[2] ?? 'anthropic-claude-fable-5';
const base = process.argv[3] ?? 'http://localhost:3001';
const OUT = 'docs/samples/shots';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 1100 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/model/${slug}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const file = `${OUT}/detail-${slug}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log('wrote', file);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
