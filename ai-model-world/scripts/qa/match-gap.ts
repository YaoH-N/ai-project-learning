/**
 * 匹配缺口体检：Epoch 抓到了成绩、但没能落到任何模型身上的条目有哪些。
 *
 * 「上游有数据 vs 前端显示未参赛」之间隔着一层名称归一，这个脚本量化那一层的损耗。
 * 只读，不写盘。
 */
import { readFileSync } from 'node:fs';

interface EpochEntry {
  country?: string;
  organization?: string;
  releaseDate?: { iso: string; precision: string };
  scores: Record<string, number>;
}

const raw = JSON.parse(readFileSync('data/raw/epoch.ai.json', 'utf8')) as {
  strict: Record<string, EpochEntry>;
  loose: Record<string, EpochEntry>;
  counts: Record<string, number>;
};
const snapshot = JSON.parse(readFileSync('data/models.json', 'utf8')) as {
  models: Array<{
    id: string;
    name: string;
    vendorId: string;
    benchmarks: Record<string, number | null>;
    provenance?: Record<string, string>;
  }>;
};

const METRICS = ['eci', 'swe_bench_verified', 'aime', 'gpqa_diamond', 'arc_agi_2', 'webdev_arena_elo', 'fiction_live'];

// 快照里每个指标已经落地的模型集合
const landed = new Map<string, Set<string>>();
for (const m of METRICS) landed.set(m, new Set());
for (const model of snapshot.models) {
  for (const m of METRICS) {
    if (model.benchmarks?.[m] != null) landed.get(m)!.add(model.id);
  }
}

console.log('=== Epoch 上游行数 vs 快照落地数 ===');
const table: Array<[string, number, number, string]> = [];
for (const m of METRICS) {
  const upstream = raw.counts[m] ?? 0;
  const got = landed.get(m)!.size;
  const loss = upstream > 0 ? `${(100 * (1 - got / upstream)).toFixed(0)}%` : '-';
  table.push([m, upstream, got, loss]);
}
for (const [m, u, g, l] of table) {
  console.log(`${m.padEnd(20)} 上游 ${String(u).padStart(4)}  落地 ${String(g).padStart(4)}  未落地 ${l}`);
}

// 哪些 Epoch 条目带 swe_bench_verified 却没有对应模型
console.log('\n=== 带 SWE-bench Verified 成绩的 Epoch 条目 ===');
const sweEntries = Object.entries(raw.loose).filter(([, v]) => v.scores?.swe_bench_verified != null);
console.log(`Epoch loose 索引里共 ${sweEntries.length} 条`);
for (const [key, v] of sweEntries.sort((a, b) => (b[1].scores.swe_bench_verified ?? 0) - (a[1].scores.swe_bench_verified ?? 0))) {
  console.log(`  ${key.padEnd(46)} ${String(v.scores.swe_bench_verified).padStart(6)}  ${v.organization ?? ''}`);
}

// ECI 未落地的高分条目（这些是「本该出现在广场上」的模型）
console.log('\n=== ECI 排名前 60 的 Epoch 条目里，哪些没能落到快照 ===');
const eciEntries = Object.entries(raw.loose)
  .filter(([, v]) => v.scores?.eci != null)
  .sort((a, b) => (b[1].scores.eci ?? 0) - (a[1].scores.eci ?? 0))
  .slice(0, 60);
const snapshotEci = new Set(snapshot.models.filter((m) => m.benchmarks?.eci != null).map((m) => Math.round(m.benchmarks.eci! * 100)));
let missed = 0;
for (const [key, v] of eciEntries) {
  const hit = snapshotEci.has(Math.round(v.scores.eci! * 100));
  if (!hit) {
    missed++;
    console.log(`  未落地 ${key.padEnd(46)} ECI ${v.scores.eci!.toFixed(1)}  ${v.organization ?? ''}`);
  }
}
console.log(`前 60 名里 ${missed} 条未落地`);
