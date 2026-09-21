/**
 * 性价比排名体检：确认「划算」这块牌子颁给的是又好又省的模型，
 * 而不是单纯最便宜的老模型。
 *
 * 旧算法 eci/price 的实测前三是 Llama-3.1-8B / Mistral Nemo / GPT OSS 20B，
 * 全是便宜的小模型。这个脚本用来验证改成分位差之后的结果。只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildValueScore } from '../../src/lib/derive';

const snap = loadSnapshot();
const valueOf = buildValueScore(snap.models);

const ranked = snap.models
  .map((m) => ({ m, v: valueOf(m) }))
  .filter((x): x is { m: (typeof snap.models)[number]; v: number } => x.v != null)
  .sort((a, b) => b.v - a.v);

console.log(`参与性价比排名的模型：${ranked.length}\n`);
console.log('名次'.padStart(4), '分位差'.padStart(7), 'ECI'.padStart(7), '输出价'.padStart(9), ' 模型');
for (const [i, { m, v }] of ranked.slice(0, 15).entries()) {
  console.log(
    String(i + 1).padStart(4),
    v.toFixed(3).padStart(7),
    (m.benchmarks.eci ?? 0).toFixed(1).padStart(7),
    `$${m.pricing.outputPerMTok}`.padStart(9),
    ' ' + (m.name ?? m.id),
  );
}

console.log('\n对照：旧算法 eci / price 的前 8');
const old = snap.models
  .map((m) => ({
    m,
    v:
      m.benchmarks.eci != null && m.pricing.outputPerMTok != null && m.pricing.outputPerMTok > 0
        ? m.benchmarks.eci / m.pricing.outputPerMTok
        : null,
  }))
  .filter((x): x is { m: (typeof snap.models)[number]; v: number } => x.v != null)
  .sort((a, b) => b.v - a.v);
for (const [i, { m, v }] of old.slice(0, 8).entries()) {
  console.log(
    String(i + 1).padStart(4),
    v.toFixed(0).padStart(7),
    (m.benchmarks.eci ?? 0).toFixed(1).padStart(7),
    `$${m.pricing.outputPerMTok}`.padStart(9),
    ' ' + (m.name ?? m.id),
  );
}
