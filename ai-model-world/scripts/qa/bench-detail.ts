/**
 * 查看某个榜单在 models.dev 上具体覆盖了哪些模型、发布日期分布如何。
 *
 * 用法：npx tsx scripts/qa/bench-detail.ts "aider polyglot"
 * 只读，不写盘。用来判断一个榜单是「还在更新」还是「停在某个时间点」。
 */
import { readFileSync, readdirSync } from 'node:fs';

const TARGET = (process.argv[2] ?? 'aider polyglot').toLowerCase();

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

const catalog = loadModelsJson();
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
    .map((m) => m.id),
);

const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

const hits: Array<{ id: string; score: number; release: string; host: string; fresh: boolean }> = [];
for (const [id, model] of Object.entries(catalog)) {
  const list = (model as { benchmarks?: unknown }).benchmarks;
  if (!Array.isArray(list)) continue;
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    if (norm(String((b as { name?: string }).name ?? '')) !== TARGET) continue;
    const url = String((b as { source?: string }).source ?? '');
    let host = '(无来源)';
    try {
      host = new URL(url).host.replace(/^www\./, '');
    } catch {
      /* 保持 */
    }
    hits.push({
      id,
      score: Number((b as { score?: number }).score ?? NaN),
      release: String((model as { release_date?: string }).release_date ?? '????-??-??'),
      host,
      fresh: !haveCoding.has(id),
    });
  }
}

hits.sort((a, b) => b.release.localeCompare(a.release));
console.log(`榜单「${TARGET}」共覆盖 ${hits.length} 个模型，其中 ${hits.filter((h) => h.fresh).length} 个在快照里还没有任何编程信号\n`);
console.log('发布日期'.padEnd(12), '分数'.padStart(7), ' 新增', ' 模型');
for (const h of hits) {
  console.log(h.release.padEnd(12), h.score.toFixed(1).padStart(7), h.fresh ? '  是 ' : '  —  ', h.id, `(${h.host})`);
}

const dates = hits.map((h) => h.release).filter((d) => /^\d{4}/.test(d)).sort();
if (dates.length) console.log(`\n发布日期跨度：${dates[0]} ～ ${dates[dates.length - 1]}`);
