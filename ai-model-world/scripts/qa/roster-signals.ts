/**
 * 广场阵容的信号体检：首屏上每个当家门面各自有哪些数据、缺哪些。
 *
 * 用来回答「为什么屏幕上一片空桌子」——是上游真的没有，还是我们没接。
 * 只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildPlazaRoster } from '../../src/lib/roster';
import { VENDOR_REGISTRY } from '../../src/data/vendor-registry';

const snap = loadSnapshot();
const registryHas = (id: string) => id in VENDOR_REGISTRY;
const roster = buildPlazaRoster(snap.models, snap.vendors, new Date(), registryHas);

let withCode = 0;
let total = 0;
const leagueUse = new Map<string, number>();

for (const c of roster) {
  console.log(`\n=== ${c.continent === 'east' ? '国内' : '国外'}  ${c.entries.length} 位当家门面 ===`);
  for (const { model: m, vendor } of c.entries) {
    const b = m.benchmarks;
    // 口径与前端一致：看 coding[] 里有没有条目，而不是三个历史字段
    const coding = m.coding ?? [];
    total++;
    if (coding.length > 0) withCode++;
    for (const s of coding) leagueUse.set(s.league, (leagueUse.get(s.league) ?? 0) + 1);

    const bits = [
      b.eci != null ? '智力' : '    ',
      coding.length > 0 ? `编程×${coding.length}`.padEnd(5) : '     ',
      b.aime != null ? '数学' : '    ',
      b.gpqa_diamond != null ? '科学' : '    ',
      m.contextWindow != null ? '上下文' : '      ',
      m.pricing.outputPerMTok != null ? '价格' : '    ',
      m.params.totalB != null ? '参数' : '    ',
    ];
    console.log(`${vendor.id.padEnd(16)} ${(m.name ?? m.id).slice(0, 26).padEnd(28)} ${bits.join(' ')}`);
  }
  if (c.others.length > 0) console.log(`  （折叠区 ${c.others.length} 家）`);
}

console.log(`\n首屏 ${total} 位当家门面，其中 ${withCode} 位有编程成绩（${((100 * withCode) / total).toFixed(0)}%）`);
console.log('\n首屏用到的赛制：');
for (const [k, v] of [...leagueUse].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(26)} ${v}`);
}
