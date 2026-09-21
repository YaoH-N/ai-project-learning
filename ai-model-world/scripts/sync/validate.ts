import { SANITY } from './config';
import { findArtificialAnalysisLeaks, findBlockedBenchmarkSources } from './lib/compliance';
import { log } from './lib/log';
import type {
  Attribution,
  BenchmarkScore,
  ModelRecord,
  ScoreUnit,
  WorldSnapshot,
} from '../../src/lib/types';

export type CoverageMap = Record<string, { filled: number; total: number; ratio: number }>;

/**
 * 用 `!= null` 而不是 `!== null`。
 * 覆盖率会拿历史快照做对比，而历史快照里可能压根没有新加的字段——
 * 那时读到的是 undefined，`undefined !== null` 为真，会把「字段不存在」算成 100% 覆盖，
 * 于是新增字段的第一次运行必然触发一条「覆盖率从 100% 骤降」的假告警。
 */
const has = (v: unknown): boolean => v !== null && v !== undefined;

const FIELD_PROBES: Array<[string, (m: ModelRecord) => boolean]> = [
  ['id', (m) => Boolean(m.id)],
  ['name', (m) => Boolean(m.name)],
  ['vendorId', (m) => Boolean(m.vendorId)],
  ['releaseDate', (m) => has(m.releaseDate)],
  ['releaseDatePrecision.day', (m) => m.releaseDatePrecision === 'day'],
  ['knowledgeCutoff', (m) => has(m.knowledgeCutoff)],
  ['contextWindow', (m) => has(m.contextWindow)],
  ['maxOutput', (m) => has(m.maxOutput)],
  ['pricing.inputPerMTok', (m) => has(m.pricing.inputPerMTok)],
  ['pricing.outputPerMTok', (m) => has(m.pricing.outputPerMTok)],
  ['pricing.cachedInputPerMTok', (m) => has(m.pricing.cachedInputPerMTok)],
  ['modalities.input', (m) => m.modalities.input.length > 0],
  ['modalities.output', (m) => m.modalities.output.length > 0],
  ['capabilities.toolCall', (m) => has(m.capabilities.toolCall)],
  ['capabilities.reasoning', (m) => has(m.capabilities.reasoning)],
  ['capabilities.structuredOutput', (m) => has(m.capabilities.structuredOutput)],
  ['capabilities.promptCaching', (m) => has(m.capabilities.promptCaching)],
  ['openWeights', (m) => has(m.openWeights)],
  ['license', (m) => has(m.license)],
  ['params.totalB', (m) => has(m.params.totalB)],
  ['params.activeB', (m) => has(m.params.activeB)],
  ['params.confidence!=unknown', (m) => m.params.confidence !== 'unknown'],
  ['params.sizeTier', (m) => has(m.params.sizeTier)],
  ['benchmarks.eci', (m) => has(m.benchmarks.eci)],
  ['benchmarks.swe_bench_verified', (m) => has(m.benchmarks.swe_bench_verified)],
  ['benchmarks.swe_bench_vendor', (m) => has(m.benchmarks.swe_bench_vendor)],
  ['benchmarks.swe_bench_pro', (m) => has(m.benchmarks.swe_bench_pro)],
  [
    'benchmarks.任一编程信号',
    (m) =>
      has(m.benchmarks.swe_bench_verified) ||
      has(m.benchmarks.swe_bench_vendor) ||
      has(m.benchmarks.swe_bench_pro),
  ],
  [
    'benchmarks.任一编程信号(含 WebDev Arena)',
    (m) =>
      has(m.benchmarks.swe_bench_verified) ||
      has(m.benchmarks.swe_bench_vendor) ||
      has(m.benchmarks.swe_bench_pro) ||
      has(m.benchmarks.webdev_arena_elo),
  ],
  ['benchmarks.aime', (m) => has(m.benchmarks.aime)],
  ['benchmarks.gpqa_diamond', (m) => has(m.benchmarks.gpqa_diamond)],
  ['benchmarks.arc_agi_2', (m) => has(m.benchmarks.arc_agi_2)],
  ['benchmarks.fiction_live', (m) => has(m.benchmarks.fiction_live)],
  ['benchmarks.webdev_arena_elo', (m) => has(m.benchmarks.webdev_arena_elo)],
  /*
   * coding[] 的探针一律走 codingOf()。
   * 直接写 `m.coding.length > 0` 会在拿历史快照做对比时抛异常——
   * 那时候这个字段压根不存在，读到的是 undefined。这是 has() 那条坑的数组版本：
   * 标量字段用 `!= null` 就够，数组字段还得先兜一个空数组。
   */
  ['coding.任一编程成绩', (m) => codingOf(m).length > 0],
  ['coding.任一百分数成绩', (m) => codingOf(m).some((s) => s.unit === 'pct')],
  ['coding.两条以上赛制', (m) => codingOf(m).length >= 2],
  ['coding.有第三方复核成绩', (m) => codingOf(m).some((s) => s.attribution === 'third-party')],
  ['scores.任一成绩', (m) => scoresOf(m).length > 0],
  ['scores.三条以上榜单', (m) => scoresOf(m).length >= 3],
  ['trainingComputeFlop', (m) => has(m.trainingComputeFlop)],
];

/** 新字段第一次上线时历史快照里没有它，读到的是 undefined。 */
const codingOf = (m: ModelRecord): BenchmarkScore[] => m.coding ?? [];
const scoresOf = (m: ModelRecord): BenchmarkScore[] => m.scores ?? [];

/** 百分数量纲的合法区间。Elo 与 index 不受这个约束，它们有自己的区间。 */
const PERCENT_RANGE = [0, 100] as const;
/** Elo 的合理区间。上游给的 WebDev Arena 实测在 1000–1700，放宽一个数量级兜住未来漂移。 */
const ELO_RANGE = [100, 5000] as const;

/**
 * 契约里的五种量纲。`minutes` 是 METR 的任务时长，`usd` 是 Vending-Bench 的经营净值——
 * 后者可以为负（亏钱），所以 usd 只查有限性不查区间。
 */
const SCORE_UNITS = new Set<ScoreUnit>(['pct', 'elo', 'index', 'minutes', 'usd']);
const ATTRIBUTIONS = new Set<Attribution>(['third-party', 'vendor-self-reported']);

/** 一条成绩在它的量纲下是否落在合理区间。index 与 usd 没有区间约束。 */
function scoreOutOfRange(s: BenchmarkScore): string | null {
  if (s.unit === 'pct' && (s.score < PERCENT_RANGE[0] || s.score > PERCENT_RANGE[1])) {
    return `超出 pct 的合理区间 ${PERCENT_RANGE[0]}–${PERCENT_RANGE[1]}`;
  }
  if (s.unit === 'elo' && (s.score < ELO_RANGE[0] || s.score > ELO_RANGE[1])) {
    return `超出 elo 的合理区间 ${ELO_RANGE[0]}–${ELO_RANGE[1]}`;
  }
  if (s.unit === 'minutes' && s.score < 0) return '时长不能为负';
  return null;
}

/**
 * 检查一个成绩数组（coding[] 或 scores[]）的结构与量纲。两个数组的规矩完全一样：
 * 一个赛制一条、unit 合法且与分数区间自洽、Epoch 来源必须标第三方。
 */
function checkScoreArray(modelId: string, field: 'coding' | 'scores', list: BenchmarkScore[], failures: string[]): void {
  const seen = new Set<string>();
  for (const s of list) {
    if (!s.league) {
      failures.push(`${modelId} 有一条 ${field} 成绩没有赛制 id`);
      continue;
    }
    if (seen.has(s.league)) {
      failures.push(`${modelId} 的 ${field} 里赛制 ${s.league} 出现多条，同赛制必须择优只留一条`);
    }
    seen.add(s.league);
    if (!SCORE_UNITS.has(s.unit)) {
      failures.push(`${modelId} 的 ${field}[${s.league}] 量纲非法：${String(s.unit)}`);
    }
    if (!ATTRIBUTIONS.has(s.attribution)) {
      failures.push(`${modelId} 的 ${field}[${s.league}] attribution 非法：${String(s.attribution)}`);
    }
    if (typeof s.score !== 'number' || !Number.isFinite(s.score)) {
      failures.push(`${modelId} 的 ${field}[${s.league}] 分数非法：${String(s.score)}`);
      continue;
    }
    const range = scoreOutOfRange(s);
    if (range) failures.push(`${modelId} 的 ${field}[${s.league}] = ${s.score} ${range}`);
    // Epoch 是统一复跑的第三方，标成自报就等于把第三方复核的成绩降级；
    // 反过来把 models.dev 的自报值标成第三方则是更严重的方向——那是在冒充复核。
    if (s.source === 'epoch.ai' && s.attribution !== 'third-party') {
      failures.push(`${modelId} 的 ${field}[${s.league}] 来自 Epoch 却没标 third-party`);
    }
  }
}

export function computeCoverage(models: ModelRecord[]): CoverageMap {
  const out: CoverageMap = {};
  const total = models.length;
  for (const [key, probe] of FIELD_PROBES) {
    const filled = models.reduce((acc, m) => acc + (probe(m) ? 1 : 0), 0);
    out[key] = { filled, total, ratio: total === 0 ? 0 : filled / total };
  }
  return out;
}

export interface ValidationResult {
  ok: boolean;
  failures: string[];
  warnings: string[];
  /** 已存在模型的发布日期发生变化——记为冲突待审，不阻塞本次写入 */
  releaseDateConflicts: Array<{ id: string; from: string | null; to: string | null }>;
}

/**
 * 第二层容错的「合理性校验闸门」。
 * 任一硬性检查不通过就拒绝写入、保留旧快照，并以非零退出码结束，
 * 这样上游返回截断 JSON、空数组或单位解析出错时不会污染生产数据。
 */
export function validateSnapshot(
  next: WorldSnapshot,
  previous: WorldSnapshot | null,
): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const releaseDateConflicts: ValidationResult['releaseDateConflicts'] = [];

  if (next.models.length === 0) {
    failures.push('模型总数为 0，上游很可能返回了空数组');
  }
  if (next.vendors.length === 0) {
    failures.push('厂商总数为 0');
  }

  // 1) id / slug 唯一性
  const ids = new Set<string>();
  const slugs = new Map<string, string>();
  for (const m of next.models) {
    if (ids.has(m.id)) failures.push(`模型 id 重复：${m.id}`);
    ids.add(m.id);
    const owner = slugs.get(m.slug);
    if (owner && owner !== m.id) failures.push(`slug 冲突：${m.slug} 同时对应 ${owner} 与 ${m.id}`);
    slugs.set(m.slug, m.id);
  }

  // 2) 定价不得为 0 或负数（单位解析出错的典型症状）
  for (const m of next.models) {
    for (const [key, value] of Object.entries(m.pricing)) {
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        failures.push(`${m.id} 的 pricing.${key} 非法：${String(value)}`);
      }
    }
  }
  // 3) 上下文长度必须是正整数
  for (const m of next.models) {
    if (m.contextWindow !== null && (!Number.isInteger(m.contextWindow) || m.contextWindow <= 0)) {
      failures.push(`${m.id} 的 contextWindow 非法：${String(m.contextWindow)}`);
    }
  }
  // 4) 闭源模型的参数量绝不能标 exact
  for (const m of next.models) {
    if (m.openWeights === false && m.params.confidence === 'exact') {
      failures.push(`${m.id} 是闭源模型但参数量置信度标成了 exact`);
    }
  }
  // 4b) 榜单量纲：准确率类必须落在 0–100，越界说明某处漏了归一化
  const PERCENT_KEYS = [
    'swe_bench_verified',
    'swe_bench_vendor',
    'swe_bench_pro',
    'aime',
    'gpqa_diamond',
    'arc_agi_2',
    'fiction_live',
  ] as const;
  for (const m of next.models) {
    for (const key of PERCENT_KEYS) {
      const v = m.benchmarks[key];
      if (v !== null && (v < 0 || v > 100)) {
        failures.push(`${m.id} 的 benchmarks.${key} = ${v} 超出 0–100，量纲归一化出错`);
      }
    }
  }
  // 4c) 自报成绩必须标 models.dev，Epoch 复跑的必须标 epoch.ai。
  //     前端「屏幕发不发光」完全依赖这个区分，标错了就是把自评当成第三方复核。
  for (const m of next.models) {
    if (m.benchmarks.swe_bench_verified !== null && m.provenance['benchmarks.swe_bench_verified'] !== 'epoch.ai') {
      failures.push(`${m.id} 的 swe_bench_verified 溯源不是 epoch.ai`);
    }
    for (const key of ['swe_bench_vendor', 'swe_bench_pro'] as const) {
      if (m.benchmarks[key] !== null && m.provenance[`benchmarks.${key}`] !== 'models.dev') {
        failures.push(`${m.id} 的 ${key} 溯源不是 models.dev`);
      }
    }
  }
  // 4d) Artificial Analysis 红线的最后一道保险
  const leaks = findArtificialAnalysisLeaks(next);
  if (leaks.length > 0) {
    failures.push(`快照里出现 Artificial Analysis 痕迹（${leaks.length} 处）：${leaks.slice(0, 5).join(' / ')}`);
  }
  // 4e) coding[] 的结构与量纲。
  //     这个数组是「跨赛制永不混算」这条原则的载体，它自己先得是干净的：
  //     一个赛制只能有一条（否则前端算分位时同一个模型会被数两次），
  //     unit 必须与分数区间自洽（Elo 混进百分数池会让所有百分数模型看起来都是满分）。
  //     scores[] 是 coding[] 的超集，同一套规矩。它是可选字段，缺席合法，但一旦有就必须是数组。
  for (const m of next.models) {
    if (!Array.isArray(m.coding)) {
      failures.push(`${m.id} 的 coding 不是数组：${String(m.coding)}`);
      continue;
    }
    checkScoreArray(m.id, 'coding', m.coding, failures);
    if (m.scores !== undefined) {
      if (!Array.isArray(m.scores)) {
        failures.push(`${m.id} 的 scores 不是数组：${String(m.scores)}`);
        continue;
      }
      checkScoreArray(m.id, 'scores', m.scores, failures);
      // 超集关系：coding[] 里的每一条在 scores[] 里都得有同 league 的一条。
      const inScores = new Set(m.scores.map((s) => s.league));
      for (const s of m.coding) {
        if (!inScores.has(s.league)) {
          failures.push(`${m.id} 的 coding[${s.league}] 没有出现在 scores[] 里，scores[] 必须是 coding[] 的超集`);
        }
      }
    }
  }
  // 4e-2) **一个赛制只能有一种量纲。**
  //     前端按「赛制内分位」算电脑档位，赛制里混着 0–1 的小数和 0–100 的百分数，
  //     或者混着百分数和 1.5 倍的加速比，算出来的分位就是纯噪声，而且不会报错。
  //     这一条最可能被踩的场景是同一个赛制来自两个源、其中一边忘了乘 100
  //     （Epoch 的 CSV 里至少混着四种量纲，见 sources/epoch.ts 的 CODING_BENCHMARKS）。
  //     coding[] 与 scores[] 一起查：同一个 league 在两个数组里也必须是同一种量纲。
  const unitByLeague = new Map<string, { unit: ScoreUnit; modelId: string }>();
  for (const m of next.models) {
    for (const s of [...(m.coding ?? []), ...(m.scores ?? [])]) {
      if (!s.league || !SCORE_UNITS.has(s.unit)) continue;
      const seen = unitByLeague.get(s.league);
      if (!seen) {
        unitByLeague.set(s.league, { unit: s.unit, modelId: m.id });
      } else if (seen.unit !== s.unit) {
        failures.push(
          `赛制 ${s.league} 出现两种量纲：${seen.modelId} 是 ${seen.unit}，${m.id} 是 ${s.unit}。` +
            `同一个赛制必须只有一种量纲，否则前端算的分位是噪声`,
        );
      }
    }
  }
  // 4e-3) 训练算力必须是正的有限数。负数或 0 只可能是解析错误。
  for (const m of next.models) {
    const flop = m.trainingComputeFlop;
    if (flop !== undefined && flop !== null && (!Number.isFinite(flop) || flop <= 0)) {
      failures.push(`${m.id} 的 trainingComputeFlop 非法：${String(flop)}`);
    }
  }
  // 4e-4) benchmarks[] 元信息：id 唯一、models 与 scores[] 的实际命中数一致、unit 合法。
  if (next.benchmarks !== undefined) {
    const landing = new Map<string, number>();
    for (const m of next.models) {
      for (const s of m.scores ?? []) landing.set(s.league, (landing.get(s.league) ?? 0) + 1);
    }
    const seenIds = new Set<string>();
    for (const b of next.benchmarks) {
      if (seenIds.has(b.id)) failures.push(`benchmarks[] 里榜单 id 重复：${b.id}`);
      seenIds.add(b.id);
      if (!SCORE_UNITS.has(b.unit)) failures.push(`benchmarks[${b.id}] 量纲非法：${String(b.unit)}`);
      const actual = landing.get(b.id) ?? 0;
      if (b.models !== actual) {
        failures.push(`benchmarks[${b.id}].models = ${b.models}，但 scores[] 里实际命中 ${actual} 个模型`);
      }
      if (actual === 0) failures.push(`benchmarks[${b.id}] 没有任何模型命中，不该列出`);
    }
    for (const league of landing.keys()) {
      if (!seenIds.has(league)) failures.push(`scores[] 里的榜单 ${league} 在 benchmarks[] 里没有元信息`);
    }
  }
  // 4f) coding[] / scores[] 的 sourceUrl 不得指向任何 AA 血缘域名（含 openrouter.ai 的第三跳）。
  //     这一项单独查字段而不是扫整棵树：vendors[].homepage 里出现 openrouter.ai 是合法的。
  const blockedSources = findBlockedBenchmarkSources(next.models);
  if (blockedSources.length > 0) {
    failures.push(
      `coding[] / scores[] 里有 ${blockedSources.length} 条成绩来自被拦截的域名：${blockedSources.slice(0, 5).join(' / ')}`,
    );
  }
  // 5) 厂商引用完整性
  const vendorIds = new Set(next.vendors.map((v) => v.id));
  for (const m of next.models) {
    if (!vendorIds.has(m.vendorId)) failures.push(`${m.id} 引用了不存在的厂商 ${m.vendorId}`);
  }

  const live = (s: WorldSnapshot) => s.models.filter((m) => m.retiredAt === null);

  if (previous && previous.models.length > 0) {
    // 比的是「存活模型数」而不是总数：退役模型会被原样留在快照里当幽灵，
    // 用总数比较的话，上游返回截断 JSON 时全员转退役、总数纹丝不动，闸门就形同虚设。
    const prevLive = live(previous);
    const nextLive = live(next);
    const base = prevLive.length > 0 ? prevLive.length : previous.models.length;
    const drop = (base - nextLive.length) / base;
    if (drop > SANITY.maxModelCountDropRatio) {
      failures.push(
        `存活模型数从 ${base} 跌到 ${nextLive.length}（-${(drop * 100).toFixed(1)}%），` +
          `超过 ${(SANITY.maxModelCountDropRatio * 100).toFixed(0)}% 的阈值，疑似上游返回了截断数据`,
      );
    }

    const prevCov = computeCoverage(prevLive.length > 0 ? prevLive : previous.models);
    const nextCov = computeCoverage(nextLive.length > 0 ? nextLive : next.models);
    for (const key of SANITY.requiredFieldCoverageKeys) {
      const before = prevCov[key]?.ratio ?? 0;
      const after = nextCov[key]?.ratio ?? 0;
      if (before - after > SANITY.maxCoverageDropRatio) {
        failures.push(
          `必填字段 ${key} 的覆盖率从 ${(before * 100).toFixed(1)}% 跌到 ${(after * 100).toFixed(1)}%，` +
            `跌幅超过 ${(SANITY.maxCoverageDropRatio * 100).toFixed(0)} 个百分点`,
        );
      }
    }
    // 承重字段按相对跌幅拦截。before 为 0 时不比（新字段首次出现），见文件头那条 undefined 的坑。
    for (const key of SANITY.loadBearingKeys) {
      const before = prevCov[key]?.ratio ?? 0;
      const after = nextCov[key]?.ratio ?? 0;
      if (before > 0 && (before - after) / before > SANITY.maxLoadBearingRelativeDrop) {
        failures.push(
          `承重字段 ${key} 的覆盖率从 ${(before * 100).toFixed(1)}% 跌到 ${(after * 100).toFixed(1)}%，` +
            `相对跌幅超过 ${(SANITY.maxLoadBearingRelativeDrop * 100).toFixed(0)}%，疑似上游改了文件名或列名`,
        );
      }
    }
    // 非必填字段的覆盖率骤降只告警：这是「上游改了字段名」的精准信号。
    for (const [key, cov] of Object.entries(nextCov)) {
      const before = prevCov[key]?.ratio ?? 0;
      if (before > 0.9 && cov.ratio < 0.1) {
        warnings.push(`字段 ${key} 覆盖率从 ${(before * 100).toFixed(0)}% 骤降到 ${(cov.ratio * 100).toFixed(0)}%，疑似上游改名`);
      }
    }

    const prevById = new Map(previous.models.map((m) => [m.id, m]));
    for (const m of next.models) {
      const before = prevById.get(m.id);
      if (!before) continue;
      if (before.releaseDate && m.releaseDate && before.releaseDate !== m.releaseDate) {
        releaseDateConflicts.push({ id: m.id, from: before.releaseDate, to: m.releaseDate });
      }
    }
    if (releaseDateConflicts.length > 0) {
      warnings.push(`${releaseDateConflicts.length} 个已存在模型的发布日期发生变化，已记入 data/sync-report.json 待审`);
    }
  }

  for (const f of failures) log.error(`校验不通过：${f}`);
  for (const w of warnings) log.warn(`校验告警：${w}`);

  return { ok: failures.length === 0, failures, warnings, releaseDateConflicts };
}
