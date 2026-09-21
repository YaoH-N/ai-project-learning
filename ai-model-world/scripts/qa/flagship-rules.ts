/**
 * 门面选拔规则的对照实验。
 *
 * 现行规则「取 ECI 最高」在模型迭代快的时候会系统性偏向旧模型：
 * 新发布的还没被 Epoch 测过，没有分数就不参与选拔。
 * 这个脚本把候选规则跑在全部厂商上，用来判断新规则会不会引入更糟的错误。
 *
 * 只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { pickFlagship, type FlagshipContext } from '../../src/lib/roster';
import { buildPriceScale } from '../../src/lib/derive';
import type { ModelRecord } from '../../src/lib/types';

const snap = loadSnapshot();
const now = new Date(snap.generatedAt);

/** 与 buildPlazaRoster 同源的自校准上下文 */
const priceScale = buildPriceScale(snap.models);
const scores = snap.models
  .filter((m) => m.benchmarks.eci != null && !m.retiredAt)
  .map((m) => m.benchmarks.eci!)
  .sort((a, b) => b - a);
const gaps: number[] = [];
for (let i = 1; i < scores.length; i++) if (scores[i - 1] - scores[i] > 0) gaps.push(scores[i - 1] - scores[i]);
gaps.sort((a, b) => a - b);
const ctx: FlagshipContext = {
  tie: gaps.length ? gaps[Math.floor(0.9 * (gaps.length - 1))] : 0,
  priceTierOf: (m) => priceScale.tierOf(m.pricing.outputPerMTok),
};

/** 新规则 = 现行 pickFlagship 加上代际接班上下文 */
const pickLatestFlagship = (models: ModelRecord[]) => pickFlagship(models, now, ctx);

const byVendor = new Map<string, ModelRecord[]>();
for (const m of snap.models) {
  const list = byVendor.get(m.vendorId);
  if (list) list.push(m);
  else byVendor.set(m.vendorId, [m]);
}

let changed = 0;
const rows: string[] = [];
for (const v of snap.vendors) {
  const list = byVendor.get(v.id) ?? [];
  if (list.length === 0) continue;
  const oldPick = pickFlagship(list, now);
  const newPick = pickLatestFlagship(list);
  if (!oldPick && !newPick) continue;
  const same = oldPick?.id === newPick?.id;
  if (!same) changed++;
  const fmt = (m: ModelRecord | null) =>
    m
      ? `${(m.name ?? m.id).slice(0, 24).padEnd(26)}${(m.releaseDate ?? '').padEnd(12)}ECI ${(m.benchmarks.eci?.toFixed(1) ?? '—').padStart(6)}`
      : '（无）'.padEnd(46);
  rows.push(`${same ? '  ' : '≠ '}${v.id.padEnd(17)}旧 ${fmt(oldPick)}   新 ${fmt(newPick)}`);
}

console.log(rows.join('\n'));
console.log(`\n共 ${rows.length} 家，其中 ${changed} 家的门面会改变`);

// 换规则之后，综合智力全球前 5 还在不在广场上
const top5 = snap.models
  .filter((m) => m.benchmarks.eci != null && !m.retiredAt)
  .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id))
  .slice(0, 5);
const newRoster = new Set(
  snap.vendors
    .map((v) => pickLatestFlagship(byVendor.get(v.id) ?? [])?.id)
    .filter((x): x is string => x != null),
);
console.log('\n综合智力全球前 5 在新阵容里的情况：');
for (const [i, m] of top5.entries()) {
  console.log(
    `  #${i + 1} ${(m.name ?? m.id).padEnd(26)} ECI ${m.benchmarks.eci!.toFixed(1)}  ${
      newRoster.has(m.id) ? '在广场上' : '⚠ 会从广场上消失'
    }`,
  );
}
