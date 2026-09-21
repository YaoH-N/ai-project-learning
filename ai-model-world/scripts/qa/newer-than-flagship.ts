/**
 * 「本家还有更新的」标识的覆盖面体检。
 *
 * 广场按实力选门面，Epoch 评测滞后时新型号会暂时看不见（典型案例：DeepSeek V4.1 Flash
 * 发布于 09-08 但没有 ECI，门面仍是 08-12 的 V4 Pro 0813）。屋子上那行小字就是补这个缺口的。
 *
 * 这个脚本回答两个问题：会出现在多少家屋子上（超过六成就该收紧，见 DESIGN 的剪枝规则）、
 * 具体是哪几家。只读，不写盘。
 */
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildPlazaRoster, newerThanFlagship } from '../../src/lib/roster';
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

let houses = 0;
let withBadge = 0;
const rows: string[] = [];

for (const c of roster) {
  for (const { model: flag, vendor } of c.entries) {
    houses++;
    const newer = newerThanFlagship(flag, byVendor.get(vendor.id) ?? []);
    if (!newer) continue;
    withBadge++;
    rows.push(
      `${vendor.id.padEnd(16)}门面 ${(flag.name ?? '').slice(0, 26).padEnd(28)}${flag.releaseDate}` +
        `   更新 ${(newer.name ?? '').slice(0, 26).padEnd(28)}${newer.releaseDate}` +
        `  ${newer.benchmarks.eci == null ? '尚无评测分' : `ECI ${newer.benchmarks.eci.toFixed(1)}`}`,
    );
  }
}

console.log(rows.join('\n'));
const pct = ((withBadge / houses) * 100).toFixed(0);
console.log(`\n${houses} 间屋子里 ${withBadge} 间会出现标识，覆盖率 ${pct}%（超过 60% 就该收紧）`);
