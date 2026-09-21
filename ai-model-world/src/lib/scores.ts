/**
 * 成绩层的纯函数：把一个模型身上散落在 `scores[]`、`coding[]`、`benchmarks.*`
 * 三处的评测成绩收拢成一个数组，再把全体模型按榜单切成可开榜的「赛道」。
 *
 * 排行榜页与详情页的「全部成绩」区块都从这里取数，保证两边看到的名次是同一套。
 *
 * 两条不可违背的规则在这里落地：
 *
 * 1. **同榜单 + 同测量方才能同池比较。** 第三方实测与厂商自报即使是同一套题，
 *    也不是同一个分布——厂商挑最好看的跑法报数，第三方用统一脚手架复跑。
 *    所以池键是 `league::attribution`，两者要么分成两条赛道，要么根本不见面。
 * 2. **未参赛就是未参赛。** 没有成绩的模型不进赛道，绝不填 0。
 */

import type { Attribution, BenchmarkScore, ModelRecord, ScoreUnit, SourceId, WorldSnapshot } from './types';
import {
  BENCHMARK_CATEGORIES,
  benchmarkOf,
  canonicalBenchmarkId,
  type BenchmarkCategory,
} from '@/data/benchmark-registry';
import { buildValueScore } from './derive';
import { formatCount, formatDate, formatPrice, formatScoreByUnit } from './format';
import { DEFAULT_LANG } from './i18n';

// ─── 收拢一个模型的全部成绩 ───────────────────────────────────

/**
 * 旧快照没有 `scores[]`，只有 `benchmarks` 上的固定字段。
 * 榜单 id 沿用管线在 `scores[]` 里的写法（`aime`、`fiction_live`），
 * 好让新旧两种快照在排行榜上开出同名的赛道。
 */
const LEGACY_GENERAL: { key: keyof ModelRecord['benchmarks']; league: string; unit: ScoreUnit }[] = [
  { key: 'eci', league: 'eci', unit: 'index' },
  { key: 'aime', league: 'aime', unit: 'pct' },
  { key: 'gpqa_diamond', league: 'gpqa_diamond', unit: 'pct' },
  { key: 'arc_agi_2', league: 'arc_agi_2', unit: 'pct' },
  { key: 'fiction_live', league: 'fiction_live', unit: 'pct' },
];

/** 与 aptitude.ts 的 `codingScoresOf` 同源：`coding[]` 为空时从三个历史字段合成 */
function legacyCodingScoresOf(model: ModelRecord): BenchmarkScore[] {
  if (Array.isArray(model.coding) && model.coding.length > 0) return model.coding;
  const out: BenchmarkScore[] = [];
  const push = (league: string, score: number | null, attribution: Attribution, source: SourceId) => {
    if (score == null) return;
    out.push({
      league,
      score,
      unit: league === 'webdev_arena_elo' ? 'elo' : 'pct',
      attribution,
      source,
      sourceUrl: null,
    });
  };
  const b = model.benchmarks;
  push('swe_bench_verified', b.swe_bench_verified, 'third-party', 'epoch.ai');
  push('swe_bench_verified', b.swe_bench_vendor, 'vendor-self-reported', 'models.dev');
  push('swe_bench_pro', b.swe_bench_pro, 'vendor-self-reported', 'models.dev');
  push('webdev_arena_elo', b.webdev_arena_elo, 'third-party', 'epoch.ai');
  return out;
}

function legacyGeneralScoresOf(model: ModelRecord): BenchmarkScore[] {
  const out: BenchmarkScore[] = [];
  for (const { key, league, unit } of LEGACY_GENERAL) {
    const v = model.benchmarks?.[key];
    if (v == null) continue;
    const source = model.provenance?.[`benchmarks.${key}`] ?? 'epoch.ai';
    out.push({
      league,
      score: v,
      unit,
      // 历史字段全部来自 Epoch 的复跑或转载，没有厂商自报的通道
      attribution: 'third-party',
      source,
      sourceUrl: null,
    });
  }
  return out;
}

/**
 * 一个模型的**全部**评测成绩，榜单 id 已归一。
 *
 * 优先读管线新产出的 `scores[]`；快照还是旧格式时，就地从 `benchmarks.*` 与 `coding[]`
 * 合成等价数组。这个兼容层是有意留的：数据管线与前端分头改，谁先落地都不该让站点白屏。
 */
export function allScoresOf(model: ModelRecord): BenchmarkScore[] {
  const out: BenchmarkScore[] = [];
  const seen = new Set<string>();
  const push = (s: BenchmarkScore) => {
    if (!Number.isFinite(s.score)) return;
    const league = canonicalBenchmarkId(s.league);
    const key = `${league}::${s.attribution}::${s.source}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(league === s.league ? s : { ...s, league });
  };

  if (Array.isArray(model.scores) && model.scores.length > 0) {
    model.scores.forEach(push);
    // LiveBench 这类非 Epoch 源只进 coding[]，不在 scores[] 里，要补上
    (model.coding ?? []).forEach(push);
    return out;
  }
  legacyGeneralScoresOf(model).forEach(push);
  legacyCodingScoresOf(model).forEach(push);
  return out;
}

/**
 * 按量纲写分数。ECI 是唯一一个既不是百分数、又不该被 `index` 那一支
 * 当成「加速倍率」渲染的指数（区间约 0–165，低于 100 会被印成 `85.30×`），所以单独处理。
 */
export function formatLeagueScore(league: string, score: number, unit: ScoreUnit): string {
  if (league === 'eci' || league === 'epoch_capabilities_index') return score.toFixed(1);
  return formatScoreByUnit(score, unit);
}

// ─── 分位池 ───────────────────────────────────────────────────

/** 池键：赛制相同还不够，测量方也必须相同 */
export function poolKeyOf(league: string, attribution: Attribution): string {
  return `${league}::${attribution}`;
}

/**
 * 同一个模型在同一个池里只留一条，来源可信度高的优先：
 * Epoch 统一复跑 > LiveBench 官方 CSV > models.dev 的转载。
 */
const SOURCE_RANK: Record<string, number> = {
  'epoch.ai': 0,
  livebench: 1,
  'models.dev': 2,
  override: 3,
  derived: 4,
};

function sourceRank(s: BenchmarkScore): number {
  return SOURCE_RANK[s.source] ?? 9;
}

export interface PoolEntry {
  model: ModelRecord;
  score: BenchmarkScore;
}

export type ScorePools = Map<string, PoolEntry[]>;

/** 全体模型的成绩按池分组，每池每模型一条。结果未排序。 */
export function buildScorePools(models: ModelRecord[]): ScorePools {
  const pools = new Map<string, Map<string, PoolEntry>>();
  for (const model of models) {
    for (const score of allScoresOf(model)) {
      const key = poolKeyOf(score.league, score.attribution);
      let pool = pools.get(key);
      if (!pool) {
        pool = new Map();
        pools.set(key, pool);
      }
      const prev = pool.get(model.id);
      if (!prev || sourceRank(score) < sourceRank(prev.score)) pool.set(model.id, { model, score });
    }
  }
  const out: ScorePools = new Map();
  for (const [key, pool] of pools) out.set(key, [...pool.values()]);
  return out;
}

/** 池里比 value 高的有几个，名次就是几加一。higherIsBetter 为假时反过来数。 */
export function rankInPool(
  pool: PoolEntry[],
  value: number,
  higherIsBetter = true,
): { rank: number; total: number } {
  let better = 0;
  for (const e of pool) {
    if (higherIsBetter ? e.score.score > value : e.score.score < value) better++;
  }
  return { rank: better + 1, total: pool.length };
}

// ─── 赛道 ─────────────────────────────────────────────────────

/** 派生赛道的量纲，与 ScoreUnit 并列 */
export type TrackUnit = ScoreUnit | 'tokens' | 'price' | 'date' | 'delta';

/** 派生赛道（性价比、上下文、价格、新鲜度）不属于任何榜单分类，单独成组 */
export type TrackCategory = BenchmarkCategory | '实用指标';

export const TRACK_CATEGORIES: TrackCategory[] = [
  BENCHMARK_CATEGORIES[0],
  '实用指标',
  ...BENCHMARK_CATEGORIES.slice(1),
];

export interface TrackEntry {
  model: ModelRecord;
  /** 排序用的原始值 */
  value: number;
  /** 已按量纲格式化好的展示文本 */
  text: string;
  attribution: Attribution;
  sourceUrl: string | null;
}

export interface Track {
  /** URL 里 `?track=` 的值。榜单赛道就是榜单 id；厂商自报另开的赛道加 `__self` 后缀 */
  id: string;
  label: string;
  category: TrackCategory;
  unit: TrackUnit;
  /** 一句人话，说清这条赛道量什么 */
  note: string;
  higherIsBetter: boolean;
  /**
   * 条形图的标度。价格与上下文跨好几个数量级，线性归一会让除了第一名之外全部贴零。
   */
  scale: 'linear' | 'log';
  /** 被新版榜单取代，默认不展示 */
  superseded: boolean;
  /** 整条赛道都是厂商自报 */
  selfReported: boolean;
  homepage: string | null;
  priority: number;
  /** 已排好序：第一个就是第一名 */
  entries: TrackEntry[];
}

/** 池小于这个数分不出高下，不单独开榜（与 aptitude.ts 的 MIN_POOL 一致） */
export const MIN_TRACK_SIZE = 5;

/**
 * 一条成绩对应哪条赛道的 id。
 *
 * 榜单只有一类测量方时赛道 id 就是榜单 id；第三方与自报都够开榜时，
 * 自报那条加 `__self` 后缀分开。池太小开不了榜时返回 null。
 */
export function trackIdFor(pools: ScorePools, league: string, attribution: Attribution): string | null {
  const own = pools.get(poolKeyOf(league, attribution))?.length ?? 0;
  if (own < MIN_TRACK_SIZE) return null;
  if (attribution === 'vendor-self-reported') {
    const thirdParty = pools.get(poolKeyOf(league, 'third-party'))?.length ?? 0;
    if (thirdParty >= MIN_TRACK_SIZE) return `${league}__self`;
  }
  return league;
}

function sortEntries(entries: TrackEntry[], higherIsBetter: boolean): TrackEntry[] {
  return entries.sort(
    (a, b) => (higherIsBetter ? b.value - a.value : a.value - b.value) || a.model.id.localeCompare(b.model.id),
  );
}

function benchmarkTracks(snapshot: WorldSnapshot, pools: ScorePools): Track[] {
  const meta = new Map((snapshot.benchmarks ?? []).map((b) => [canonicalBenchmarkId(b.id), b]));
  const byLeague = new Map<string, Partial<Record<Attribution, PoolEntry[]>>>();
  for (const [key, pool] of pools) {
    const [league, attribution] = key.split('::') as [string, Attribution];
    const slot = byLeague.get(league) ?? {};
    slot[attribution] = pool;
    byLeague.set(league, slot);
  }

  const tracks: Track[] = [];
  for (const [league, slots] of byLeague) {
    const info = benchmarkOf(league);
    const m = meta.get(league);
    const thirdParty = slots['third-party'] ?? [];
    const self = slots['vendor-self-reported'] ?? [];
    const make = (pool: PoolEntry[], attribution: Attribution): Track | null => {
      const id = trackIdFor(pools, league, attribution);
      if (!id) return null;
      const unit = m?.unit ?? pool[0].score.unit;
      const isSelf = attribution === 'vendor-self-reported';
      return {
        id,
        label: isSelf && thirdParty.length > 0 ? `${info.label}（厂商自报）` : info.label,
        category: info.category,
        unit,
        note: isSelf
          ? `${info.blurb} 这条赛道里的分数全部由厂商自己公布，未经独立复核，只在自报的成绩之间比较。`
          : info.blurb,
        higherIsBetter: info.higherIsBetter,
        scale: 'linear',
        superseded: m?.supersededBy != null,
        selfReported: isSelf,
        homepage: info.homepage,
        priority: info.priority + (isSelf ? 0.5 : 0),
        entries: sortEntries(
          pool.map(({ model, score }) => ({
            model,
            value: score.score,
            text: formatLeagueScore(league, score.score, unit),
            attribution,
            sourceUrl: score.sourceUrl,
          })),
          info.higherIsBetter,
        ),
      };
    };

    const a = make(thirdParty, 'third-party');
    const b = make(self, 'vendor-self-reported');
    if (a) tracks.push(a);
    if (b) tracks.push(b);
  }
  return tracks;
}

function dateValue(iso: string): number | null {
  const parts = iso.split('-').map(Number);
  const t = Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1);
  return Number.isNaN(t) ? null : t;
}

function derivedTracks(models: ModelRecord[]): Track[] {
  const valueOf = buildValueScore(models);
  // 文字进、文字出才是可比的「对话模型」价格。语音转写（Whisper）虽然也输出文字，
  // 但按分钟计费，折成 token 价接近 0，混进来会把「最便宜」颁给它们。
  const textChat = (m: ModelRecord) =>
    m.modalities.input.includes('text') && m.modalities.output.includes('text');

  const value: Track = {
    id: 'value',
    label: '性价比',
    category: '实用指标',
    unit: 'delta',
    note:
      '智力分位减去价格分位：只有「比同价位的更聪明」或「比同智力的更便宜」才拿得到高分。不是智力除以价格——那种算法会把冠军颁给最便宜的老模型。',
    higherIsBetter: true,
    scale: 'linear',
    superseded: false,
    selfReported: false,
    homepage: null,
    priority: 1,
    entries: sortEntries(
      models.flatMap((m) => {
        const v = valueOf(m);
        if (v == null) return [];
        const pts = Math.round(v * 100);
        return [
          {
            model: m,
            value: v,
            text: `${pts > 0 ? '+' : ''}${pts}`,
            attribution: 'third-party' as Attribution,
            sourceUrl: null,
          },
        ];
      }),
      true,
    ),
  };

  const context: Track = {
    id: 'context',
    label: '上下文窗口',
    category: '实用指标',
    unit: 'tokens',
    note: '一次能读进去多少 tokens，越大越能一口气啃完长文档。注意这是厂商标称的上限，实际记不记得住见「长文本记忆」榜。',
    higherIsBetter: true,
    scale: 'log',
    superseded: false,
    selfReported: false,
    homepage: null,
    priority: 2,
    entries: sortEntries(
      models.flatMap((m) =>
        m.contextWindow != null && m.contextWindow > 0
          ? [
              {
                model: m,
                value: m.contextWindow,
                text: `${formatCount(m.contextWindow)} tokens`,
                attribution: 'third-party' as Attribution,
                sourceUrl: null,
              },
            ]
          : [],
      ),
      true,
    ),
  };

  const cheapest: Track = {
    id: 'cheapest',
    label: '最便宜',
    category: '实用指标',
    unit: 'price',
    note: '输出每百万 tokens 的价格，越靠前越便宜。只比较输出文字的模型——按张、按分钟计费的图像与语音模型折算成 token 价会得到假的 $0。',
    higherIsBetter: false,
    scale: 'log',
    superseded: false,
    selfReported: false,
    homepage: null,
    priority: 3,
    entries: sortEntries(
      models.flatMap((m) => {
        const p = m.pricing.outputPerMTok;
        return textChat(m) && p != null && p > 0
          ? [
              {
                model: m,
                value: p,
                text: formatPrice(p, DEFAULT_LANG),
                attribution: 'third-party' as Attribution,
                sourceUrl: null,
              },
            ]
          : [];
      }),
      false,
    ),
  };

  const newest: Track = {
    id: 'newest',
    label: '最新发布',
    category: '实用指标',
    unit: 'date',
    note: '按发布日期从新到旧。发布日期取多个上游源的最早值，只精确到月的照实写到月。',
    higherIsBetter: true,
    scale: 'linear',
    superseded: false,
    selfReported: false,
    homepage: null,
    priority: 4,
    entries: sortEntries(
      models.flatMap((m) => {
        const t = m.releaseDate ? dateValue(m.releaseDate) : null;
        return t != null
          ? [
              {
                model: m,
                value: t,
                text: formatDate(m.releaseDate, m.releaseDatePrecision, DEFAULT_LANG),
                attribution: 'third-party' as Attribution,
                sourceUrl: null,
              },
            ]
          : [];
      }),
      true,
    ),
  };

  return [value, context, cheapest, newest].filter((t) => t.entries.length >= MIN_TRACK_SIZE);
}

/**
 * 可开榜的全部赛道，已按「分类顺序 → 优先级 → 上榜人数」排好。
 *
 * 三类来源：每个够 5 人的榜单一条（第三方与自报分列）；四条派生赛道；
 * 编程类不做特殊处理——它们与其他榜单走同一条分池规则。
 */
export function buildTrackIndex(snapshot: WorldSnapshot): Track[] {
  const pools = buildScorePools(snapshot.models);
  const tracks = [...benchmarkTracks(snapshot, pools), ...derivedTracks(snapshot.models)];
  const order = new Map(TRACK_CATEGORIES.map((c, i) => [c, i]));
  return tracks.sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.priority - b.priority ||
      b.entries.length - a.entries.length ||
      a.id.localeCompare(b.id),
  );
}

/** 默认打开的赛道：综合智力。快照里没有它时退到第一条。 */
export function defaultTrackId(tracks: Track[]): string {
  return tracks.find((t) => t.id === 'eci')?.id ?? tracks[0]?.id ?? '';
}
