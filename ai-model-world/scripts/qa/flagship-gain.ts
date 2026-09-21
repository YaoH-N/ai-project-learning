/**
 * 首屏增益评估：把 models.dev 里所有编程类榜单都接进来之后，
 * 广场上那几十位当家门面里能多出几个「桌上有电脑」的。
 *
 * 全站覆盖率是个会被长尾微调模型稀释的指标，首屏命中率才是用户真正看到的东西。
 * 只读，不写盘。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { loadSnapshot } from '../../src/lib/snapshot';
import { buildPlazaRoster } from '../../src/lib/roster';
import { VENDOR_REGISTRY } from '../../src/data/vendor-registry';

const AA_HOSTS = new Set(['artificialanalysis.ai']);
const AA_NAME = /artificial\s*analysis/i;

const CODING = new Set([
  'swe bench verified',
  'swe bench pro',
  'swe bench multilingual',
  'terminal bench',
  'terminal bench 2.1',
  'terminal bench hard',
  'aider polyglot',
  'scicode',
  'livecodebench',
  'livecodebench pro',
  'deepswe',
  'nl2repo',
  'frontiercode',
  'frontierswe',
  'swe marathon',
  'program bench',
  'automationbench',
  'claw eval',
  'swe atlas codebase qna',
  'swe atlas refactoring',
  'swe atlas test writing',
  'mle bench',
]);

function loadModelsJson(): Record<string, Record<string, unknown>> {
  for (const f of readdirSync('data/.cache/http')) {
    const j = JSON.parse(readFileSync(`data/.cache/http/${f}`, 'utf8')) as {
      url?: string;
      bodyBase64?: string;
    };
    if (j.url !== 'https://models.dev/models.json' || !j.bodyBase64) continue;
    return JSON.parse(Buffer.from(j.bodyBase64, 'base64').toString('utf8'));
  }
  throw new Error('缓存里没有 models.dev/models.json');
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const catalog = loadModelsJson();
/** modelId -> 该模型在 models.dev 上拿得到的编程榜单名 */
const codingByModel = new Map<string, string[]>();
for (const [id, model] of Object.entries(catalog)) {
  const list = (model as { benchmarks?: unknown }).benchmarks;
  if (!Array.isArray(list)) continue;
  const names: string[] = [];
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const rawName = String((b as { name?: string }).name ?? '');
    if (!CODING.has(norm(rawName))) continue;
    let host = '';
    try {
      host = new URL(String((b as { source?: string }).source ?? '')).host.replace(/^www\./, '');
    } catch {
      host = '';
    }
    if (AA_NAME.test(rawName) || AA_HOSTS.has(host)) continue;
    names.push(norm(rawName));
  }
  if (names.length) codingByModel.set(id, [...new Set(names)]);
}

const snap = loadSnapshot();
const roster = buildPlazaRoster(snap.models, snap.vendors, new Date(), (id) => id in VENDOR_REGISTRY);

let now = 0;
let after = 0;
let withWebdev = 0;
let total = 0;

for (const c of roster) {
  console.log(`\n=== ${c.continent === 'east' ? '国内' : '国外'} ===`);
  for (const { model: m } of c.entries) {
    total++;
    const b = m.benchmarks;
    const hasNow = b.swe_bench_verified != null || b.swe_bench_vendor != null || b.swe_bench_pro != null;
    const extra = codingByModel.get(m.id) ?? [];
    const hasAfter = hasNow || extra.length > 0;
    const hasWeb = b.webdev_arena_elo != null;
    if (hasNow) now++;
    if (hasAfter) after++;
    if (hasAfter || hasWeb) withWebdev++;

    const mark = hasNow ? '已有' : extra.length ? '可补' : hasWeb ? '仅前端' : '真没有';
    console.log(
      `${mark.padEnd(7)} ${(m.name ?? m.id).slice(0, 26).padEnd(28)} ${extra.slice(0, 3).join(' / ') || (hasWeb ? 'WebDev Arena Elo' : '')}`,
    );
  }
}

console.log(`\n首屏 ${total} 位门面：`);
console.log(`  当前有编程成绩            ${now}  (${((100 * now) / total).toFixed(0)}%)`);
console.log(`  接入 models.dev 全部编程榜 ${after}  (${((100 * after) / total).toFixed(0)}%)`);
console.log(`  再叠加 WebDev Arena Elo    ${withWebdev}  (${((100 * withWebdev) / total).toFixed(0)}%)`);
