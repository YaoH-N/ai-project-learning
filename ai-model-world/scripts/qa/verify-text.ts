/**
 * 文案存在性核查：给定一段文字，检查它是否真的还出现在渲染后的页面上。
 *
 * 用来区分「代码没改干净」和「浏览器拿的是缓存」这两种情况——
 * 两者的表象一模一样，但处理方式完全不同。
 *
 * 用法：npx tsx scripts/qa/verify-text.ts "要查的文字" [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const needle = process.argv[2] ?? '怎么看这些屋子';
const base = process.argv[3] ?? 'http://localhost:3001';
const OUT = 'docs/samples/shots';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  // 全新的浏览器上下文 + 禁用缓存，确保拿到的是服务器当下的响应
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => route.continue());
  await page.goto(`${base}/?_=${Date.now()}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const text = await page.evaluate(() => document.body.innerText);
  const hit = text.includes(needle);
  console.log(`页面正文里${hit ? '仍然出现' : '没有'}「${needle}」`);
  if (hit) {
    const i = text.indexOf(needle);
    console.log('上下文：', JSON.stringify(text.slice(Math.max(0, i - 60), i + 80)));
  }

  console.log('\n首屏正文前 200 字：');
  console.log(text.slice(0, 200).replace(/\n+/g, ' / '));

  const file = `${OUT}/plaza-nocache.png`;
  await page.screenshot({ path: file });
  console.log('\n无缓存截图：', file);
  await browser.close();
  process.exitCode = hit ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
