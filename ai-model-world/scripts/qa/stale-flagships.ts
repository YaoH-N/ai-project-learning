/**
 * 「门面看起来过时」体检。
 *
 * 逐家对比：广场上站的那个 vs 这家最新发布的、够得上旗舰的型号。
 * 两者不一致时列出差了多少天，以及为什么没接班。
 * 只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildPlazaRoster, hasCoreData } from '../../src/lib/roster';
import { buildPriceScale } from '../../src/lib/derive';
import { canonicalVendorId, VENDOR_REGISTRY } from '../../src/data/vendor-registry';
import type { ModelRecord } from '../../src/lib/types';

const snap = loadSnapshot();
const now = new Date(snap.generatedAt);
const roster = buildPlazaRoster(
  snap.models,
  snap.vendors,
  now,
  (id) => canonicalVendorId(id) in VENDOR_REGISTRY,
);

const priceScale = buildPriceScale(snap.models);
const byVendor = new Map<string, ModelRecord[]>();
for (const m of snap.models) {
  const l = byVendor.get(m.vendorId);
  if (l) l.push(m);
  else byVendor.set(m.vendorId, [m]);
}

const SMALL = /(nano|mini|flash|lite|small|tiny|micro|air|turbo|preview)/i;

function days(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const p = (s: string) => {
    const x = s.split('-').map(Number);
    return Date.UTC(x[0], (x[1] ?? 1) - 1, x[2] ?? 1);
  };
  return Math.round((p(a) - p(b)) / 86_400_000);
}

let stale = 0;
const rows: string[] = [];

for (const c of roster) {
  for (const { model: flag, vendor } of c.entries) {
    const list = (byVendor.get(vendor.id) ?? []).filter(
      (m) => !m.retiredAt && hasCoreData(m) && (m.modalities.output.length === 0 || m.modalities.output.includes('text')),
    );
    // 这家最新的、命名上不像小杯/预览版的型号
    const big = list.filter((m) => !SMALL.test(m.id));
    const pool = big.length > 0 ? big : list;
    const newest = [...pool].sort(
      (a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id),
    )[0];
    if (!newest || newest.id === flag.id) continue;

    const gap = days(newest.releaseDate, flag.releaseDate);
    if (gap == null || gap <= 0) continue;
    stale++;

    const flagTier = priceScale.tierOf(flag.pricing.outputPerMTok);
    const newTier = priceScale.tierOf(newest.pricing.outputPerMTok);
    const reason =
      newest.benchmarks.eci != null && flag.benchmarks.eci != null
        ? `新的有分但低 ${(flag.benchmarks.eci - newest.benchmarks.eci).toFixed(1)}`
        : newest.benchmarks.eci == null && flagTier != null && newTier != null && newTier < flagTier
          ? `新的无分且价格档更低（${newTier} < ${flagTier}）`
          : newest.benchmarks.eci == null
            ? '新的无分'
            : '其他';

    rows.push(
      `${vendor.id.padEnd(17)}广场 ${(flag.name ?? '').slice(0, 22).padEnd(24)}${flag.releaseDate}` +
        `   更新的 ${(newest.name ?? '').slice(0, 24).padEnd(26)}${newest.releaseDate}  晚 ${String(gap).padStart(3)} 天  ${reason}`,
    );
  }
}

console.log(rows.join('\n'));
console.log(`\n${roster.reduce((n, c) => n + c.entries.length, 0)} 位门面里，${stale} 位不是本家最新的大杯型号`);
