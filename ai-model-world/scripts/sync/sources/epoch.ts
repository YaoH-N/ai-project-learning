import { parse as parseCsv } from 'csv-parse/sync';
import { unzipSync } from 'fflate';

import { ENDPOINTS } from '../config';
import { classifyEpochFile } from '../lib/compliance';
import { parseLooseDate, type LooseDate } from '../lib/dates';
import { fetchWithCache } from '../lib/http';
import {
  alnum,
  hasParamToken,
  slugVariants,
  stripEffortSuffix,
  stripParenthetical,
  vendorFromEpochOrg,
} from '../lib/ids';
import { errorMessage, log } from '../lib/log';
import type {
  BenchKey,
  EpochAggregate,
  EpochCodingScore,
  EpochEntity,
  EpochLeagueInfo,
  EpochMatch,
  EpochResult,
} from './types';
import type { ScoreUnit } from '../../../src/lib/types';

/**
 * Epoch AI 的 benchmark ZIP（CC-BY 4.0）。
 * 文件名与列名都不写死：先按正则在压缩包里找文件，再在表头里找第一个存在的候选列，
 * 上游改名时降级为「这一项缺失」而不是整段崩掉。
 */
interface BenchSpec {
  key: BenchKey;
  filePatterns: RegExp[];
  scoreColumns: string[];
  /** fraction = 0–1 的准确率，统一乘 100 变成百分数；raw = 指数或 Elo，原样保留。 */
  scale: 'fraction' | 'raw';
  /** 写进 scores[] / benchmarks[] 元信息的量纲 */
  unit: ScoreUnit;
}

const BENCHMARKS: BenchSpec[] = [
  {
    key: 'eci',
    /*
     * 2026-09 上游把 ECI 从根目录的 epoch_capabilities_index.csv 挪进了
     * epoch_capabilities_index/eci_scores.csv（同目录还有拟合参数与中间数据），列名也从
     * "ECI Score" 改成小写 "eci"。当时闸门没拦住，ECI 覆盖率从 38% 静默掉到 0——
     * 三个文件名候选都保留，新旧格式都接得住；配套的闸门规则见 validate.ts 的 loadBearingKeys。
     */
    filePatterns: [
      /^epoch_capabilities_index\.csv$/i,
      /^eci_scores\.csv$/i,
      /capabilit(y|ies).*index.*\.csv$/i,
    ],
    scoreColumns: ['ECI Score', 'ECI', 'Score', 'mean_score'],
    scale: 'raw',
    unit: 'index',
  },
  {
    key: 'swe_bench_verified',
    filePatterns: [/^swe_bench_verified\.csv$/i, /^swe[_-]?bench.*verified.*\.csv$/i],
    scoreColumns: ['mean_score', 'Best score (across scorers)', 'Score', 'resolved'],
    scale: 'fraction',
    unit: 'pct',
  },
  {
    key: 'aime',
    filePatterns: [/^otis_mock_aime.*\.csv$/i, /aime.*\.csv$/i],
    scoreColumns: ['mean_score', 'Best score (across scorers)', 'Score'],
    scale: 'fraction',
    unit: 'pct',
  },
  {
    key: 'gpqa_diamond',
    filePatterns: [/^gpqa_diamond\.csv$/i, /gpqa.*\.csv$/i],
    scoreColumns: ['mean_score', 'Best score (across scorers)', 'Score'],
    scale: 'fraction',
    unit: 'pct',
  },
  {
    key: 'arc_agi_2',
    filePatterns: [/^arc_agi_2(_external)?\.csv$/i, /arc[_-]?agi[_-]?2.*\.csv$/i],
    scoreColumns: ['Score', 'mean_score', 'Best score (across scorers)'],
    scale: 'fraction',
    unit: 'pct',
  },
  {
    key: 'fiction_live',
    filePatterns: [/^fictionlivebench(_external)?\.csv$/i, /fiction.*live.*\.csv$/i],
    scoreColumns: ['120k token score', '192k token score', '60k token score', '32k token score'],
    scale: 'fraction',
    unit: 'pct',
  },
  {
    key: 'webdev_arena_elo',
    filePatterns: [/^webdev_arena(_external)?\.csv$/i, /webdev.*arena.*\.csv$/i],
    scoreColumns: ['Arena Score', 'Elo', 'Score'],
    scale: 'raw',
    unit: 'elo',
  },
];

/**
 * 编程类 CSV。它们不进 `Benchmarks` 那几个固定字段（契约里没有位置），
 * 而是直接写进 `ModelRecord.coding[]`，一个文件一个赛制。
 *
 * **每一条的 `unit` 与 `scale` 都是逐个查过分数分布定下来的，不是猜的。**
 * 上游同一个 zip 里至少有四种量纲混着：0–1 的小数、0–100 的百分数、
 * 自定义评分标度、加速倍率。判错一个就等于在页面上端出一个假数字，
 * 那比不接这个榜单更糟。改动前请先跑 `npx tsx scripts/qa/epoch-zip.ts` 看实际分布。
 */
interface EpochCodingSpec {
  league: string;
  filePatterns: RegExp[];
  /** 主分数列的候选，按优先级。选哪一列的理由写在 note 里。 */
  scoreColumns: string[];
  /** fraction = 0–1，统一乘 100；raw = 原样保留 */
  scale: 'fraction' | 'raw';
  unit: ScoreUnit;
  note: string;
}

const CODING_BENCHMARKS: EpochCodingSpec[] = [
  {
    // Terminal-Bench。文件里所有能识别的 Source 都指向 /terminal-bench/2.0，
    // 全文搜不到 1.0 或 v1 的痕迹，运行日期 2025-10-31 ~ 2026-05-15，
    // 所以归到 terminal_bench_2_0 而**不是**无版本的 terminal_bench：
    // 后者是厂商自报的混合版本（中位 70.8），与这里的 2.0（中位约 38–69）不是一个人群。
    league: 'terminal_bench_2_0',
    filePatterns: [/^terminalbench(_external)?\.csv$/i, /^terminal_?bench.*_external\.csv$/i],
    scoreColumns: ['Accuracy mean'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Accuracy mean 是 0–1 小数（实测 0.031–0.847），乘 100。同一模型有多个 agent 各占一行，按既有规则取最好成绩。',
  },
  {
    league: 'aider_polyglot',
    filePatterns: [/^aider_polyglot(_external)?\.csv$/i],
    scoreColumns: ['Percent correct'],
    scale: 'raw',
    unit: 'pct',
    note: 'Percent correct **已经是 0–100**（实测 3.6–88），不要再乘 100。另一列 Percent using correct edit format 量的是编辑格式合规率，不是解题能力，不用。',
  },
  {
    // ALE-Bench 的 Performance 是 AtCoder 式的评分标度（实测 137.78–2176.88），
    // 不是百分数也不是 Elo。同文件的 Rank 列方向相反（越小越好，98.33 对应最强的
    // gpt-5.6-sol，861.02 对应最弱的 codestral-2508），拿 Rank 当分数会把强弱颠倒。
    league: 'ale_bench',
    filePatterns: [/^ale_bench(_external)?\.csv$/i],
    scoreColumns: ['Performance'],
    scale: 'raw',
    unit: 'index',
    note: 'Performance 是自定义评分标度 137–2177，越大越好。标成 index 而不是 pct——它没有「解决了几成」的含义。',
  },
  {
    league: 'cursorbench',
    filePatterns: [/^cursorbench(_external)?\.csv$/i],
    scoreColumns: ['Score'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Score 是 0–1 小数（实测 0.319–0.708），乘 100。同文件的 Rank 是名次，不用。',
  },
  {
    // DeepSWE 有 Pass@1 与 Pass@4 两列。选 Pass@1：
    // 它是「一次就做对」的口径，与 SWE-bench 的 resolve rate 同源，
    // 也与 models.dev 侧已有的 deepswe 自报值（46.2–72.7）同一个量纲；
    // Pass@4 是四次里对一次就算过（0.044–0.903），系统性高一截，混进同一列会把
    // 只有 Pass@1 的模型系统性压低——正是 SWE-Bench Pro 那 18 分落差的翻版。
    league: 'deepswe',
    filePatterns: [/^deepswe(_external)?\.csv$/i],
    scoreColumns: ['Pass@1'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Pass@1 是 0–1 小数，乘 100。不用 Pass@4（口径更松，与 models.dev 侧的自报值不同量纲）。Harness 全文件统一为 mini-swe-agent。',
  },
  {
    // GSO 有四列：Score OPT@1 / OPT@10 / OPT@1 (hack-adjusted) / OPT@10 (hack-adjusted)。
    // **只用 hack-adjusted 的 OPT@1**，代价是从 38 行降到 27 行。
    // 理由：实测两列都有值的 27 行里有 23 行不同，且 adjusted 一律更低
    // （0.4412→0.4216、0.412→0.373），差值是「扣掉作弊式优化」。
    // 「有 adjusted 就用 adjusted、没有就退回 raw」会让缺 adjusted 的 11 个模型
    // 系统性偏高，人群里混着两套定义比人群小更糟。
    league: 'gso',
    filePatterns: [/^gso(_external)?\.csv$/i],
    scoreColumns: ['OPT@1 (hack-adjusted)'],
    scale: 'fraction',
    unit: 'pct',
    note: '只取 hack-adjusted 的 OPT@1（0–1 小数，乘 100）。不做「adjusted 缺失时退回 raw」的兜底，那会让人群混着两套定义。Scaffold 全文件统一为 OpenHands。',
  },
  {
    league: 'frontier_code',
    filePatterns: [/^frontiercode(_external)?\.csv$/i],
    scoreColumns: ['Main score'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Main score 是 0–1 小数（0.08–0.535），乘 100 后落在 8–53.5，与 models.dev 侧的自报值（13.4–53.4）同量纲，可以并进同一个赛制。Aggregation 全文件为 Mean@5。',
  },
  {
    // FrontierSWE 的 Dominance 是**池内相对胜率**，不是解题率：
    // 它等于「在当前候选池里能赢过多少比例的其他模型」，池子一变分数就变。
    // 实测 glm-5.2 在 Epoch 这边是 0.67，在厂商自报里是 74.4——同一个模型、
    // 同一个指标名、不同的池子，所以这两个数本来就对不上。
    //
    // 量纲仍标 pct 而不是 index，两个理由：
    //   1. 乘 100 之后落在 20–88，与 models.dev 侧的自报值（73.5–81.2）同一个标度，
    //      同一个赛制里必须只有一种量纲，否则前端的分位池会混着两种标度。
    //   2. 「赢过多少比例的对手」终究是一个比例，写成百分数不算撒谎。
    // 但它**不是**「解决了百分之多少的任务」，这一点写进 docs/DATA.md 备注了。
    league: 'frontier_swe',
    filePatterns: [/^frontierswe(_external)?\.csv$/i],
    scoreColumns: ['Dominance'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Dominance 是池内相对胜率（0.2–0.88），乘 100 与厂商自报侧对齐标度。同文件的 Average rank / Implementation rank 等是名次，方向相反，不用。',
  },
  {
    // AlgoTune 的 Score 是**加速倍率**（实测 1.31–2.05，即 1.3~2 倍），
    // 既不是百分数也不是名次。乘 100 会得到 131–205 这种越界值，
    // 正好会被 validate.ts 的 pct 区间检查拦下来——那道检查就是为这种错误准备的。
    league: 'algotune',
    filePatterns: [/^algotune(_external)?\.csv$/i],
    scoreColumns: ['Score'],
    scale: 'raw',
    unit: 'index',
    note: 'Score 是相对参考实现的加速倍率（1.31–2.05），原样保留并标 index。绝不能乘 100 当百分数。',
  },
  {
    league: 'mirrorcode',
    filePatterns: [/^mirrorcode(_external)?\.csv$/i],
    scoreColumns: ['mean_score', 'Best score (across scorers)'],
    scale: 'fraction',
    unit: 'pct',
    note: 'Epoch 自测榜，mean_score 是 0–1 小数（0.089–0.639），乘 100。只有 6 行，人群极小。',
  },
];

/**
 * 刻意**不解析**的编程 CSV，以及理由。写在这里而不是删掉，
 * 是为了让下一个人知道「这个文件被看过了」，不用再调研一遍。
 *
 * `live_bench_external.csv`（113 行，有现成的 Coding average 列）：
 *   不接。它的 `LiveBench Version` 列全文件是 `LiveBench-2024-11-25`，
 *   属于 LiveBench 的 `LCB_generation` 旧题目集时代。实测同一个模型跨越
 *   2025-04-02 → 2025-04-25 这个题目集断点时，Coding 分中位数就差 27.6 分、最大 41.9 分
 *   （command-r-08-2024：6.1 → 26.1）。把 2024-11 的分和 2026 的分放进同一个赛制，
 *   模型的档位会取决于它碰巧在哪个 release 被跑过，而不是它有多强。
 *   LiveBench 改从官方 CSV 接（sources/livebench.ts），那边可以精确挑同一个题目集同期。
 *
 * `scicode_external.csv`：AA 血缘，见 lib/compliance.ts。
 *
 * `cybench_external.csv` / `exploitbench_external.csv`：安全攻防，不是写业务代码。
 * `os_world_external.csv` / `osworld_2_external.csv` / `the_agent_company_external.csv`：
 *   计算机操作与办公自动化，同第一阶段排除 automationbench 的理由。
 */
const EPOCH_CODING_SKIPPED = ['live_bench_external.csv', 'scicode_external.csv'];

// ── 泛化接入：benchmark_metadata.csv 驱动的其余榜单 ─────────────────────
//
// zip 里 77 个 CSV，手写规格只吃了 17 个。剩下的靴子由上游自己的 `benchmark_metadata.csv`
// 来提：它按文件声明了分数列（score_column）、量纲（scale）、随机基线、满分与替代关系。
// 这样 Epoch 新增一个榜单，下一次同步它就自动出现在 `scores[]` 与 `benchmarks[]` 里，
// 不需要有人来加规格——「发布后不用人管」在榜单维度上的落地。

/**
 * 文件名 → 手写规格用的 league id。泛化路径的 id 是「文件名去 `.csv` 与 `_external`」，
 * 但手写规格早于这条约定，几个榜的 id 与文件名对不上；两边必须指向同一个 league，
 * 否则 `scores[]` 去重会把同一个榜当成两个。
 */
const LEAGUE_ID_ALIASES: Record<string, string> = {
  epoch_capabilities_index: 'eci',
  otis_mock_aime_2024_2025: 'aime',
  fictionlivebench: 'fiction_live',
  webdev_arena: 'webdev_arena_elo',
  terminalbench: 'terminal_bench_2_0',
  frontiercode: 'frontier_code',
  frontierswe: 'frontier_swe',
};

/**
 * 对 metadata 声明的**逐榜覆盖**，以及 metadata 里没有条目、但分布已经人工查过的文件。
 * 与 CODING_BENCHMARKS 同一条纪律：每一条的量纲都是看过实际分布定的，理由写在 note 里。
 */
interface LeagueOverride {
  scoreColumn: string;
  unit: ScoreUnit;
  /** 原始值乘它得到快照分数 */
  multiplier: number;
  note: string;
}
const LEAGUE_OVERRIDES: Record<string, LeagueOverride> = {
  // metadata 给的 score_column 是 average_score（0.10–0.85 的归一分），但这个榜真正
  // 有意义的量是「能独立完成多长的任务」。Time horizon 列实测 0.05–1045，单位是分钟，
  // 契约为它专门开了 'minutes' 这一档。v1.0 与 v1.1 两版混在一个文件里，同模型取最好成绩。
  metr_time_horizons: {
    scoreColumn: 'Time horizon',
    unit: 'minutes',
    multiplier: 1,
    note: 'Time horizon 是 50% 成功率下的任务时长（分钟），原样保留。不用 average_score。',
  },
  // metadata 里没有它。Score 是经营净值，实测 −31 到 11182 美元，可以为负。
  vending_bench_2: {
    scoreColumn: 'Score',
    unit: 'usd',
    multiplier: 1,
    note: 'Score 是 Vending-Bench 2 的经营净值（美元），原样保留，允许负数。',
  },
  // metadata 里 VideoMME 的 source_file 为空。取无字幕的总分，与榜单默认展示一致。
  video_mme: {
    scoreColumn: 'Overall (no subtitles)',
    unit: 'pct',
    multiplier: 100,
    note: 'Overall (no subtitles) 是 0–1 小数（0.38–0.80），乘 100。有字幕的一列不用。',
  },
};

/**
 * 泛化路径刻意跳过的文件，以及理由。scicode 由合规闸门拦，不在这里。
 */
const EPOCH_GENERIC_SKIPPED: Record<string, string> = {
  'live_bench_external.csv':
    '整份是 LiveBench-2024-11-25 旧题目集，与官方源采用的同期不可同池；LiveBench 走 sources/livebench.ts',
};

/**
 * metadata 没列出分数列时，在表头里按这个顺序找**唯一**能认的分数列。
 * 找到之后还要过量纲判定：全部值落在 0–1 才当作小数乘 100，否则跳过并记理由——
 * 宁可少接一个榜，不端出一个量纲错的数字。
 */
const GENERIC_SCORE_COLUMNS = [
  'Best score (across scorers)',
  'mean_score',
  'Overall score',
  'Overall',
  'Score',
  'Accuracy',
  'Overall accuracy',
  'Mean score',
];

/** 有这两列之一说明是 Epoch 自己用 Inspect 复跑的，而不是转载。 */
const SELF_RUN_COLUMNS = ['Log viewer', 'Logs'];

interface BenchmarkMetadataRow {
  benchmark: string;
  inEci: boolean;
  sourceFile: string | null;
  scoreColumn: string | null;
  /** 原始值乘 scale 得到 0–1 的归一分 */
  scale: number;
  randomBaseline: number | null;
  scoreCeiling: number | null;
  releaseDate: string | null;
  supersededBy: string | null;
}

const NAME_COLUMNS = ['Model name', 'Name', 'Display name', 'Model'];
const VERSION_COLUMNS = ['Model version', 'Model', 'id'];
const SOURCE_URL_COLUMNS = [
  'Source link (site from table)',
  'Source link',
  'Source Link',
  'Source',
];

/** Epoch 的 Country 是国名全称，转成 ISO 3166-1 alpha-2 供厂商注册表兜底。 */
const COUNTRY_TO_ISO: Record<string, string> = {
  'united states of america': 'US',
  'united states': 'US',
  usa: 'US',
  china: 'CN',
  france: 'FR',
  'united kingdom': 'GB',
  uk: 'GB',
  canada: 'CA',
  israel: 'IL',
  germany: 'DE',
  japan: 'JP',
  'south korea': 'KR',
  korea: 'KR',
  singapore: 'SG',
  india: 'IN',
  'united arab emirates': 'AE',
  'saudi arabia': 'SA',
  switzerland: 'CH',
  russia: 'RU',
  turkey: 'TR',
  'hong kong': 'HK',
  taiwan: 'TW',
  australia: 'AU',
  netherlands: 'NL',
  sweden: 'SE',
  finland: 'FI',
  spain: 'ES',
  italy: 'IT',
  poland: 'PL',
  brazil: 'BR',
  vietnam: 'VN',
};

function pickColumn(header: string[], candidates: string[]): string | null {
  const lower = new Map(header.map((h) => [h.trim().toLowerCase(), h]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * zip 内文件名 → league id：去掉目录、`.csv`、`_external`，再查手写规格的别名表。
 * 这就是契约里 `BenchmarkScore.league` 与 `BenchmarkMeta.id` 的定义，前端注册表按它查。
 */
export function leagueIdFromFile(fileName: string): string {
  const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
  const stem = base.replace(/\.csv$/, '').replace(/_external$/, '');
  return LEAGUE_ID_ALIASES[stem] ?? stem;
}

/**
 * metadata 的 `scale` 是「原始值乘它得到 0–1」：1.0 表示本来就是小数，
 * 0.01 表示本来是 0–100，0.1 表示本来是 0–10。换算到本站的百分数还要再乘 100。
 */
export function pctMultiplierFromScale(scale: number): number {
  return round2(scale * 100);
}

function parseBool(raw: string | undefined): boolean {
  return (raw ?? '').trim().toLowerCase() === 'true';
}

function parseNumberOrNull(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseBenchmarkMetadata(rows: Record<string, string>[]): BenchmarkMetadataRow[] {
  const out: BenchmarkMetadataRow[] = [];
  for (const row of rows) {
    const benchmark = (row.benchmark ?? '').trim();
    if (!benchmark) continue;
    const scale = parseNumberOrNull(row.scale);
    out.push({
      benchmark,
      inEci: parseBool(row.in_eci),
      sourceFile: (row.source_file ?? '').trim() || null,
      scoreColumn: (row.score_column ?? '').trim() || null,
      scale: scale && scale > 0 ? scale : 1,
      randomBaseline: parseNumberOrNull(row.random_baseline),
      scoreCeiling: parseNumberOrNull(row.score_ceiling),
      releaseDate: parseLooseDate(row.release_date)?.iso ?? null,
      supersededBy: (row.superseded_by ?? '').trim() || null,
    });
  }
  return out;
}

/** 分数索引的三份键：与编程 CSV 那边完全同一套规则，只是目标 Map 不同。 */
function registerLeagueScore(
  target: {
    strict: Map<string, Record<string, EpochCodingScore>>;
    loose: Map<string, Record<string, EpochCodingScore>>;
    unsized: Map<string, Record<string, EpochCodingScore>>;
  },
  vendorId: string,
  version: string,
  name: string,
  league: string,
  score: number,
  unit: ScoreUnit,
  sourceUrl: string | null,
): void {
  const looseKeys = new Set<string>();
  const register = (rawId: string) => {
    if (!rawId) return;
    const base = stripEffortSuffix(rawId).split('/').pop() ?? rawId;
    for (const v of slugVariants(base)) looseKeys.add(`${vendorId}|${v}`);
  };
  register(version);
  register(name);
  if (name) register(stripParenthetical(name));
  for (const k of looseKeys) mergeCodingInto(target.loose, k, league, score, unit, sourceUrl);
  const strictBase = stripEffortSuffix(version || name).split('/').pop() ?? '';
  const strictKey = slugVariants(strictBase)[0];
  if (strictKey) {
    mergeCodingInto(target.strict, `${vendorId}|${strictKey}`, league, score, unit, sourceUrl);
  }
  if (!hasParamToken(name) && !hasParamToken(version)) {
    for (const k of looseKeys) mergeCodingInto(target.unsized, k, league, score, unit, sourceUrl);
  }
}

function emptyAggregate(): EpochAggregate {
  return { scores: {}, releaseDate: null, organization: null, country: null };
}

function mergeInto(
  map: Map<string, EpochAggregate>,
  key: string,
  key2: BenchKey | null,
  score: number | null,
  releaseDate: LooseDate | null,
  organization: string | null,
  country: string | null,
): void {
  let agg = map.get(key);
  if (!agg) {
    agg = emptyAggregate();
    map.set(key, agg);
  }
  if (key2 && score !== null) {
    const prev = agg.scores[key2];
    // 同一模型的不同 reasoning effort 会各占一行，取最好成绩作为这个角色的战力上限。
    agg.scores[key2] = prev === undefined ? score : Math.max(prev, score);
  }
  if (releaseDate && (!agg.releaseDate || releaseDate.iso < agg.releaseDate.iso)) {
    agg.releaseDate = releaseDate;
  }
  if (organization && !agg.organization) agg.organization = organization;
  if (country && !agg.country) agg.country = country;
}

/**
 * 把一条编程成绩并进**独立的**编程索引。
 *
 * 为什么编程成绩不能和 `strict`/`loose` 那套共用索引：那套索引服务的是
 * `Benchmarks` 里的 7 个固定指标，而 `lookupEpoch` 是「命中第一个候选就返回」。
 * 编程 CSV 的模型全集比那 7 个榜大得多，混进同一份索引会**凭空多出一批
 * 只有编程分、没有 ECI 的键**，于是某个模型的第一候选命中了这种键就提前返回，
 * 本来能在后面的宽松档里找到的 ECI 反而丢了。实测这个 shadowing 会让 ECI 覆盖掉一个模型。
 *
 * 分成两套索引之后，两个通道各自取自己的最佳匹配，互不干扰——
 * 一个模型完全可以「用型号名匹配上 ECI、用展示名匹配上编程分」，那是好事不是问题。
 *
 * 同一模型同一赛制有多行（不同 reasoning effort、不同 agent / scaffold）时取最高分，
 * 与 `mergeInto` 对 reasoning effort 的处理保持一致，语义是「已知的战力上限」。
 * 取 max 而不是平均：平均会被「某个很差的 agent 拖累」污染，而且各 agent 的行数分布不均。
 */
function mergeCodingInto(
  map: Map<string, Record<string, EpochCodingScore>>,
  key: string,
  league: string,
  score: number,
  unit: ScoreUnit,
  sourceUrl: string | null,
): void {
  let bucket = map.get(key);
  if (!bucket) {
    bucket = {};
    map.set(key, bucket);
  }
  const prev = bucket[league];
  if (!prev || score > prev.score) {
    bucket[league] = { league, score, unit, sourceUrl };
  }
}

/**
 * 去重后的上游模型实体键。
 *
 * 这一层是为了让「上游有多少、我们接住多少」这个指标说得通。
 * Epoch 的 CSV 一个模型会占很多行：每个 reasoning effort 一行、带日期的快照版本各占一行，
 * 而索引又会为同一行注册 version / name / 去括号名 多个别名键。
 * 直接拿「有分数的行数」当分母，ECI 会算出 562 分之 172、看起来丢了 69%，
 * 而真实情况是 182 个模型接住了 121 个。**这个虚高的分母误导过人，不要再用它。**
 *
 * 归一到「名字」而不是「版本号」：`GPT-5` 与 `gpt-5-2025-08-07` 的 Model name 都是 GPT-5，
 * 按名字归一它们就合成一条；按版本归一则永远是两条。
 */
function entityKeyOf(vendorId: string, name: string, version: string): string | null {
  const basis = name || version;
  if (!basis) return null;
  const canon = slugVariants(stripParenthetical(stripEffortSuffix(basis)))[0];
  return canon ? `${vendorId}|${canon}` : null;
}

export async function fetchEpoch(fetchedAt: string): Promise<EpochResult> {
  const strict = new Map<string, EpochAggregate>();
  const loose = new Map<string, EpochAggregate>();
  const unsized = new Map<string, EpochAggregate>();
  const unsizedAliasOwners = new Map<string, Set<string>>();
  const entities = new Map<string, EpochEntity>();
  const aliasOwners = new Map<string, Set<string>>();
  const vendorCountry = new Map<string, string>();
  const counts: Record<string, number> = {};
  const codingStrict = new Map<string, Record<string, EpochCodingScore>>();
  const codingLoose = new Map<string, Record<string, EpochCodingScore>>();
  const codingUnsized = new Map<string, Record<string, EpochCodingScore>>();
  const leagueStrict = new Map<string, Record<string, EpochCodingScore>>();
  const leagueLoose = new Map<string, Record<string, EpochCodingScore>>();
  const leagueUnsized = new Map<string, Record<string, EpochCodingScore>>();
  const trainingComputeStrict = new Map<string, number | null>();
  const trainingComputeLoose = new Map<string, number | null>();
  const leagues: Record<string, EpochLeagueInfo> = {};
  const skippedFiles: Array<{ file: string; reason: string }> = [];

  let files: Record<string, Uint8Array>;
  try {
    const res = await fetchWithCache(ENDPOINTS.epochBenchmarkZip, {
      label: 'epoch.ai/benchmark_data.zip',
    });
    files = unzipSync(new Uint8Array(res.body));
  } catch (err) {
    log.error(`Epoch ZIP 抓取/解压失败：${errorMessage(err)}`);
    return {
      status: { ok: false, fetchedAt: null, note: `抓取或解压失败：${errorMessage(err)}` },
      strict,
      loose,
      unsized,
      unsizedAliasOwners,
      entities,
      aliasOwners,
      vendorCountry,
      counts,
      codingStrict,
      codingLoose,
      codingUnsized,
      codingCounts: {},
      blockedFiles: [],
      exemptFiles: [],
      skippedFiles,
      leagues,
      leagueStrict,
      leagueLoose,
      leagueUnsized,
      trainingComputeStrict,
      trainingComputeLoose,
      trainingComputeRows: 0,
    };
  }

  const names = Object.keys(files).sort();
  log.info(`Epoch ZIP 解压出 ${names.length} 个条目`);
  const missing: string[] = [];
  const blockedFiles: Array<{ file: string; reason: string }> = [];
  const exemptFiles: Array<{ file: string; reason: string }> = [];

  /*
   * 合规审计**先扫全 zip，再决定解析谁**，而不是等到要解析某个文件时才查。
   *
   * 差别不只是顺序：懒查的话，被我们主动跳过的文件（scicode 在 CODING_BENCHMARKS 里
   * 压根没有对应的 spec）永远不会被查，报告里就会写「合规拦截 0 个」——
   * 看起来像是查过了并且干净，实际是没查。而这份审计恰恰要回答
   * 「上游这次有没有新增带 AA / LMArena 血缘的文件」，那必须是全量扫描。
   */
  const blockedNames = new Set<string>();
  for (const fileName of names) {
    if (!fileName.toLowerCase().endsWith('.csv')) continue;
    const verdict = classifyEpochFile(fileName, Buffer.from(files[fileName]).toString('utf8'));
    if (verdict.blocked) {
      blockedNames.add(fileName);
      blockedFiles.push({ file: fileName, reason: verdict.reason ?? '' });
      continue;
    }
    if (verdict.hosts.length > 0 && verdict.reason) {
      exemptFiles.push({ file: fileName, reason: verdict.reason });
    }
  }
  for (const b of blockedFiles) log.warn(`Epoch ${b.file} 因合规不予解析：${b.reason}`);
  for (const e of exemptFiles) {
    log.info(`Epoch ${e.file} 命中 LMArena 血缘但按既有决定放行：${e.reason}`);
  }

  /** 找到文件、确认它不在拦截名单里，再交给调用方解析。 */
  const openFile = (
    filePatterns: RegExp[],
    label: string,
  ): { fileName: string; rows: Record<string, string>[] } | null => {
    const fileName = filePatterns
      .map((re) => names.find((n) => re.test(n.split('/').pop() ?? n)))
      .find((n): n is string => Boolean(n));
    if (!fileName) {
      log.warn(`Epoch ZIP 里找不到 ${label} 对应的 CSV，该项本次留空`);
      return null;
    }
    if (blockedNames.has(fileName)) {
      log.warn(`Epoch ${label} 想用的 ${fileName} 在合规拦截名单里，该项留空`);
      return null;
    }
    const text = Buffer.from(files[fileName]).toString('utf8');
    let rows: Record<string, string>[];
    try {
      rows = parseCsv(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
        trim: false,
      }) as Record<string, string>[];
    } catch (err) {
      log.warn(`Epoch ${fileName} 解析失败：${errorMessage(err)}`);
      return null;
    }
    if (rows.length === 0) return null;
    return { fileName, rows };
  };

  // ── benchmark_metadata.csv：榜单元信息，泛化接入的地基 ─────────────────
  const metaOpened = openFile([/^benchmark_metadata\.csv$/i], 'benchmark_metadata');
  const metaRows = metaOpened ? parseBenchmarkMetadata(metaOpened.rows) : [];
  if (metaRows.length === 0) {
    log.warn('Epoch ZIP 里没有可用的 benchmark_metadata.csv，本次只接手写规格的榜单');
  } else {
    log.info(`Epoch benchmark_metadata.csv：${metaRows.length} 个榜单条目`);
  }
  /** 按 source_file 精确匹配；source_file 为空的条目再按「名字去分隔符 = 文件名去分隔符」兜一次。 */
  const metaForFile = (fileName: string): BenchmarkMetadataRow | null => {
    const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
    const exact = metaRows.find((m) => m.sourceFile?.toLowerCase() === base);
    if (exact) return exact;
    const stem = alnum(base.replace(/\.csv$/, '').replace(/_external$/, ''));
    return metaRows.find((m) => !m.sourceFile && alnum(m.benchmark) === stem) ?? null;
  };
  /** metadata 的 superseded_by 写的是榜单名，换算成 league id；换算不出来就保留原文，不丢信息。 */
  const supersededLeagueOf = (name: string | null): string | null => {
    if (!name) return null;
    const target = metaRows.find((m) => m.benchmark === name);
    return target?.sourceFile ? leagueIdFromFile(target.sourceFile) : name;
  };
  const registerLeague = (
    league: string,
    fileName: string,
    header: string[],
    scoreColumn: string,
    unit: ScoreUnit,
    multiplier: number,
    curated: boolean,
    rows: number,
    scored: number,
    outOfRange: number,
  ): void => {
    const meta = metaForFile(fileName);
    const isPct = unit === 'pct';
    leagues[league] = {
      league,
      fileName,
      scoreColumn,
      unit,
      multiplier,
      upstreamName: meta?.benchmark ?? null,
      inEci: meta?.inEci ?? false,
      randomBaseline: isPct && meta?.randomBaseline != null ? round2(meta.randomBaseline * 100) : null,
      scoreCeiling: isPct && meta?.scoreCeiling != null ? round2(meta.scoreCeiling * 100) : null,
      releaseDate: meta?.releaseDate ?? null,
      supersededBy: supersededLeagueOf(meta?.supersededBy ?? null),
      selfRun:
        !/_external\.csv$/i.test(fileName) || SELF_RUN_COLUMNS.some((c) => header.includes(c)),
      curated,
      rows,
      scored,
      outOfRange,
    };
  };

  for (const spec of BENCHMARKS) {
    const opened = openFile(spec.filePatterns, spec.key);
    if (!opened) {
      missing.push(spec.key);
      continue;
    }
    const { fileName, rows } = opened;
    const header = Object.keys(rows[0]);
    const scoreCol = pickColumn(header, spec.scoreColumns);
    if (!scoreCol) {
      missing.push(spec.key);
      log.warn(
        `Epoch ${fileName} 表头里找不到分数列（候选 ${spec.scoreColumns.join(' / ')}），实际表头：${header.join(' | ')}`,
      );
      continue;
    }
    const nameCol = pickColumn(header, NAME_COLUMNS);
    const versionCol = pickColumn(header, VERSION_COLUMNS);
    // 新版 eci_scores.csv 的发布日期列只叫 "date"，放最后当兜底，避免抢了别的表里更明确的列
    const relCol = pickColumn(header, ['Release date', 'Publication date', 'date']);
    const orgCol = pickColumn(header, ['Organization', 'Model Org', 'Organisation']);
    const countryCol = pickColumn(header, ['Country', 'Country (of organization)']);

    let scored = 0;
    for (const row of rows) {
      const rawScore = (row[scoreCol] ?? '').trim();
      const version = versionCol ? (row[versionCol] ?? '').trim() : '';
      const name = nameCol ? (row[nameCol] ?? '').trim() : '';
      if (!version && !name) continue;

      const org = orgCol ? (row[orgCol] ?? '').trim() : '';
      const vendorId = vendorFromEpochOrg(org);
      const countryRaw = countryCol ? (row[countryCol] ?? '').trim().toLowerCase() : '';
      const iso = COUNTRY_TO_ISO[countryRaw] ?? null;
      if (vendorId && iso && !vendorCountry.has(vendorId)) vendorCountry.set(vendorId, iso);
      if (!vendorId) continue;

      const releaseDate = relCol ? parseLooseDate(row[relCol]) : null;

      let score: number | null = null;
      if (rawScore) {
        const n = Number(rawScore);
        if (Number.isFinite(n)) {
          score = spec.scale === 'fraction' ? round2(n * 100) : round2(n);
          scored += 1;
        }
      }

      const strictKeys = new Set<string>();
      const looseKeys = new Set<string>();
      const register = (raw: string, strictToo: boolean) => {
        if (!raw) return;
        const base = stripEffortSuffix(raw).split('/').pop() ?? raw;
        const variants = slugVariants(base);
        if (strictToo && variants[0]) strictKeys.add(`${vendorId}|${variants[0]}`);
        for (const v of variants) looseKeys.add(`${vendorId}|${v}`);
      };
      register(version, true);
      register(name, true);
      /*
       * 括号是上游区分「同名升级版」的手段，处理它要同时照顾两边。
       *
       * 上游同时有 `DeepSeek-R1 (May 2025)`（141.29，其实是 R1-0528）
       * 和 `DeepSeek-R1`（138.97，初版），两行各有各的分。
       *
       * 原来的写法把去括号的名字也注册进**严格键**，括号行因此撞掉了纯名行，
       * 后写覆盖先写——初版拿到了升级版的分。但只是把它降级到宽松层还不够：
       * 那样轮到 `deepseek-r1-0528` 去查时，它的严格键 `deepseekr10528` 谁都没占，
       * 退到宽松层就跟初版抢同一个 `deepseekr1`，错误只是从一边挪到了另一边。
       *
       * 所以分两步：去括号的名字降级到宽松层（那 40 条没有纯名版本的行仍然靠它兜住），
       * 同时用 `date` 列补一个 `名字 + MMDD` 的严格键——上游给的是精确日期
       * （"(May 2025)" 对应 2025-05-28），正好拼出我们那边 `deepseek-r1-0528` 的形状，
       * 让升级版精确命中自己那一行。两边各归各位。
       *
       * 编程成绩那条路径（registerLeagueScore）本来就把去括号名只放宽松层，这里是对齐它。
       */
      if (name) {
        const bare = stripParenthetical(name);
        register(bare, false);
        if (bare && bare !== name && releaseDate?.precision === 'day') {
          const mmdd = releaseDate.iso.slice(5).replace('-', '');
          if (/^\d{4}$/.test(mmdd)) register(`${bare}-${mmdd}`, true);
        }
      }

      for (const k of strictKeys) {
        mergeInto(strict, k, score === null ? null : spec.key, score, releaseDate, org || null, iso);
      }
      for (const k of looseKeys) {
        mergeInto(loose, k, score === null ? null : spec.key, score, releaseDate, org || null, iso);
      }

      // 上游标识里自己没带参数量的行，另建一份索引，供 merge/build.ts 的
      // 「去参数量」末级兜底使用。带了规模标记的（"Llama 3.1-405B"）绝不进这份索引，
      // 否则会把 405B 的成绩挂到 70B 头上——见 lib/ids.ts 的 paramStrippedVariants。
      const sized = hasParamToken(name) || hasParamToken(version);
      if (!sized) {
        for (const k of looseKeys) {
          mergeInto(
            unsized,
            k,
            score === null ? null : spec.key,
            score,
            releaseDate,
            org || null,
            iso,
          );
        }
      }

      // 实体去重：一个真实模型一条，别名与效率变体全部归到同一条。
      const entityKey = entityKeyOf(vendorId, name, version);
      if (entityKey) {
        if (!sized) {
          // 记下每个别名键被哪些上游实体注册过。
          // `mistral|mistralsmall` 会被 Mistral Small 3 / 3.1 / 3.2 同时注册，
          // 那个键上的聚合值是几代模型取 max 的结果，谁都不该拿它当自己的成绩。
          for (const k of looseKeys) {
            const owners = unsizedAliasOwners.get(k) ?? new Set<string>();
            owners.add(entityKey);
            unsizedAliasOwners.set(k, owners);
          }
        }
        let entity = entities.get(entityKey);
        if (!entity) {
          entity = {
            key: entityKey,
            vendorId,
            label: (name || version).trim(),
            organization: org || null,
            benchmarks: [],
            sized,
          };
          entities.set(entityKey, entity);
        }
        if (score !== null && !entity.benchmarks.includes(spec.key)) {
          entity.benchmarks.push(spec.key);
        }
        // 一个别名键可能被多个实体注册：Epoch 里 "Gemini 3 Flash" 与
        // "gemini-3-flash-preview" 是两条记录，但剥掉 -preview 之后共用同一个键。
        // 记全部而不是只记第一个——只记第一个的话，我们的模型明明接住了那个上游模型，
        // 报告里另一条却显示「未接住」，又是一个假告警。
        for (const k of looseKeys) {
          const owners = aliasOwners.get(k) ?? new Set<string>();
          owners.add(entityKey);
          aliasOwners.set(k, owners);
        }
      }
    }
    counts[spec.key] = scored;
    registerLeague(
      spec.key,
      fileName,
      header,
      scoreCol,
      spec.unit,
      spec.scale === 'fraction' ? 100 : 1,
      true,
      rows.length,
      scored,
      0,
    );
    log.info(`Epoch ${fileName} → ${spec.key}：${rows.length} 行，${scored} 行有分数（列 "${scoreCol}"）`);
  }

  // ── 编程类 CSV ──────────────────────────────────────────────────────
  // 这些不进 Benchmarks 的固定字段，直接进 ModelRecord.coding[]。
  const codingCounts: Record<string, number> = {};
  for (const spec of CODING_BENCHMARKS) {
    const opened = openFile(spec.filePatterns, spec.league);
    if (!opened) continue;
    const { fileName, rows } = opened;
    const header = Object.keys(rows[0]);
    const scoreCol = pickColumn(header, spec.scoreColumns);
    if (!scoreCol) {
      log.warn(
        `Epoch ${fileName} 表头里找不到分数列（候选 ${spec.scoreColumns.join(' / ')}），` +
          `赛制 ${spec.league} 本次留空。实际表头：${header.join(' | ')}`,
      );
      continue;
    }
    const nameCol = pickColumn(header, NAME_COLUMNS);
    const versionCol = pickColumn(header, VERSION_COLUMNS);
    const orgCol = pickColumn(header, ['Organization', 'Model Org', 'Organisation']);
    const countryCol = pickColumn(header, ['Country', 'Country (of organization)']);
    const srcCol = pickColumn(header, SOURCE_URL_COLUMNS);

    let scored = 0;
    for (const row of rows) {
      const raw = (row[scoreCol] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const version = versionCol ? (row[versionCol] ?? '').trim() : '';
      const name = nameCol ? (row[nameCol] ?? '').trim() : '';
      if (!version && !name) continue;

      const org = orgCol ? (row[orgCol] ?? '').trim() : '';
      const vendorId = vendorFromEpochOrg(org);
      const countryRaw = countryCol ? (row[countryCol] ?? '').trim().toLowerCase() : '';
      const iso = COUNTRY_TO_ISO[countryRaw] ?? null;
      if (vendorId && iso && !vendorCountry.has(vendorId)) vendorCountry.set(vendorId, iso);
      if (!vendorId) continue;

      const score = spec.scale === 'fraction' ? round2(n * 100) : round2(n);
      // `*_external.csv` 是 Epoch 转载别人的榜，署名要给到原榜。
      // 这一列有时写的是榜单名而不是 URL（"Aider LLM Leaderboards"），那种就当没有。
      const rawSrc = srcCol ? (row[srcCol] ?? '').trim() : '';
      const sourceUrl = /^https?:\/\//i.test(rawSrc) ? rawSrc : null;

      const looseKeys = new Set<string>();
      const register = (rawId: string) => {
        if (!rawId) return;
        const base = stripEffortSuffix(rawId).split('/').pop() ?? rawId;
        for (const v of slugVariants(base)) looseKeys.add(`${vendorId}|${v}`);
      };
      register(version);
      register(name);
      if (name) register(stripParenthetical(name));

      for (const k of looseKeys) {
        mergeCodingInto(codingLoose, k, spec.league, score, spec.unit, sourceUrl);
      }
      // 严格键只认第一个候选，与 BENCHMARKS 那边的规则保持一致。
      const strictBase = stripEffortSuffix(version || name).split('/').pop() ?? '';
      const strictKey = slugVariants(strictBase)[0];
      if (strictKey) {
        mergeCodingInto(codingStrict, `${vendorId}|${strictKey}`, spec.league, score, spec.unit, sourceUrl);
      }
      // 去参数量兜底索引同样要带上编程成绩，否则 Nemotron 3 Ultra 这类
      // 只能靠兜底才匹配上的模型拿得到 ECI 却拿不到编程分。
      if (!hasParamToken(name) && !hasParamToken(version)) {
        for (const k of looseKeys) {
          mergeCodingInto(codingUnsized, k, spec.league, score, spec.unit, sourceUrl);
        }
      }
      // Epoch 那边的国别信息在编程 CSV 里也有，顺手补进厂商兜底表。
      // 但**不动 releaseDate**：发布日期的锚点只认 BENCHMARKS 那 7 个榜，
      // 编程 CSV 的 Release date 列同样可信，可是让它参与仲裁会改变既有结果，
      // 属于本轮范围之外的变动。
      scored += 1;
    }
    codingCounts[spec.league] = scored;
    registerLeague(
      spec.league,
      fileName,
      header,
      scoreCol,
      spec.unit,
      spec.scale === 'fraction' ? 100 : 1,
      true,
      rows.length,
      scored,
      0,
    );
    log.info(
      `Epoch ${fileName} → coding[${spec.league}]：${rows.length} 行，${scored} 行有分数` +
        `（列 "${scoreCol}"，${spec.scale === 'fraction' ? '×100 ' : '原样 '}→ ${spec.unit}）`,
    );
  }

  // ── 泛化路径：metadata 驱动，接入其余全部榜单 ─────────────────────────
  // 手写规格已经吃掉的文件不再重复解析（它们的分数走 benchmarks.* / coding[]，
  // 在 build.ts 里并进 scores[]）；这里只管剩下的。
  const curatedFiles = new Set(Object.values(leagues).map((l) => l.fileName));
  let genericParsed = 0;
  for (const fileName of names) {
    const base = fileName.split('/').pop() ?? fileName;
    if (!base.toLowerCase().endsWith('.csv')) continue;
    if (fileName.includes('/')) continue; // additional_eci_data/ 里是 ECI 的拟合参数，不是榜单
    if (/^(benchmark|model)_metadata\.csv$/i.test(base)) continue;
    if (blockedNames.has(fileName) || curatedFiles.has(fileName)) continue;
    const skipReason = EPOCH_GENERIC_SKIPPED[base.toLowerCase()];
    if (skipReason) {
      skippedFiles.push({ file: base, reason: skipReason });
      continue;
    }
    const league = leagueIdFromFile(base);
    if (leagues[league]) {
      skippedFiles.push({ file: base, reason: `league id ${league} 已被 ${leagues[league].fileName} 占用` });
      continue;
    }
    const opened = openFile([new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')], league);
    if (!opened) {
      skippedFiles.push({ file: base, reason: 'CSV 为空或解析失败' });
      continue;
    }
    const { rows } = opened;
    const header = Object.keys(rows[0]);
    const meta = metaForFile(base);
    const override = LEAGUE_OVERRIDES[league];

    // 定分数列与量纲：逐榜覆盖 > metadata 声明 > 表头启发式 + 分布判定
    let scoreCol: string | null = null;
    let unit: ScoreUnit = 'pct';
    let multiplier = 100;
    if (override) {
      scoreCol = pickColumn(header, [override.scoreColumn]);
      unit = override.unit;
      multiplier = override.multiplier;
      if (!scoreCol) {
        skippedFiles.push({ file: base, reason: `覆盖规格指定的列 "${override.scoreColumn}" 不在表头里` });
        continue;
      }
    } else if (meta?.scoreColumn) {
      scoreCol = pickColumn(header, [meta.scoreColumn]);
      multiplier = pctMultiplierFromScale(meta.scale);
      if (!scoreCol) {
        skippedFiles.push({
          file: base,
          reason: `metadata 声明的分数列 "${meta.scoreColumn}" 不在表头里（实际表头：${header.join(' | ')}）`,
        });
        continue;
      }
    } else {
      scoreCol = pickColumn(header, GENERIC_SCORE_COLUMNS);
      if (!scoreCol) {
        skippedFiles.push({ file: base, reason: `metadata 无条目，表头里也认不出唯一分数列（${header.join(' | ')}）` });
        continue;
      }
      const values = rows
        .map((r) => Number((r[scoreCol!] ?? '').trim()))
        .filter((n) => Number.isFinite(n));
      if (values.length === 0) {
        skippedFiles.push({ file: base, reason: `列 "${scoreCol}" 没有数值` });
        continue;
      }
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (lo >= 0 && hi <= 1) {
        multiplier = 100;
      } else if (/%|percent/i.test(scoreCol) && lo >= 0 && hi <= 100) {
        multiplier = 1;
      } else {
        skippedFiles.push({
          file: base,
          reason: `metadata 无条目，列 "${scoreCol}" 实测区间 ${round2(lo)}–${round2(hi)}，量纲无法判定`,
        });
        continue;
      }
    }

    const nameCol = pickColumn(header, NAME_COLUMNS);
    const versionCol = pickColumn(header, VERSION_COLUMNS);
    const orgCol = pickColumn(header, ['Organization', 'Model Org', 'Organisation']);
    const countryCol = pickColumn(header, ['Country', 'Country (of organization)']);
    const srcCol = pickColumn(header, SOURCE_URL_COLUMNS);
    if (!orgCol) {
      skippedFiles.push({ file: base, reason: '没有 Organization 列，无法归属厂商' });
      continue;
    }

    let scored = 0;
    let outOfRange = 0;
    for (const row of rows) {
      const raw = (row[scoreCol] ?? '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const version = versionCol ? (row[versionCol] ?? '').trim() : '';
      const name = nameCol ? (row[nameCol] ?? '').trim() : '';
      if (!version && !name) continue;
      const org = (row[orgCol] ?? '').trim();
      const vendorId = vendorFromEpochOrg(org);
      const countryRaw = countryCol ? (row[countryCol] ?? '').trim().toLowerCase() : '';
      const iso = COUNTRY_TO_ISO[countryRaw] ?? null;
      if (vendorId && iso && !vendorCountry.has(vendorId)) vendorCountry.set(vendorId, iso);
      if (!vendorId) continue;

      const score = round2(n * multiplier);
      // 量纲护栏：pct 越界说明 metadata 的 scale 与实际列不符，这一行不要，也不要猜。
      if (unit === 'pct' && (score < 0 || score > 100)) {
        outOfRange += 1;
        continue;
      }
      if (unit === 'minutes' && score < 0) {
        outOfRange += 1;
        continue;
      }
      const rawSrc = srcCol ? (row[srcCol] ?? '').trim() : '';
      const sourceUrl = /^https?:\/\//i.test(rawSrc) ? rawSrc : null;
      registerLeagueScore(
        { strict: leagueStrict, loose: leagueLoose, unsized: leagueUnsized },
        vendorId,
        version,
        name,
        league,
        score,
        unit,
        sourceUrl,
      );
      scored += 1;
    }
    if (scored === 0) {
      skippedFiles.push({ file: base, reason: `列 "${scoreCol}" 没有一行能归属到已知厂商的合法分数` });
      continue;
    }
    registerLeague(league, base, header, scoreCol, unit, multiplier, false, rows.length, scored, outOfRange);
    genericParsed += 1;
    log.info(
      `Epoch ${base} → scores[${league}]：${rows.length} 行，${scored} 行有分数` +
        `（列 "${scoreCol}"，×${multiplier} → ${unit}${outOfRange ? `，越界丢弃 ${outOfRange} 行` : ''}）`,
    );
  }
  for (const s of skippedFiles) log.warn(`Epoch ${s.file} 未接入：${s.reason}`);

  // ── model_metadata.csv：训练算力 ─────────────────────────────────────
  let trainingComputeRows = 0;
  const modelMeta = openFile([/^model_metadata\.csv$/i], 'model_metadata');
  if (modelMeta) {
    const setFlop = (map: Map<string, number | null>, key: string, flop: number) => {
      if (!map.has(key)) {
        map.set(key, flop);
        return;
      }
      // 同一个键被不同数值注册过：几代模型共用一个别名（"Gemini 3 Flash" 系列），谁都不该拿。
      const prev = map.get(key);
      if (prev !== null && prev !== flop) map.set(key, null);
    };
    for (const row of modelMeta.rows) {
      const version = (row.model_version ?? '').trim();
      const name = (row.display_name ?? '').trim();
      if (!version && !name) continue;
      const vendorId = vendorFromEpochOrg((row.organization ?? '').trim());
      if (!vendorId) continue;
      const flop = parseNumberOrNull(row.training_compute_flop);
      if (flop === null || flop <= 0) continue;
      trainingComputeRows += 1;
      const looseKeys = new Set<string>();
      const register = (rawId: string) => {
        if (!rawId) return;
        const b = stripEffortSuffix(rawId).split('/').pop() ?? rawId;
        for (const v of slugVariants(b)) looseKeys.add(`${vendorId}|${v}`);
      };
      register(version);
      register(name);
      if (name) register(stripParenthetical(name));
      for (const k of looseKeys) setFlop(trainingComputeLoose, k, flop);
      const strictBase = stripEffortSuffix(version || name).split('/').pop() ?? '';
      const strictKey = slugVariants(strictBase)[0];
      if (strictKey) setFlop(trainingComputeStrict, `${vendorId}|${strictKey}`, flop);
    }
    log.info(
      `Epoch model_metadata.csv：${modelMeta.rows.length} 行，${trainingComputeRows} 行有训练算力估算` +
        `（严格键 ${trainingComputeStrict.size} 个，宽松键 ${trainingComputeLoose.size} 个）`,
    );
  } else {
    log.warn('Epoch ZIP 里没有 model_metadata.csv，训练算力本次留空');
  }

  const ok = Object.keys(counts).length > 0;
  log.info(
    `Epoch 去重后的上游模型实体 ${entities.size} 个（别名键 ${aliasOwners.size} 个）；` +
      `其中标识里不带参数量、可参与去参数量兜底的 ${[...entities.values()].filter((e) => !e.sized).length} 个`,
  );
  log.step(
    `Epoch 编程赛制：解析 ${Object.keys(codingCounts).length} 个 CSV；` +
      `全 zip 合规审计拦下 ${blockedFiles.length} 个（${blockedFiles.map((b) => b.file).join(', ') || '无'}），` +
      `血缘豁免放行 ${exemptFiles.length} 个（${exemptFiles.map((e) => e.file).join(', ') || '无'}）；` +
      `另有 ${EPOCH_CODING_SKIPPED.length} 个因口径/可比性主动跳过（${EPOCH_CODING_SKIPPED.join(', ')}）`,
  );
  log.step(
    `Epoch 全榜单泛化接入：metadata 驱动解析 ${genericParsed} 个 CSV，` +
      `连同手写规格共 ${Object.keys(leagues).length} 个榜单进入 scores[]；` +
      `未接入 ${skippedFiles.length} 个（理由见 sync-report.json 的 epochFilesSkipped）`,
  );
  return {
    status: {
      ok,
      fetchedAt: ok ? fetchedAt : null,
      note:
        `ZIP ${names.length} 个条目；` +
        `取到 ${Object.keys(counts).length}/7 个指标；` +
        `编程赛制 ${Object.keys(codingCounts).length} 个；` +
        `全榜单 ${Object.keys(leagues).length} 个；` +
        `训练算力 ${trainingComputeRows} 行；` +
        `去重后 ${entities.size} 个模型实体；` +
        `合规拦截 ${blockedFiles.length} 个文件` +
        (missing.length ? `；缺失：${missing.join(', ')}` : ''),
    },
    codingStrict,
    codingLoose,
    codingUnsized,
    codingCounts,
    blockedFiles,
    exemptFiles,
    skippedFiles,
    leagues,
    leagueStrict,
    leagueLoose,
    leagueUnsized,
    trainingComputeStrict,
    trainingComputeLoose,
    trainingComputeRows,
    strict,
    loose,
    unsized,
    unsizedAliasOwners,
    entities,
    aliasOwners,
    vendorCountry,
    counts,
  };
}

/**
 * 依「严格→宽松」四级顺序查表，尽量避免把 gpt-4-turbo 的成绩挂到 gpt-4 头上。
 *
 * 返回命中的别名键，调用方据此换算出「接住了哪个上游实体」，
 * 用于同步报告里的去重匹配率——不返回键的话那个指标只能靠猜。
 *
 * **不再「命中第一个候选就返回」，而是从严到宽逐档补齐缺失的指标。**
 * 2026-09 Epoch 新版 eci_scores.csv 只有展示名（"Gemini 3.1 Pro"），没有 API 型号列；
 * 而其他榜单的 CSV 仍按型号（gemini-3.1-pro-preview）登记。于是同一个模型的成绩被拆在
 * 两个别名键上：严格键 `gemini31propreview` 有 AIME / GPQA 却没有 ECI，宽松键 `gemini31pro`
 * 才有 ECI。旧逻辑在严格键上一命中就返回，ECI 就丢了——实测一次少接 37 个模型的 ECI。
 * 现在第一个命中的仍是「主实体」（决定 aliasKey、发布日期、组织），后面更宽松的命中
 * 只允许填补主实体**没有**的指标，绝不覆盖——与 lookupEpochCoding 的逐档累加是同一条纪律。
 */
export function lookupEpoch(
  result: EpochResult,
  vendorId: string,
  slugCandidates: string[],
): EpochMatch | null {
  if (slugCandidates.length === 0) return null;
  const strictCand = slugCandidates.slice(0, 1);
  const tries: Array<[Map<string, EpochAggregate>, string[], EpochMatch['tier']]> = [
    [result.strict, strictCand, 'strict'],
    [result.loose, strictCand, 'strict'],
    [result.strict, slugCandidates, 'loose'],
    [result.loose, slugCandidates, 'loose'],
  ];
  let primary: EpochMatch | null = null;
  for (const [map, cands, tier] of tries) {
    for (const c of cands) {
      const aliasKey = `${vendorId}|${c}`;
      const hit = map.get(aliasKey);
      if (!hit) continue;
      if (!primary) {
        // 拷贝一份再补，不能改动索引里的共享对象
        primary = { aggregate: { ...hit, scores: { ...hit.scores } }, aliasKey, tier };
        continue;
      }
      for (const [k, v] of Object.entries(hit.scores) as Array<[BenchKey, number | undefined]>) {
        if (v !== undefined && primary.aggregate.scores[k] === undefined) {
          primary.aggregate.scores[k] = v;
        }
      }
    }
  }
  return primary;
}

/**
 * 查编程成绩。**与 lookupEpoch 各走各的索引**，理由见 mergeCodingInto 的说明。
 *
 * 这里刻意不「命中即返回」，而是**从严到宽逐档累加**：
 * 一个模型的成绩散落在 11 个 CSV 里，各 CSV 用的标识写法还不一样
 * （有的写 `gpt-5.6-sol_max`，有的写 `gpt-5-6-sol (max)`），
 * 只取第一个命中的档会白扔掉另一批赛制的成绩。
 * 同一个赛制在多档都有值时，严格档先写入、宽松档不覆盖——严格档的归属更可靠。
 */
export function lookupEpochCoding(
  result: EpochResult,
  vendorId: string,
  slugCandidates: string[],
  strippedCandidates: string[],
): Record<string, EpochCodingScore> {
  const out: Record<string, EpochCodingScore> = {};
  const absorb = (bucket: Record<string, EpochCodingScore> | undefined) => {
    if (!bucket) return;
    for (const [league, score] of Object.entries(bucket)) {
      if (!out[league]) out[league] = score;
    }
  };
  const head = slugCandidates.slice(0, 1);
  absorb(head[0] ? result.codingStrict.get(`${vendorId}|${head[0]}`) : undefined);
  absorb(head[0] ? result.codingLoose.get(`${vendorId}|${head[0]}`) : undefined);
  for (const c of slugCandidates) absorb(result.codingStrict.get(`${vendorId}|${c}`));
  for (const c of slugCandidates) absorb(result.codingLoose.get(`${vendorId}|${c}`));
  // 去参数量末级兜底。守卫由调用方负责（它才知道快照里还有哪些模型），
  // 与 lookupEpochParamStripped 保持同一套规矩。
  for (const c of strippedCandidates) absorb(result.codingUnsized.get(`${vendorId}|${c}`));
  return out;
}

/**
 * 末级兜底：把型号结尾的参数量也剥掉再查一次，只查「上游标识不带规模」的那份索引。
 *
 * 一共四道守卫，缺任何一道都会产出错配（论证见 lib/ids.ts 的 paramStrippedVariants）：
 *   1. 上游标识自己不带规模标记 —— 由 `unsized` 索引保证。
 *   2. 上游这个别名键只被**一个**上游实体注册过 —— 由 `unsizedAliasOwners` 保证。
 *      `mistral|mistralsmall` 被 Mistral Small 3 / 3.1 / 3.2 共用，键上的值是几代取 max，谁都不配拿。
 *   3. 命中的实体**确实有分数**。没有分数就没有任何收益，
 *      却会把这个实体的 releaseDate 当成锚点源带进发布日期仲裁——赔本买卖，直接不做。
 *   4. 我们这边去掉参数量后没有多个模型撞在同一个键上 —— 调用方负责（它才知道快照里有哪些模型）。
 */
export function lookupEpochParamStripped(
  result: EpochResult,
  vendorId: string,
  strippedCandidates: string[],
): EpochMatch | null {
  for (const c of strippedCandidates) {
    const aliasKey = `${vendorId}|${c}`;
    const hit = result.unsized.get(aliasKey);
    if (!hit) continue;
    if ((result.unsizedAliasOwners.get(aliasKey)?.size ?? 0) !== 1) continue;
    if (Object.keys(hit.scores).length === 0) continue;
    return { aggregate: hit, aliasKey, tier: 'param-stripped' };
  }
  return null;
}

/**
 * 查泛化接入的全榜单成绩。与 lookupEpochCoding 同一套「从严到宽逐档累加」的规矩，
 * 只是走 league* 那三份索引。
 */
export function lookupEpochLeagueScores(
  result: EpochResult,
  vendorId: string,
  slugCandidates: string[],
  strippedCandidates: string[],
): Record<string, EpochCodingScore> {
  const out: Record<string, EpochCodingScore> = {};
  const absorb = (bucket: Record<string, EpochCodingScore> | undefined) => {
    if (!bucket) return;
    for (const [league, score] of Object.entries(bucket)) {
      if (!out[league]) out[league] = score;
    }
  };
  const head = slugCandidates.slice(0, 1);
  absorb(head[0] ? result.leagueStrict.get(`${vendorId}|${head[0]}`) : undefined);
  absorb(head[0] ? result.leagueLoose.get(`${vendorId}|${head[0]}`) : undefined);
  for (const c of slugCandidates) absorb(result.leagueStrict.get(`${vendorId}|${c}`));
  for (const c of slugCandidates) absorb(result.leagueLoose.get(`${vendorId}|${c}`));
  for (const c of strippedCandidates) absorb(result.leagueUnsized.get(`${vendorId}|${c}`));
  return out;
}

/**
 * 查训练算力。阶梯与 lookupEpoch 一致（严格键优先），另外**先试已经匹配上的 Epoch 别名键**：
 * 那个键是经过整套守卫验证过的归属，比重新跑一次阶梯更可靠。
 * 键上登记为 null 的是「几代模型共用、数值冲突」，视同没有。
 */
export function lookupEpochTrainingCompute(
  result: EpochResult,
  vendorId: string,
  slugCandidates: string[],
  matchedAliasKey: string | null,
): number | null {
  const tryKey = (map: Map<string, number | null>, key: string): number | null | undefined => {
    if (!map.has(key)) return undefined;
    return map.get(key) ?? null;
  };
  if (matchedAliasKey) {
    for (const map of [result.trainingComputeStrict, result.trainingComputeLoose]) {
      const hit = tryKey(map, matchedAliasKey);
      if (hit !== undefined) return hit;
    }
  }
  const strictCand = slugCandidates.slice(0, 1);
  const tries: Array<[Map<string, number | null>, string[]]> = [
    [result.trainingComputeStrict, strictCand],
    [result.trainingComputeLoose, strictCand],
    [result.trainingComputeStrict, slugCandidates],
    [result.trainingComputeLoose, slugCandidates],
  ];
  for (const [map, cands] of tries) {
    for (const c of cands) {
      const hit = tryKey(map, `${vendorId}|${c}`);
      if (hit !== undefined) return hit;
    }
  }
  return null;
}

export function epochBenchKeys(): BenchKey[] {
  return BENCHMARKS.map((b) => b.key);
}
