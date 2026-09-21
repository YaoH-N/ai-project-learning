/**
 * 生成全站搜索索引。
 *
 *   npx tsx scripts/search-index/index.ts
 *
 * 读 `data/models.json`，写 `public/search-index.json`。离线、确定性，
 * 与精灵图合成一样属于「由快照再生产的产物」，所以不进版本库，由 predev / prebuild 现做。
 *
 * 为什么是一个独立文件而不是内联进页面：导航条上的搜索框每一页都有，
 * 而索引大约几十 KB。内联进 580 个静态页面要多出几十兆磁盘、每次访问多几 KB 传输；
 * 做成一个按需拉取的静态文件，读者不点搜索就一个字节都不下载。
 */

import fs from 'node:fs';
import path from 'node:path';

import { buildSearchIndex } from '../../src/lib/search.ts';
import type { WorldSnapshot } from '../../src/lib/types.ts';

const ROOT = process.cwd();
const SNAPSHOT = path.join(ROOT, 'data', 'models.json');
const OUT = path.join(ROOT, 'public', 'search-index.json');

function main() {
  if (!fs.existsSync(SNAPSHOT)) {
    console.log('[search-index] 没有 data/models.json，跳过（先跑 npm run sync）');
    return;
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as WorldSnapshot;
  const index = buildSearchIndex(snapshot);
  // 不缩进：这是给机器读的，缩进会让体积翻一倍
  const json = JSON.stringify(index);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);

  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(
    `[search-index] ${index.models.length} 个模型 / ${index.vendors.length} 家厂商 -> public/search-index.json (${kb} KB)`,
  );
}

main();
