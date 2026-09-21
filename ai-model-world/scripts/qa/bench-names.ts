/**
 * 盘点 models.dev api.json 的 benchmarks[] 里到底有哪些榜单名、各覆盖多少模型、
 * 以及若把它晋升进数据契约能为「编程」维度**独立新增**多少个模型。
 *
 * 只读，不写盘。用来回答「我们是不是抓回来了却没用」。
 * 数据取自 data/.cache/http 里 models.dev/api.json 的原始响应。
 */
import { readFileSync, readdirSync } from 'node:fs';

function loadApiJson(): Record<string, unknown> {
  for (const f of readdirSync('data/.cache/http')) {
    const j = JSON.parse(readFileSync(`data/.cache/http/${f}`, 'utf8')) as {
      url?: string;
      bodyBase64?: string;
    };
    // benchmarks[] 只在 models.json 里，api.json 是纯规格表
    if (j.url !== 'https://models.dev/models.json') continue;
    if (!j.bodyBase64) throw new Error(`缓存命中但没有正文，字段有：${Object.keys(j).join(',')}`);
    return JSON.parse(Buffer.from(j.bodyBase64, 'base64').toString('utf8')) as Record<string, unknown>;
  }
  throw new Error('缓存里没有 models.dev/api.json');
}

const api = loadApiJson();
const snapshot = JSON.parse(readFileSync('data/models.json', 'utf8')) as {
  models: Array<{ id: string; benchmarks: Record<string, number | null> }>;
};

const haveCoding = new Set(
  snapshot.models
    .filter(
      (m) =>
        m.benchmarks.swe_bench_verified != null ||
        m.benchmarks.swe_bench_vendor != null ||
        m.benchmarks.swe_bench_pro != null,
    )
    .map((m) => m.id.toLowerCase().replace(/[^a-z0-9]/g, '')),
);
console.log(`快照中已有编程信号：${haveCoding.size} / ${snapshot.models.length}\n`);

interface Row {
  models: Set<string>;
  hosts: Map<string, number>;
  sample: number[];
}
const byName = new Map<string, Row>();

/** models.json 形如 { "vendor/model": { benchmarks: [...] } } */
for (const [mid, model] of Object.entries(api)) {
  const list = (model as { benchmarks?: unknown }).benchmarks;
  if (!Array.isArray(list)) continue;
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const rawName = (b as { name?: string }).name;
    if (!rawName) continue;
    const key = rawName
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    let row = byName.get(key);
    if (!row) {
      row = { models: new Set(), hosts: new Map(), sample: [] };
      byName.set(key, row);
    }
    row.models.add(mid);
    const url = (b as { source?: string; url?: string }).source ?? (b as { url?: string }).url ?? '';
    let host = '(无来源)';
    try {
      host = new URL(url).host.replace(/^www\./, '');
    } catch {
      /* 保持 (无来源) */
    }
    row.hosts.set(host, (row.hosts.get(host) ?? 0) + 1);
    const score = (b as { score?: number }).score;
    if (typeof score === 'number' && row.sample.length < 40) row.sample.push(score);
  }
}

const rows = [...byName.entries()].sort((a, b) => b[1].models.size - a[1].models.size);
console.log(`共 ${rows.length} 个不同榜单名\n`);
console.log('榜单名'.padEnd(34), '模型'.padStart(4), '独立新增'.padStart(6), '中位数'.padStart(6), ' 主要来源');
for (const [name, row] of rows) {
  // 「独立新增」= 这个榜覆盖的模型里，有多少在快照中还没有任何编程信号
  let fresh = 0;
  for (const key of row.models) {
    const norm = key.split('/').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (![...haveCoding].some((h) => h.includes(norm) || norm.includes(h))) fresh++;
  }
  const sorted = [...row.sample].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)].toFixed(1) : '-';
  const hosts = [...row.hosts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  console.log(
    name.slice(0, 32).padEnd(34),
    String(row.models.size).padStart(4),
    String(fresh).padStart(6),
    med.padStart(6),
    ' ' + hosts.map(([h, n]) => `${h}×${n}`).join(', '),
  );
}
