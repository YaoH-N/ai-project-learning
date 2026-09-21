/**
 * 门面选拔体检：某家厂商为什么是这个模型上广场，而不是更新的那个。
 *
 * 用法：npx tsx scripts/qa/why-flagship.ts openai zhipuai
 * 逐个列出该厂商所有存活模型的 ECI、核心数据、发布日期，并标出谁被选中。
 * 只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { hasCoreData, pickFlagship, type FlagshipContext } from '../../src/lib/roster';
import { buildPriceScale } from '../../src/lib/derive';

const snap = loadSnapshot();
const now = new Date(snap.generatedAt);

// 与 buildPlazaRoster 用同一套自校准上下文，否则测的就不是线上那条路径
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
console.log(`ECI 打平阈值（自校准）：${ctx.tie.toFixed(3)}`);
const targets = process.argv.slice(2);
const vendorIds = targets.length > 0 ? targets : ['openai', 'zhipuai', 'anthropic', 'google'];

for (const vid of vendorIds) {
  const list = snap.models.filter((m) => m.vendorId === vid);
  if (list.length === 0) {
    console.log(`\n=== ${vid} ===\n  快照里没有这家厂商的模型`);
    continue;
  }
  const picked = pickFlagship(list, now, ctx);
  console.log(`\n=== ${vid}  共 ${list.length} 个模型，选中「${picked?.name ?? '无'}」 ===`);
  console.log(
    '  ',
    '发布日期'.padEnd(12),
    'ECI'.padStart(7),
    '上下文'.padStart(9),
    '输出价'.padStart(8),
    ' 核心数据',
    ' 模型',
  );

  const sorted = [...list].sort(
    (a, b) => (b.benchmarks.eci ?? -1) - (a.benchmarks.eci ?? -1) ||
      (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
  );
  for (const m of sorted) {
    const chosen = m.id === picked?.id;
    console.log(
      chosen ? ' →' : '  ',
      (m.releaseDate ?? '????-??-??').padEnd(12),
      (m.benchmarks.eci?.toFixed(1) ?? '—').padStart(7),
      (m.contextWindow != null ? `${Math.round(m.contextWindow / 1000)}K` : '—').padStart(9),
      (m.pricing.outputPerMTok != null ? `$${m.pricing.outputPerMTok}` : '—').padStart(8),
      hasCoreData(m) ? '   有   ' : '   无   ',
      (m.retiredAt ? '[已退役] ' : '') + (m.name ?? m.id),
    );
  }
}
