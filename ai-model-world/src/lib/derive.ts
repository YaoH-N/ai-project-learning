/**
 * 模型属性 → 视觉档位的推导规则。
 *
 * 这个文件是 docs/DESIGN.md 的可执行版本，两者的阈值必须保持一致。
 * 改动任何阈值都要同步改文档，否则文档就成了谎言。
 *
 * 所有函数都是纯函数且不含随机性：同一个 ModelRecord 永远推导出同一套视觉档位。
 */

import type { ModelRecord } from './types';

export type Tier = 1 | 2 | 3 | 4 | 5;

// ─── 价格档位：按当前全体模型的分位数自校准 ───────────────────

/**
 * 价格档位不能用写死的美元阈值。
 *
 * 两个原因。其一，同一时刻的旗舰模型定价高度聚集，固定阈值会把它们全塞进同一档，
 * 结果是广场上所有大厂角色穿一样的衣服、长一样的个头，视觉维度直接失效。
 * 其二，token 价格逐年下降，写死的阈值会让若干年后全世界的模型都穿麻布——
 * 这正是一个「发布后没人维护」的站点最容易悄悄烂掉的地方。
 *
 * 改用当前快照内的五分位：档位表达的是「在今天的模型里算贵还是算便宜」，
 * 这个语义既自校准，也正是用户真正想知道的。
 */
export interface PriceScale {
  /** 五分位切点，长度为 4 */
  cuts: number[];
  tierOf(price: number | null | undefined): Tier | null;
}

export function buildPriceScale(models: ModelRecord[]): PriceScale {
  const prices = models
    .map((m) => m.pricing.outputPerMTok)
    .filter((p): p is number => p != null && p > 0)
    .sort((a, b) => a - b);

  // 样本太少时退回一组保守的绝对阈值，总比全部挤在一档强
  const cuts =
    prices.length < 10
      ? [0.5, 2, 10, 30]
      : [0.2, 0.4, 0.6, 0.8].map((q) => prices[Math.floor(q * (prices.length - 1))]);

  return {
    cuts,
    tierOf(price) {
      if (price == null || price <= 0) return null;
      let tier = 1;
      for (const cut of cuts) if (price > cut) tier++;
      return Math.min(5, tier) as Tier;
    },
  };
}

// ─── 体型 ← 模型规模 ───────────────────────────────────────────

export interface SizeResult {
  tier: Tier;
  /**
   * 档位不是由精确参数量算出来的。用于提示文案的措辞。
   * 注意这和 `opaque` 是两件事：从模型名里抽出的「235B」不精确但确实存在，
   * 这类模型 estimated 为 true 而 opaque 为 false。
   */
  estimated: boolean;
  /**
   * 完全没有参数量可显示。这才是雾化斗篷的判据，
   * 与精灵图合成管线里的规则严格一致，保证图与文案不会互相打架。
   */
  opaque: boolean;
}

/**
 * 从模型名里读出厂商自己的规格暗示。
 * 这是闭源模型唯一能用的规模信号之一——厂商不公布参数量，但会用命名告诉你这是大杯还是小杯。
 * 返回 0~1 的连续值，方便与分位数在同一量纲里合成。
 */
function namingScore(id: string): number {
  const s = id.toLowerCase();
  if (/(nano|mini|flash|lite|small|tiny|micro|air)/.test(s)) return 0;
  if (/(pro|max|ultra|opus|large|xl|plus|heavy)/.test(s)) return 1;
  return 0.5;
}

function percentileIn(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return sorted.length === 1 ? 0.5 : lo / (sorted.length - 1);
}

export interface SizeScale {
  sizeOf(model: ModelRecord): SizeResult;
}

/**
 * 体型标尺。
 *
 * 两次尝试都失败之后才走到这个方案，过程值得记下来：
 * 一开始用写死的美元阈值分档，结果旗舰模型全落进同一档；
 * 改成价格分位数之后，又因为「价格分位 × 命名档」是加权平均，
 * 数值向中位数回归，还是全挤在第 4 档。
 *
 * 平均永远会压缩值域。所以最终做法是：先给每个模型算一个 0~1 的连续规模分，
 * 再把全体模型的分数做一次五等分。这样五个档位在构造上一定都有人，
 * 广场上必然看得到明显的高矮差异。
 *
 * 代价是档位表达的是「在当前这批模型里算大还是算小」而非绝对参数量。
 * 对一个展示「当下格局」的站点来说，这个相对语义反而更贴近用户想问的问题，
 * 而且它自校准——不会因为若干年后模型普遍变大变便宜就整体失真。
 */
export function buildSizeScale(models: ModelRecord[]): SizeScale {
  const paramValues = models
    .filter((m) => m.params.totalB != null)
    .map((m) => Math.log10(m.params.totalB!))
    .sort((a, b) => a - b);

  const priceValues = models
    .map((m) => m.pricing.outputPerMTok)
    .filter((p): p is number => p != null && p > 0)
    .map((p) => Math.log10(p))
    .sort((a, b) => a - b);

  function rawScore(m: ModelRecord): { score: number; estimated: boolean; opaque: boolean } {
    // 只要拿得到参数量就用它，不要求 confidence 是 exact。
    // 从模型名里正则抽出的「235B」虽然不算精确，但它是厂商自己写在名字里的真实规模，
    // 远比价格代理可靠。早先卡 exact 的写法把 119 个已知参数量的模型白白丢进了价格通道，
    // 而当前数据里 exact 记录数为零（Hugging Face 从中国大陆不可达）。
    if (m.params.totalB != null) {
      return {
        score: percentileIn(paramValues, Math.log10(m.params.totalB)),
        estimated: m.params.confidence !== 'exact',
        opaque: false,
      };
    }
    const price = m.pricing.outputPerMTok;
    if (price != null && price > 0) {
      const p = percentileIn(priceValues, Math.log10(price));
      return { score: 0.75 * p + 0.25 * namingScore(m.id), estimated: true, opaque: true };
    }
    return { score: namingScore(m.id), estimated: true, opaque: true };
  }

  // 全体分数的五等分切点。用分数本身的分布切，而不是均分 0~1 区间，
  // 因为分数分布本身也是聚集的。
  const allScores = models.map((m) => rawScore(m).score).sort((a, b) => a - b);
  const cuts =
    allScores.length < 5
      ? [0.2, 0.4, 0.6, 0.8]
      : [0.2, 0.4, 0.6, 0.8].map((q) => allScores[Math.floor(q * (allScores.length - 1))]);

  return {
    sizeOf(model) {
      const { score, estimated, opaque } = rawScore(model);
      let tier = 1;
      for (const cut of cuts) if (score > cut) tier++;
      return { tier: Math.min(5, tier) as Tier, estimated, opaque };
    },
  };
}

// ─── 性价比 ───────────────────────────────────────────────────

/**
 * 「每块钱买到多少智力」。
 *
 * 第一版直接算 `eci / outputPerMTok`，**是错的**，而且错得很隐蔽。
 * 比值型指标在分母趋近于零时会爆炸：实算下来前三名是
 * Llama-3.1-8B（$0.08，ECI 115 → 1441）、Mistral Nemo（789）、GPT OSS 20B（684），
 * 而 Claude Fable 5 只有 3.25。于是「性价比之王」这块牌子永远颁给最便宜的那批，
 * 而不是「又好又省」的那批——和这块牌子想表达的意思正好相反。
 *
 * 改成**两个分位相减**：智力分位减价格分位，两个都是 0~1 的无量纲量，
 * 差值落在 -1~1 之间，不会爆炸，也不需要任何可调参数。
 * 一个模型只有在「比同价位的更聪明」或「比同智力的更便宜」时才拿得到高分，
 * 这正是性价比的本义。
 *
 * 沿用全站的自校准：分位随当前人群变化，不写死任何绝对阈值。
 */
export function buildValueScore(models: ModelRecord[]): (m: ModelRecord) => number | null {
  const eciAsc = models
    .map((m) => m.benchmarks.eci)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);

  const priceAsc = models
    .filter((m) => m.modalities.output.includes('text'))
    .map((m) => m.pricing.outputPerMTok)
    .filter((v): v is number => v != null && v > 0)
    .map((v) => Math.log10(v))
    .sort((a, b) => a - b);

  return (m) => {
    const eci = m.benchmarks.eci;
    const price = m.pricing.outputPerMTok;
    if (eci == null || price == null || price <= 0) return null;
    if (!m.modalities.output.includes('text')) return null;
    return percentileIn(eciAsc, eci) - percentileIn(priceAsc, Math.log10(price));
  };
}

// ─── 服饰华丽度 ← 价格 ────────────────────────────────────────

export type Garment = 'linen' | 'cotton' | 'silk' | 'brocade' | 'jeweled';

const GARMENTS: Record<Tier, Garment> = {
  1: 'linen',
  2: 'cotton',
  3: 'silk',
  4: 'brocade',
  5: 'jeweled',
};

export function garmentOf(
  model: ModelRecord,
  scale: PriceScale,
): { tier: Tier; garment: Garment; priced: boolean } {
  const tier = scale.tierOf(model.pricing.outputPerMTok);
  // 无公开报价的模型穿麻布，并在第二层标注「未上市，无公开报价」——
  // 不能因为没数据就给它穿华服，那是编造。
  if (tier == null) return { tier: 1, garment: 'linen', priced: false };
  return { tier, garment: GARMENTS[tier], priced: true };
}

// ─── 头顶冠冕 ← 综合智力排名 ──────────────────────────────────

export type Crown = 'gold' | 'laurel' | 'silver' | null;

/** rank 为 1 起的名次；未参与评测传 null，绝不用假分数顶替。 */
export function crownOf(rank: number | null): Crown {
  if (rank == null) return null;
  if (rank === 1) return 'gold';
  if (rank <= 5) return 'laurel';
  if (rank <= 10) return 'silver';
  return null;
}

// ─── 年龄与生死 ← 发布日期与退役状态 ──────────────────────────

export type LifeStage = 'newborn' | 'young' | 'middle' | 'old' | 'ghost' | 'unknown';

const DAY = 86_400_000;

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  // 宽松解析：上游存在 YYYY-MM 甚至 YYYY 的低精度日期，补齐到当月/当年首日
  const parts = iso.split('-').map(Number);
  const d = Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1);
  if (Number.isNaN(d)) return null;
  return Math.floor((now.getTime() - d) / DAY);
}

export function lifeStageOf(model: ModelRecord, now: Date): LifeStage {
  if (model.retiredAt) return 'ghost';
  const age = daysSince(model.releaseDate, now);
  if (age == null) return 'unknown';
  if (age <= 30) return 'newborn';
  if (age <= 365) return 'young';
  if (age <= 730) return 'middle';
  return 'old';
}

// ─── 第二层：能力符号 ─────────────────────────────────────────

export interface CapabilitySigns {
  /** 支持图像输入戴眼镜，不支持戴眼罩。只有布尔值——MMMU 没有可自动获取的源。 */
  eyewear: 'glasses' | 'blindfold';
  headphones: boolean;
  paintbrush: boolean;
  toolBelt: boolean;
  /** 思考光环层数，0 表示非推理模型 */
  halo: 0 | 1 | 2 | 3;
  key: boolean;
}

function haloLayers(model: ModelRecord): 0 | 1 | 2 | 3 {
  if (!model.capabilities.reasoning) return 0;
  const aime = model.benchmarks.aime;
  if (aime == null) return 1;
  if (aime < 50) return 1;
  if (aime < 80) return 2;
  return 3;
}

export function signsOf(model: ModelRecord): CapabilitySigns {
  const input = new Set(model.modalities.input);
  const output = new Set(model.modalities.output);
  return {
    eyewear: input.has('image') ? 'glasses' : 'blindfold',
    headphones: input.has('audio') || output.has('audio'),
    paintbrush: output.has('image'),
    toolBelt: model.capabilities.toolCall === true,
    halo: haloLayers(model),
    key: model.openWeights === true,
  };
}

// ─── 第三层：房间家具 ─────────────────────────────────────────

export type ComputerTier = 'none' | 'crt' | 'laptop' | 'dual' | 'battlestation';

/**
 * 编程成绩所属的「赛制」。不同赛制之间的分数**永远不可比**：
 * SWE-bench Verified 的中位数是 75.7，SWE-Bench Pro 被 Scale 官方测出来的中位数只有 41.0，
 * 同一个模型换个 harness 就能差二三十分。
 */
export type SweLeague =
  /** Epoch AI 统一复跑，第三方，最可信 */
  | 'epoch'
  /** 厂商自报的 Verified 成绩 */
  | 'vendor'
  /** SWE-Bench Pro，Scale AI 官方榜 */
  | 'pro-scale'
  /** SWE-Bench Pro，厂商系统卡自评。与上一档中位数差 18 分 */
  | 'pro-vendor';

export interface ComputerResult {
  tier: ComputerTier;
  league: SweLeague | null;
  score: number | null;
}

export interface ComputerScale {
  computerOf(model: ModelRecord): ComputerResult;
}

/** 一个模型的编程成绩落在哪个赛制、分数多少。按可信度取第一个有值的。 */
function sweEntry(
  model: ModelRecord,
  proIsThirdParty: (id: string) => boolean,
): { league: SweLeague; score: number } | null {
  const epoch = model.benchmarks.swe_bench_verified;
  if (epoch != null) return { league: 'epoch', score: epoch };

  const vendor = model.benchmarks.swe_bench_vendor;
  if (vendor != null) return { league: 'vendor', score: vendor };

  const pro = model.benchmarks.swe_bench_pro;
  if (pro != null) {
    return { league: proIsThirdParty(model.id) ? 'pro-scale' : 'pro-vendor', score: pro };
  }
  return null;
}

/**
 * 电脑档次标尺。
 *
 * 不用写死的分数阈值。原先的 30/50/70 是照着 SWE-bench Verified 校准的，
 * 把 SWE-Bench Pro 的分数喂进去会把被 Scale 测过的模型系统性压低一到两档——
 * 一个拿 9.67 分的模型显示成老式显像管，而同代对手靠厂商自评的 79.2 拿到多屏黑客洞，
 * 两个数字根本不在同一把尺子上。
 *
 * 改成**每个赛制在自己的人群里做四分位**：档位表达的是
 * 「在同样被这个榜测过的模型里，它排第几档」，跨赛制的分数从此不再相遇。
 * 这与体型、价格档位用的是同一套自校准思路。
 */
export function buildComputerScale(
  models: ModelRecord[],
  proIsThirdParty: (id: string) => boolean,
): ComputerScale {
  const pools = new Map<SweLeague, number[]>();
  for (const m of models) {
    const e = sweEntry(m, proIsThirdParty);
    if (!e) continue;
    const pool = pools.get(e.league);
    if (pool) pool.push(e.score);
    else pools.set(e.league, [e.score]);
  }
  for (const pool of pools.values()) pool.sort((a, b) => a - b);

  const TIERS: ComputerTier[] = ['crt', 'laptop', 'dual', 'battlestation'];

  return {
    computerOf(model) {
      const e = sweEntry(model, proIsThirdParty);
      // 没有任何编程成绩时是盖着防尘布的桌子加一个问号——「不知道」不等于「不会」
      if (!e) return { tier: 'none', league: null, score: null };

      const pool = pools.get(e.league) ?? [];
      if (pool.length < 4) {
        // 人群太小分不出四档，给个中间档，别硬分
        return { tier: 'laptop', league: e.league, score: e.score };
      }
      const cuts = [0.25, 0.5, 0.75].map((q) => pool[Math.floor(q * (pool.length - 1))]);
      let idx = 0;
      for (const cut of cuts) if (e.score > cut) idx++;
      return { tier: TIERS[idx], league: e.league, score: e.score };
    },
  };
}

/** 书架层数 ← 上下文窗口 */
export function bookshelfOf(model: ModelRecord): Tier | null {
  const ctx = model.contextWindow;
  if (ctx == null) return null;
  if (ctx < 32_000) return 1;
  if (ctx < 128_000) return 2;
  if (ctx < 256_000) return 3;
  if (ctx < 1_000_000) return 4;
  return 5;
}

/**
 * 书架的落灰程度：标称窗口很大但长文本实测分数很低时，上层书架积灰。
 * 返回 0（不积灰）到 1（积满灰）；缺少实测数据时返回 null，不做视觉表达。
 */
export function shelfDustOf(model: ModelRecord): number | null {
  const claimed = bookshelfOf(model);
  const measured = model.benchmarks.fiction_live;
  if (claimed == null || measured == null) return null;
  // 实测满分按 100 计，标称档位映射到同一量纲后取差值
  const expected = claimed * 20;
  return Math.min(1, Math.max(0, (expected - measured) / 100));
}

// ─── 组合：一个角色在广场上需要的全部视觉信息 ─────────────────

export interface CharacterVisual {
  slug: string;
  name: string;
  vendorId: string;
  size: SizeResult;
  garment: ReturnType<typeof garmentOf>;
  crown: Crown;
  stage: LifeStage;
  signs: CapabilitySigns;
  /** 综合智力榜名次，null 表示未参赛 */
  rank: number | null;
  singleSource: boolean;
  /**
   * 是否具备核心数据（上下文或价格至少有一项）。
   * 为 false 时角色的体型与服饰是从「没有数据」推出来的，必须在界面上如实标注，
   * 不能让一个毫无依据的形象看起来言之凿凿。
   */
  dataComplete: boolean;
}

export interface Scales {
  price: PriceScale;
  size: SizeScale;
  computer: ComputerScale;
}

export function buildScales(
  models: ModelRecord[],
  proIsThirdParty: (id: string) => boolean = () => false,
): Scales {
  return {
    price: buildPriceScale(models),
    size: buildSizeScale(models),
    computer: buildComputerScale(models, proIsThirdParty),
  };
}

export function visualOf(
  model: ModelRecord,
  rank: number | null,
  now: Date,
  scales: Scales,
): CharacterVisual {
  return {
    slug: model.slug,
    name: model.name,
    vendorId: model.vendorId,
    size: scales.size.sizeOf(model),
    garment: garmentOf(model, scales.price),
    crown: crownOf(rank),
    stage: lifeStageOf(model, now),
    signs: signsOf(model),
    rank,
    singleSource: isSingleSource(model),
    dataComplete: model.contextWindow != null || model.pricing.outputPerMTok != null,
  };
}

/**
 * 按综合智力分给模型排名。没有分数的模型排名为 null——
 * 它们在广场上照常站着，只是没有冠冕，卡片上写「未参赛」。
 */
export function rankByEci(models: ModelRecord[]): Map<string, number> {
  const scored = models
    .filter((m) => m.benchmarks.eci != null)
    .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id));
  return new Map(scored.map((m, i) => [m.id, i + 1]));
}

// ─── 视觉层的稀有度裁剪 ───────────────────────────────────────

/**
 * 广场上哪些视觉元素该被裁掉。
 *
 * 这是把 `assignTraits` 的稀有度裁剪从**文字标签推广到画面本身**。
 * 之前只有标签层受这条规则约束，画面层没有，结果标签很干净而屋子里堆满了常量：
 * 实测广场 39 间屋里，79% 摆着同一张问号盖布桌、77% 的角色披着同一层雾、
 * 74% 挂着「会用工具」图标。这些元素占着大量像素却传递零比特差异。
 *
 * **这不是删除信息，是让视觉权重与信息量匹配。**「编程能力未知」这个事实
 * 完全保留——它只是从「占屋内三分之一的家具」降级成能力条上一个空槽。
 * 诚信原则要求的是不用视觉手段掩盖数据缺失，不是必须给缺失的数据
 * 分配和有数据同样多的像素。
 *
 * 事实上现在的做法反而更危险：当 79% 的屋子都摆着问号桌时，
 * 读者会把它读成一件普通家具，而不是一个警告。**稀有的警告才是警告。**
 *
 * 与全站其余部分一样自校准：等哪天编程成绩覆盖率上去了，
 * 问号桌的出现率跌破阈值，它会自动回到屋子里——那时候它才真的是个信号。
 */
export interface VisualPruning {
  /** 没有编程成绩时的盖布问号桌 */
  emptyDesk: boolean;
  /** 参数量未公开时的雾化斗篷 */
  fog: boolean;
  toolIcon: boolean;
  thinkIcon: boolean;
}

/**
 * 视觉层的阈值比标签层（0.35）宽松。
 * 标签一次可以挂三块，彼此竞争位置；视觉元素各占固定槽位，
 * 只有真的接近「人手一个」时才值得撤掉。
 */
const VISUAL_COMMON_THRESHOLD = 0.6;

export function buildVisualPruning(
  displayed: ModelRecord[],
  scales: Scales,
): VisualPruning {
  const n = displayed.length;
  if (n === 0) {
    return { emptyDesk: false, fog: false, toolIcon: false, thinkIcon: false };
  }
  const rate = (pred: (m: ModelRecord) => boolean) =>
    displayed.filter(pred).length / n > VISUAL_COMMON_THRESHOLD;

  return {
    emptyDesk: rate((m) => scales.computer.computerOf(m).tier === 'none'),
    fog: rate((m) => scales.size.sizeOf(m).opaque),
    toolIcon: rate((m) => m.capabilities.toolCall === true),
    thinkIcon: rate((m) => m.capabilities.reasoning === true),
  };
}

// ─── 单源数据标记 ─────────────────────────────────────────────

const OPENROUTER_LINEAGE = new Set(['models.dev', 'openrouter']);

/**
 * models.dev 的数据有相当一部分来自 OpenRouter 的每小时同步，两者在同一条血缘链上。
 * 若某模型的全部字段都只来自这条链，就不能算「多源交叉校验过」，需要如实标注。
 */
export function isSingleSource(model: ModelRecord): boolean {
  const sources = new Set(Object.values(model.provenance).filter((s) => s != null));
  sources.delete('derived');
  sources.delete('override');
  if (sources.size === 0) return true;
  return Array.from(sources).every((s) => OPENROUTER_LINEAGE.has(s));
}
