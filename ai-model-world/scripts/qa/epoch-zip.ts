/**
 * 盘点 Epoch 那个 zip 里到底有哪些 CSV、各自的来源列指向谁。
 *
 * 两个用途：一是找出「已经下载了却没解析」的编程榜单，
 * 二是逐文件核查有没有 Artificial Analysis / LMArena 的血缘混进来。
 * 只读，不写盘。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { unzipSync } from 'fflate';

function loadZip(): Record<string, Uint8Array> {
  for (const f of readdirSync('data/.cache/http')) {
    const j = JSON.parse(readFileSync(`data/.cache/http/${f}`, 'utf8')) as {
      url?: string;
      bodyBase64?: string;
    };
    if (!j.url?.includes('benchmark_data.zip') || !j.bodyBase64) continue;
    return unzipSync(Buffer.from(j.bodyBase64, 'base64'));
  }
  throw new Error('缓存里没有 epoch benchmark_data.zip');
}

const files = loadZip();
const dec = new TextDecoder();

/** 目前 epoch.ts 会解析的文件（与 BENCHMARKS 的 filePatterns 对应） */
const PARSED = /^(epoch_capabilities_index|swe_bench_verified|otis_mock_aime|gpqa_diamond|arc_agi_2(_external)?|fictionlivebench(_external)?|webdev_arena(_external)?)\.csv$/i;

/** 编程口径的文件名关键词 */
const CODING = /(swe|code|coding|bench.*term|terminal|aider|algotune|gso|cursor|ale_bench|live_bench|mirror)/i;

const RISK = /(artificialanalysis|lmarena|arena\.ai)/i;

console.log(`zip 内共 ${Object.keys(files).length} 个文件\n`);
console.log('文件名'.padEnd(42), '行数'.padStart(6), ' 已解析', ' 编程', ' 风险来源');

const rows: Array<{ name: string; lines: number; parsed: boolean; coding: boolean; risk: string }> = [];
for (const [name, bytes] of Object.entries(files)) {
  if (!name.endsWith('.csv')) continue;
  const text = dec.decode(bytes);
  const lines = text.split('\n').length - 1;
  // 只在前 200 行里找来源域名，整份扫太慢且没必要
  const head = text.split('\n').slice(0, 200).join('\n');
  const hits = new Set<string>();
  for (const m of head.matchAll(/https?:\/\/([^\s,"/]+)/g)) {
    if (RISK.test(m[1])) hits.add(m[1]);
  }
  rows.push({
    name,
    lines,
    parsed: PARSED.test(name),
    coding: CODING.test(name),
    risk: [...hits].join(' '),
  });
}

rows.sort((a, b) => Number(b.coding) - Number(a.coding) || b.lines - a.lines);
for (const r of rows) {
  if (!r.coding && !r.risk && !r.parsed) continue;
  console.log(
    r.name.slice(0, 40).padEnd(42),
    String(r.lines).padStart(6),
    r.parsed ? '   是  ' : '   —   ',
    r.coding ? ' 是 ' : ' —  ',
    r.risk ? ` ⚠ ${r.risk}` : '',
  );
}

console.log('\n=== 带风险来源的文件（全量扫描）===');
for (const [name, bytes] of Object.entries(files)) {
  if (!name.endsWith('.csv')) continue;
  const text = dec.decode(bytes);
  const hits = new Map<string, number>();
  for (const m of text.matchAll(/https?:\/\/([^\s,"/]+)/g)) {
    if (RISK.test(m[1])) hits.set(m[1], (hits.get(m[1]) ?? 0) + 1);
  }
  if (hits.size === 0) continue;
  console.log(
    `${name.padEnd(40)} ${PARSED.test(name) ? '【已接入管线】' : '（未接入）'} ` +
      [...hits].map(([h, n]) => `${h}×${n}`).join(', '),
  );
}
