/**
 * README 配图。
 *
 * 与 `shots.ts` 的区别：那个是改完 UI 后的自查快照，随手产出、随手过期，所以不进仓库；
 * 这几张是文档插图，要跟着仓库走，因此落在 `docs/screenshots/`（未被 .gitignore 排除）
 * 并且统一压到 1440 宽、质量可控的 PNG，免得几张图把仓库撑大。
 *
 * 用法：先起一个服务指向构建产物，再跑
 *   cd .next-build && python3 -m http.server 4321
 *   npx tsx scripts/qa/readme-shots.ts http://localhost:4321
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = join(process.cwd(), 'docs', 'screenshots');
const WIDTH = 1440;

/** 截完再用 sharp 压一道。原图 2x 抓、缩回 1x，字比直接 1x 抓锐利得多。 */
async function shoot(page: Page, file: string, clip?: { y: number; height: number }) {
  const raw = await page.screenshot(
    clip ? { clip: { x: 0, y: clip.y, width: WIDTH, height: clip.height } } : { fullPage: false },
  );
  const path = join(OUT, file);
  await sharp(raw).resize({ width: WIDTH }).png({ compressionLevel: 9, palette: true }).toFile(path);
  console.log('wrote', path);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: 900 },
    deviceScaleFactor: 2,
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await shoot(page, 'plaza-top.png');

  // 广场分区：滚到「国外」标题再往上留一点，让区块标题也进画面
  const west = page.locator('#region-west');
  await west.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, -60);
  await page.waitForTimeout(300);
  await shoot(page, 'plaza-regions.png');

  await page.goto(`${BASE}/model/deepseek-deepseek-v4.1-flash/`, { waitUntil: 'networkidle' });
  await shoot(page, 'model-detail.png');

  await page.goto(`${BASE}/chronicle/`, { waitUntil: 'networkidle' });
  await shoot(page, 'chronicle.png');

  await page.goto(`${BASE}/leaderboard/`, { waitUntil: 'networkidle' });
  await shoot(page, 'leaderboard.png');

  // 搜索要先把索引拉下来，输入后等结果渲染
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const box = page.locator('input[type="search"], nav input').first();
  await box.click();
  await page.waitForTimeout(600);
  await box.type('多模态', { delay: 60 });
  await page.waitForTimeout(800);
  await shoot(page, 'search.png', { y: 0, height: 560 });

  await browser.close();
}

main();
