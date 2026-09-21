/**
 * 门面选拔的全量体检。
 *
 * `why-flagship.ts` 回答单家，这个脚本回答「有没有哪家选错了」——
 * 逐家把广场上站的那位和本家 ECI 最高的那位对比，按可疑程度排序。
 *
 * 判据只有一条，但分三级：门面的 ECI 比本家最高值低多少。
 * 低是允许的（接班规则会让更新的型号顶上，这是刻意设计），
 * 但**低得过多、或者门面压根没有分数而本家有高分型号**，就值得人看一眼。
 * 只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildPlazaRoster, hasCoreData } from '../../src/lib/roster';
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

const byVendor = new Map<string, ModelRecord[]>();
for (const m of snap.models) {
  const l = byVendor.get(m.vendorId);
  if (l) l.push(m);
  else byVendor.set(m.vendorId, [m]);
}

interface Row {
  vendor: string;
  flag: ModelRecord;
  best: ModelRecord;
  gap: number | null;
  level: 0 | 1 | 2;
}

const rows: Row[] = [];

for (const c of roster) {
  for (const { model: flag, vendor } of c.entries) {
    const pool = (byVendor.get(vendor.id) ?? []).filter(
      (m) => !m.retiredAt && hasCoreData(m) && m.benchmarks.eci != null,
    );
    if (pool.length === 0) continue;
    const best = pool.sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci!)[0];
    if (best.id === flag.id) continue;

    const flagEci = flag.benchmarks.eci;
    const gap = flagEci == null ? null : best.benchmarks.eci! - flagEci;
    // 2 = 门面没分数但本家有高分型号；1 = 差 3 分以上；0 = 小幅落后，接班规则的正常结果
    const level: 0 | 1 | 2 = gap == null ? 2 : gap >= 3 ? 1 : 0;
    rows.push({ vendor: vendor.id, flag, best, gap, level });
  }
}

rows.sort((a, b) => b.level - a.level || (b.gap ?? 99) - (a.gap ?? 99));

const LABEL = ['正常', '落后较多', '门面无分数'] as const;
for (const r of rows) {
  console.log(
    `[${LABEL[r.level]}] ${r.vendor.padEnd(14)}` +
      `门面 ${(r.flag.name ?? '').slice(0, 24).padEnd(26)}${String(r.flag.benchmarks.eci?.toFixed(1) ?? '—').padStart(6)}` +
      `   本家最高 ${(r.best.name ?? '').slice(0, 24).padEnd(26)}${r.best.benchmarks.eci!.toFixed(1)}` +
      (r.gap == null ? '' : `  差 ${r.gap.toFixed(1)}`),
  );
}

const houses = roster.reduce((n, c) => n + c.entries.length, 0);
const susp = rows.filter((r) => r.level > 0).length;
console.log(`\n${houses} 间屋子，${rows.length} 间门面不是本家 ECI 最高者，其中 ${susp} 间需要人看一眼`);
