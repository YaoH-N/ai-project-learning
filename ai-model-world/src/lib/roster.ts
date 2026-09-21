import type { ModelRecord, Vendor, Continent } from './types';
import { buildPriceScale, daysSince } from './derive';

/**
 * 广场阵容的选拔规则。
 *
 * 默认广场只站「每家厂商的当家门面」，约十几到二十几个角色，一屏看得完。
 * 直接取「每家最新发布的模型」是个陷阱——厂商最新推出的常常是便宜的 mini/nano，
 * 它代表不了这家的水平。
 *
 * 规则必须完全确定性，不能有随机或人工干预，否则新厂商出现时就需要有人来选。
 */

const YEAR = 365;

function outputPrice(m: ModelRecord): number {
  return m.pricing.outputPerMTok ?? -1;
}

/**
 * 厂商用命名声明的产品档位：2 是主力，1 是普通，0 是小杯。
 *
 * 与 `derive.ts` 的 `namingScore` 同源，但这里要的是可比较的整数档而不是 0~1 的分数。
 * 这个信号的价值在于**它几乎从不缺失**——价格有四成模型拿不到，名字永远都在。
 */
function namingTier(id: string): 0 | 1 | 2 {
  const s = id.toLowerCase();
  if (/(nano|mini|flash|lite|small|tiny|micro|air)/.test(s)) return 0;
  if (/(pro|max|ultra|opus|large|xl|plus|heavy)/.test(s)) return 2;
  return 1;
}

/**
 * 是否具备核心数据。
 *
 * 上游有 122 个模型是「多源发现」进来的：只有 id、发布日期和榜单分，
 * 没有价格、上下文、模态。这类模型如果被选成当家门面，
 * 它的体型、服饰、房间陈设就全都是从「没有数据」推导出来的——
 * 一个看起来言之凿凿实则毫无依据的角色，比不显示它更糟。
 */
export function hasCoreData(m: ModelRecord): boolean {
  return m.contextWindow != null || m.pricing.outputPerMTok != null;
}

function byEci(a: ModelRecord, b: ModelRecord): number {
  return b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id);
}

// ─── 代际接班 ─────────────────────────────────────────────────

/**
 * 逐项对比时参与比较的评测。
 *
 * 全部是「越大越好」且同量纲（百分数或指数）的项，可以直接比大小。
 * 编程成绩不在此列：它被切成了三十多个互不兼容的赛制，
 * 两个模型很可能一项都没有共同参加过。
 */
const HEAD_TO_HEAD: Array<(m: ModelRecord) => number | null> = [
  (m) => m.benchmarks.eci,
  (m) => m.benchmarks.aime,
  (m) => m.benchmarks.gpqa_diamond,
  (m) => m.benchmarks.arc_agi_2,
  (m) => m.benchmarks.fiction_live,
];

/**
 * 挑战者在两人共同参加过的评测里有没有落下风。
 *
 * **这条比单看综合指数可靠得多。** 实测 Claude Fable 5 与 Claude Opus 5：
 * ECI 162.5 vs 161.6、AIME 100 vs 98.9（Fable 赢），
 * GPQA 85.9 vs 93.9、ARC-AGI-2 89.2 vs 90.4（Opus 赢）——四项打成 2:2，
 * 而 Opus 赢的科学一项领先 8 分，输的两项加起来才 2 分。
 * 用一个合成指数的小数点后一位去裁决，掩盖了逐项对比里的真相。
 *
 * 返回 null 表示共同项太少（少于 2 项），判断不成立，交给调用方走别的判据。
 */
function notOutmatched(challenger: ModelRecord, holder: ModelRecord): boolean | null {
  let wins = 0;
  let losses = 0;
  let shared = 0;
  for (const read of HEAD_TO_HEAD) {
    const a = read(challenger);
    const b = read(holder);
    if (a == null || b == null) continue;
    shared++;
    if (a > b) wins++;
    else if (a < b) losses++;
  }
  if (shared < 2) return null;
  return wins >= losses;
}

/**
 * 「分数打平」的阈值，由全体模型的 ECI 分布自校准。
 *
 * 取相邻名次差的 90 分位数：**比九成的相邻名次差还小的差距，
 * 不足以支撑「谁该上广场」这样一个二元判断**。当前数据下约 0.82。
 *
 * 只在逐项对比不成立（共同评测项少于 2 个）时才回落到这个单指标判据。
 *
 * 为什么必须自校准：随着上榜模型变多，相邻差会整体变小，
 * 写死的阈值会越来越宽松，最后把真实差距也判成打平。
 */
function eciTieThreshold(models: ModelRecord[]): number {
  const scores = models
    .filter((m) => m.benchmarks.eci != null && !m.retiredAt)
    .map((m) => m.benchmarks.eci!)
    .sort((a, b) => b - a);

  const gaps: number[] = [];
  for (let i = 1; i < scores.length; i++) {
    const g = scores[i - 1] - scores[i];
    if (g > 0) gaps.push(g);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(0.9 * (gaps.length - 1))];
}

/**
 * 继任者必须比在位者晚这么多天。
 *
 * 上游同一个模型常有多条别名记录，发布日期差一两天
 * （`Mistral Medium 3.5` 与 `Mistral Medium (latest)` 差 1 天、ECI 完全相同）。
 * 没有这道门槛，「接班」会退化成在同一个模型的几个别名之间反复横跳。
 */
const SUCCESSION_MIN_DAYS = 7;

/** 声明了输出模态且不含文本的，是图像/语音专用模型，代表不了这家的对话水平。 */
function couldBeFlagship(m: ModelRecord): boolean {
  const out = m.modalities.output;
  return out.length === 0 || out.includes('text');
}

/**
 * 服务档位后缀。`kimi-k3-fast`、`gpt-5-fast`、`o3-mini-high` 不是新型号，
 * 是同一个模型的另一种计费/推理档，价格更高只说明「更快」，不说明「更强」。
 * 与管线 `scripts/sync/merge/build.ts` 的 `SERVICE_TIER_SUFFIXES` 保持一致。
 */
const SERVICE_TIER_SUFFIXES = ['-fast', '-free', '-flex', '-priority', '-batch', '-xhigh', '-high', '-low'];

/**
 * 是不是池子里某个模型的服务档位别名。
 *
 * 实测踩坑：Kimi K3 Fast 比 Kimi K3 晚 11 天、贵 50%、没有分数，
 * 完全符合「新一代主力」的接班条件，结果广场上月之暗面的门面变成了一个计费档。
 * 剥掉后缀能撞上同厂另一个 id 的，不参与接班。
 */
function isServiceTierAlias(m: ModelRecord, pool: ModelRecord[]): boolean {
  for (const suffix of SERVICE_TIER_SUFFIXES) {
    if (!m.id.endsWith(suffix) || m.id.length <= suffix.length) continue;
    const base = m.id.slice(0, -suffix.length);
    if (pool.some((o) => o.id === base)) return true;
  }
  return false;
}

function releaseDay(m: ModelRecord): number | null {
  if (!m.releaseDate) return null;
  const p = m.releaseDate.split('-').map(Number);
  const t = Date.UTC(p[0], (p[1] ?? 1) - 1, p[2] ?? 1);
  return Number.isNaN(t) ? null : t;
}

/**
 * 在位的 ECI 冠军有没有被自家更新的型号接班。
 *
 * **这是为了修一个系统性偏差**：Epoch 的评测有滞后，厂商刚发的旗舰往往还没有分数，
 * 而「取 ECI 最高」的规则把「没被测过」当成了「不够格」。结果是广场上摆着
 * GLM-5.2 而 GLM-5.3 已经发布两个月、摆着 GPT-5.5 Pro 而 GPT-5.6 已经上线。
 * 在一个以「一眼看懂当下格局」为使命的站点上，这是实打实的误导。
 *
 * 接班要满足两个条件之一，都不涉及对未知数据的猜测：
 *
 * - **在共同参加过的评测里不落下风，且更新**。优先逐项对比而不是只看综合指数，
 *   理由见 `notOutmatched`。共同项少于两个时才回落到「ECI 差距小于自校准阈值」。
 * - **还没有分数，但价格档不低于在位者**。价格档是厂商自己对产品定位的声明：
 *   同档或更高价、且晚了至少一周发布，是「这是新一代主力」的强信号。
 *   反过来，更便宜的新型号（GLM-5.3-Flash、Qwen3.8 27B、Nemotron Lightning）
 *   是同代的小杯，不构成接班。
 *
 * 刻意**不做**的事：不解析型号里的版本号。`GPT-5.6 > GPT-5.5` 看着好判断，
 * 但 `Muse Glimmer 30B`、`Claude Fable 5` 这类命名没有可靠的版本位，
 * 而一条在多数厂商上失灵的启发式比没有规则更糟。
 */
function findSuccessor(
  champion: ModelRecord,
  pool: ModelRecord[],
  tie: number,
  priceTierOf: (m: ModelRecord) => number | null,
): ModelRecord | null {
  const champDay = releaseDay(champion);
  if (champDay == null) return null;
  const champEci = champion.benchmarks.eci;
  const champTier = priceTierOf(champion);

  const candidates = pool.filter((m) => {
    if (m.id === champion.id || !couldBeFlagship(m) || isServiceTierAlias(m, pool)) return false;
    const day = releaseDay(m);
    if (day == null || (day - champDay) / 86_400_000 < SUCCESSION_MIN_DAYS) return false;

    const eci = m.benchmarks.eci;
    if (eci != null) {
      const headToHead = notOutmatched(m, champion);
      if (headToHead != null) return headToHead;
      return champEci == null || champEci - eci <= tie;
    }

    const tier = priceTierOf(m);
    return champTier != null && tier != null && tier >= champTier;
  });

  if (candidates.length === 0) return null;
  return candidates.sort(
    (a, b) =>
      (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') ||
      (b.benchmarks.eci ?? -1) - (a.benchmarks.eci ?? -1) ||
      (b.pricing.outputPerMTok ?? -1) - (a.pricing.outputPerMTok ?? -1) ||
      a.id.localeCompare(b.id),
  )[0];
}

/*
 * 这里试过一条「并列打破」规则：综合智力几乎打平时，优先选有编程成绩的那个，
 * 好让广场上更多屋子的桌上有电脑（实测能把 4 家提到 8 家）。
 *
 * 撤掉了。实测它把 Grok 4.6 换成了 4.5、Muse Spark 1.2 换成了 1.1、
 * Qwen3.8 Max 换成了 Preview 版——为了让画面好看而在门面上摆过时版本，
 * 是拿准确性换观感，正好违背这个站的使命。
 *
 * 注意这与下面的「代际接班」不是一回事：接班规则换上来的是**更新**的型号，
 * 方向正好相反，而且不涉及对未知数据的猜测。
 */

export interface FlagshipContext {
  /** ECI 打平的阈值，由全体模型自校准 */
  tie: number;
  /** 价格档位，用于判断新型号是不是同级产品 */
  priceTierOf: (m: ModelRecord) => number | null;
}

/**
 * 同厂商内选出当家门面，按优先级依次尝试：
 * 1. 有综合智力分**且**有核心数据的，取分数最高者，**再看有没有被自家更新的型号接班**；
 * 2. 有核心数据的，取「近 12 个月内发布且输出单价最高」；
 * 3. 有综合智力分但数据残缺的，取分数最高者（此时角色会被标记为数据不完整）；
 * 4. 都没有，取发布日期最新者。
 * 每一级都用 id 字典序做最终的稳定排序，保证结果可复现。
 *
 * 第 1 级末尾的接班判定是后加的，用来修 Epoch 评测滞后带来的系统性偏差，
 * 详见 `findSuccessor` 的注释。不传 `ctx` 时退化成纯 ECI 冠军（供旧调用点与测试用）。
 */
export function pickFlagship(
  models: ModelRecord[],
  now: Date,
  ctx?: FlagshipContext,
): ModelRecord | null {
  const alive = models.filter((m) => !m.retiredAt);
  if (alive.length === 0) return null;

  const complete = alive.filter(hasCoreData);

  const scoredComplete = complete.filter((m) => m.benchmarks.eci != null);
  if (scoredComplete.length > 0) {
    const champion = scoredComplete.sort(byEci)[0];
    if (!ctx) return champion;
    return findSuccessor(champion, complete, ctx.tie, ctx.priceTierOf) ?? champion;
  }

  if (complete.length > 0) {
    const recent = complete.filter((m) => {
      const age = daysSince(m.releaseDate, now);
      return age != null && age <= YEAR;
    });
    const base = recent.length > 0 ? recent : complete;
    const nonAlias = base.filter((m) => !isServiceTierAlias(m, complete));
    const pool = nonAlias.length > 0 ? nonAlias : base;

    /*
     * 这一支服务于「一个评测分都没有」的厂商，占广场的一多半。
     *
     * 原来的写法是「取近一年内输出单价最高的」，**完全没有考虑新旧**，
     * 结果字节的广场屋子里站着 2 月的 Seed 2.0 Code，而 6 月的 Seed 2.1 Pro
     * 只因为没有公开报价就出局了——一个没标价的新旗舰输给了标价 $3 的旧型号。
     *
     * 现在改成两级：**先按厂商自己的命名分档，再在最高档里取最新的。**
     * 命名档是厂商对产品定位的直接声明（Pro/Max/Ultra 是主力，Mini/Flash/Lite 是小杯），
     * 比价格可靠——价格经常缺失，而名字总是有的。取到最高档之后再看日期，
     * 就不会重演「新旗舰被旧型号挤掉」。
     */
    const byNaming = new Map<number, ModelRecord[]>();
    for (const m of pool) {
      const t = namingTier(m.id);
      const list = byNaming.get(t);
      if (list) list.push(m);
      else byNaming.set(t, [m]);
    }
    const topTier = Math.max(...byNaming.keys());
    return byNaming.get(topTier)!.sort(
      (a, b) =>
        (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') ||
        outputPrice(b) - outputPrice(a) ||
        (b.contextWindow ?? 0) - (a.contextWindow ?? 0) ||
        a.id.localeCompare(b.id),
    )[0];
  }

  const scored = alive.filter((m) => m.benchmarks.eci != null);
  if (scored.length > 0) return scored.sort(byEci)[0];

  return alive.sort(
    (a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id),
  )[0];
}

/**
 * 本家有没有比门面更新、但没资格接班的型号。
 *
 * 门面按实力选，这是对的；代价是 Epoch 评测滞后时，厂商刚发的型号会暂时看不见。
 * 典型案例：DeepSeek V4.1 Flash 发布于 09-08 却没有 ECI，而 `findSuccessor` 认定
 * 它比在位的 V4 Pro 0813 便宜一档、属于小杯线而非接班人——判断没错，但读者的第一反应
 * 是「这站怎么没更新」。屋子上那行小字就是补这个缺口：不动选拔结果，只说出事实。
 *
 * 门槛沿用接班规则的 `SUCCESSION_MIN_DAYS`，因为要挡的是同一件事——
 * 上游同一模型的多条别名记录往往只差一两天，不加门槛会让几乎每间屋子都挂上这行字。
 */
export function newerThanFlagship(
  flagship: ModelRecord,
  vendorModels: ModelRecord[],
): ModelRecord | null {
  const flagDay = releaseDay(flagship);
  if (flagDay == null) return null;

  const alive = vendorModels.filter((m) => !m.retiredAt);
  const candidates = alive.filter((m) => {
    if (m.id === flagship.id || !couldBeFlagship(m) || !hasCoreData(m)) return false;
    if (isServiceTierAlias(m, alive)) return false;
    const day = releaseDay(m);
    return day != null && (day - flagDay) / 86_400_000 >= SUCCESSION_MIN_DAYS;
  });

  if (candidates.length === 0) return null;
  return candidates.sort(
    (a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '') || a.id.localeCompare(b.id),
  )[0];
}

/**
 * 广场上的街区。按**厂商实力**（该厂全部存活模型里的最高 ECI）分三档：
 * `top` 是最强模型进了全球前十的厂商，`main` 是参加过综合评测的其余厂商，
 * `unscored` 是一个第三方综合评测分都没有的。
 *
 * 为什么按厂商而不按门面模型分：门面常常是刚发布、还没被测的新型号
 * （这正是「代际接班」规则要解决的），按它自己的分会把智谱这种厂商
 * 排到「尚无评测」里去，而读者要看的是这家公司的段位。
 */
export type PlazaTier = 'top' | 'main' | 'unscored';

/**
 * 「头部」的门槛：**厂商**实力排名前十。
 *
 * 之前按「厂商最强模型在模型级全球榜上进前十」判定，结果 OpenAI 一家就占了
 * 前十里的七席，头部街只剩四家厂商，国内更是只有月之暗面一家——
 * 智谱 GLM-5.3 排在全球第 15 左右，被挡在门外，读者看到的是「国内头部只有一个」。
 * 读者想比的是厂商，所以门槛也该在厂商之间划：把每家的最高分排一遍，前十进头部。
 */
const TOP_TIER_VENDOR_RANK = 10;

export interface RosterEntry {
  model: ModelRecord;
  vendor: Vendor;
  tier: PlazaTier;
  /** 该厂商全部存活模型里的最高 ECI，null 表示一个都没测过 */
  strength: number | null;
  /** 该厂商在**厂商实力榜**（各家最高 ECI 排序）上的名次，null 同上 */
  strengthRank: number | null;
}

export interface ContinentRoster {
  continent: Continent;
  /** 默认露面的当家门面 */
  entries: RosterEntry[];
  /** 默认收起的其余厂商，多数是社区微调者 */
  others: RosterEntry[];
}

/**
 * 是否够格站上默认广场。
 *
 * 上游会收录大量社区微调模型（Mythomax、Remm Slerp 这类），它们的发布者不是模型厂商，
 * 混进广场会让「一眼看懂格局」彻底失效。但也不能简单地只留有评测分的——
 * 腾讯、百度、字节这些真正的大厂在 Epoch 里恰好没有分数。
 *
 * 判据取二者之一即可：**要么被独立评测收录过，要么在形象注册表里**。
 * 后者正是我们在设计之初就接受的「唯一依赖人类常识的一层」，
 * 让它兼任「这是不是一家真的模型厂商」的判据，不引入新的人工维护点。
 * 不够格的厂商不会消失，只是收进折叠区。
 */
function isFeatured(entry: RosterEntry, registryHas: (id: string) => boolean): boolean {
  return entry.model.benchmarks.eci != null || registryHas(entry.vendor.id);
}

/** 按大陆分组的广场阵容，组内按综合智力分降序、无分者排在后面。 */
export function buildPlazaRoster(
  models: ModelRecord[],
  vendors: Vendor[],
  now: Date,
  registryHas: (id: string) => boolean,
): ContinentRoster[] {
  const byVendor = new Map<string, ModelRecord[]>();
  for (const m of models) {
    const list = byVendor.get(m.vendorId);
    if (list) list.push(m);
    else byVendor.set(m.vendorId, [m]);
  }

  const vendorById = new Map(vendors.map((v) => [v.id, v]));
  const buckets: Record<Continent, RosterEntry[]> = { west: [], east: [] };

  // 接班判定要跟全体模型比：打平阈值和价格档都是自校准的分位数
  const priceScale = buildPriceScale(models);
  const ctx: FlagshipContext = {
    tie: eciTieThreshold(models),
    priceTierOf: (m) => priceScale.tierOf(m.pricing.outputPerMTok),
  };

  /**
   * 排序与分街区用的分数取**该厂商全部存活模型里的最高 ECI**，而不是门面自己的分。
   *
   * 门面换成当代新型号之后，它常常还没被 Epoch 测过（这正是接班规则要解决的问题）。
   * 如果按门面自己的分排序，智谱会因为 GLM-5.3 暂无分数而被甩到大陆末尾，
   * 和一堆没有任何数据的长尾厂商排在一起——**一家厂商的位次不该由
   * 「当代旗舰碰巧有没有被测过」决定，而该由这家的实力决定。**
   */
  const vendorStrength = new Map<string, number>();
  for (const m of models) {
    if (m.retiredAt || m.benchmarks.eci == null) continue;
    const best = vendorStrength.get(m.vendorId);
    if (best == null || m.benchmarks.eci > best) vendorStrength.set(m.vendorId, m.benchmarks.eci);
  }

  // 厂商实力榜：各家最高 ECI 从高到低，同分同名次
  const vendorRank = new Map<string, number>();
  [...vendorStrength.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([id, v], i, arr) => {
      vendorRank.set(id, i > 0 && arr[i - 1][1] === v ? vendorRank.get(arr[i - 1][0])! : i + 1);
    });

  for (const [vendorId, list] of byVendor) {
    const vendor = vendorById.get(vendorId);
    if (!vendor) continue;
    const model = pickFlagship(list, now, ctx);
    if (!model) continue;
    const strength = vendorStrength.get(vendorId) ?? null;
    const strengthRank = vendorRank.get(vendorId) ?? null;
    const tier: PlazaTier =
      strengthRank != null && strengthRank <= TOP_TIER_VENDOR_RANK
        ? 'top'
        : strength != null
          ? 'main'
          : 'unscored';
    buckets[vendor.continent].push({ model, vendor, tier, strength, strengthRank });
  }

  const sort = (entries: RosterEntry[]) =>
    entries.sort((a, b) => {
      const ea = a.strength;
      const eb = b.strength;
      if (ea != null && eb != null) return eb - ea || a.model.id.localeCompare(b.model.id);
      if (ea != null) return -1;
      if (eb != null) return 1;
      // 都没测过的，新发布的排前面——读者更想看到刚出的
      return (
        (b.model.releaseDate ?? '').localeCompare(a.model.releaseDate ?? '') ||
        a.model.id.localeCompare(b.model.id)
      );
    });

  return (['west', 'east'] as const).map((continent) => {
    const all = sort(buckets[continent]);
    return {
      continent,
      entries: all.filter((e) => isFeatured(e, registryHas)),
      others: all.filter((e) => !isFeatured(e, registryHas)),
    };
  });
}
