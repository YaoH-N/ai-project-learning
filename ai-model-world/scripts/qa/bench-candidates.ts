/**
 * 候选榜单评估：对 models.dev 里每一个编程类榜单，同时看四件事——
 * 剔除 Artificial Analysis 之后还剩多少、能为快照独立新增多少、
 * 覆盖的模型有多新、来源是不是中立第三方。
 *
 * 「独立新增很多」但「全是两年前的模型」的榜单救不了首屏，
 * 这个脚本就是为了把这两种情况分开。只读，不写盘。
 */
import { readFileSync, readdirSync } from 'node:fs';

/** 与 scripts/sync/lib/compliance.ts 同源的判据，此处只做粗筛 */
const AA_HOSTS = new Set(['artificialanalysis.ai']);
const AA_NAME = /artificial\s*analysis/i;

/** 榜单方或中立机构自己发布，区别于厂商系统卡自评 */
const NEUTRAL_HOSTS = new Set([
  'labs.scale.com',
  'swebench.com',
  'aider.chat',
  'benchlm.ai',
  'llm-stats.com',
  'epoch.ai',
  'tbench.ai',
  'livecodebench.github.io',
]);

/** 口径属于「写代码/软件工程」的榜单。非编程类的不在本次评估范围内。 */
const CODING = [
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
];

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

interface Stat {
  kept: Set<string>;
  fresh: Set<string>;
  recent2026: Set<string>;
  neutral: number;
  vendor: number;
  latest: string;
}
const stats = new Map<string, Stat>();

for (const [id, model] of Object.entries(catalog)) {
  const list = (model as { benchmarks?: unknown }).benchmarks;
  if (!Array.isArray(list)) continue;
  const release = String((model as { release_date?: string }).release_date ?? '');
  for (const b of list) {
    if (!b || typeof b !== 'object') continue;
    const rawName = String((b as { name?: string }).name ?? '');
    const key = norm(rawName);
    if (!CODING.includes(key)) continue;

    const url = String((b as { source?: string }).source ?? '');
    let host = '';
    try {
      host = new URL(url).host.replace(/^www\./, '');
    } catch {
      host = '';
    }
    // 合规拦截：名字带 AA 或来源域名是 AA 的一律不计
    if (AA_NAME.test(rawName) || AA_HOSTS.has(host)) continue;

    let s = stats.get(key);
    if (!s) {
      s = { kept: new Set(), fresh: new Set(), recent2026: new Set(), neutral: 0, vendor: 0, latest: '' };
      stats.set(key, s);
    }
    s.kept.add(id);
    if (!haveCoding.has(id)) s.fresh.add(id);
    if (release >= '2026-01') s.recent2026.add(id);
    if (NEUTRAL_HOSTS.has(host)) s.neutral++;
    else s.vendor++;
    if (release > s.latest) s.latest = release;
  }
}

const rows = [...stats.entries()].sort((a, b) => b[1].fresh.size - a[1].fresh.size);
console.log('剔除 Artificial Analysis 之后的编程类榜单\n');
console.log(
  '榜单'.padEnd(26),
  '剩余'.padStart(4),
  '新增'.padStart(4),
  '其中2026'.padStart(8),
  '第三方/厂商'.padStart(11),
  ' 最新模型',
);
for (const [name, s] of rows) {
  console.log(
    name.slice(0, 24).padEnd(26),
    String(s.kept.size).padStart(4),
    String(s.fresh.size).padStart(4),
    String(s.recent2026.size).padStart(8),
    `${s.neutral}/${s.vendor}`.padStart(11),
    ' ' + (s.latest || '-'),
  );
}

// 全部接入后的并集
const union = new Set<string>(haveCoding);
for (const s of stats.values()) for (const id of s.kept) union.add(id);
console.log(
  `\n当前编程覆盖 ${haveCoding.size} / ${snapshot.models.length}，` +
    `全部接入后并集 ${union.size}（${((100 * union.size) / snapshot.models.length).toFixed(1)}%）`,
);
