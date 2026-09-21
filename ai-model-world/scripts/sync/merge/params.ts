/**
 * 参数量双轨制。
 *
 * 调研结论：闭源模型的参数量与训练算力在 2026 年已是「零覆盖」
 * （Epoch 统计 OpenAI 3%、Anthropic 0%，2026 年新模型的 FLOP 估计全为空），
 * 编一个假参数量只会在模型迭代时不断被打脸。所以：
 *
 *   开源：HF safetensors 精确值 → exact；HF 不可达时退到「型号里自带的参数量」→ estimated
 *   闭源：不编造数字，只按「输出价格档位 × 厂商命名档位」合成 1–5 档规模 → estimated
 *   都判不出来：unknown
 */
import type { Confidence, Params } from '../../../src/lib/types';

export interface ParamGuess {
  totalB: number | null;
  activeB: number | null;
}

const UNIT_TO_B: Record<string, number> = { m: 1 / 1000, b: 1, t: 1000 };

/** 235b-a22b / 2.4t-a95b / 80b-a3b：总参 + MoE 激活参 */
const TOTAL_ACTIVE = /(?:^|[-_/])(\d+(?:\.\d+)?)([bmt])[-_]a(\d+(?:\.\d+)?)b(?=$|[-_])/i;
/** 17b-128e（Llama 4 那种写法）：前面的数字是激活参不是总参，只认激活参 */
const ACTIVE_EXPERTS = /(?:^|[-_/])(\d+(?:\.\d+)?)b[-_](\d+)e(?=$|[-_])/i;
/** 27b / 0.6b / 1t：单一总参 */
const TOTAL_ONLY = /(?:^|[-_/])(\d+(?:\.\d+)?)([bmt])(?=$|[-_])/i;

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 从型号本身抽参数量。厂商命名里带的参数量是公开事实，比价格推断可靠得多。 */
export function paramsFromSlug(modelSlug: string): ParamGuess {
  const slug = modelSlug.toLowerCase();

  const ta = TOTAL_ACTIVE.exec(slug);
  if (ta) {
    const total = Number(ta[1]) * UNIT_TO_B[ta[2].toLowerCase()];
    const active = Number(ta[3]);
    if (total > 0 && active > 0 && active <= total) {
      return { totalB: round(total), activeB: round(active) };
    }
  }

  const ae = ACTIVE_EXPERTS.exec(slug);
  if (ae) {
    const active = Number(ae[1]);
    if (active > 0) return { totalB: null, activeB: round(active) };
  }

  const to = TOTAL_ONLY.exec(slug);
  if (to) {
    const total = Number(to[1]) * UNIT_TO_B[to[2].toLowerCase()];
    // 0.1B 以下与 10T 以上都不像真实的大模型参数量，宁可判为「没抽到」。
    if (total >= 0.1 && total <= 10_000) return { totalB: round(total), activeB: null };
  }

  return { totalB: null, activeB: null };
}

const SMALL_TIER =
  /(^|[-_.])(nano|micro|tiny|lite|mini|small|flash|air|turbo|haiku|instant|fast|edge|scout)([-_.]|$)/;
const LARGE_TIER =
  /(^|[-_.])(pro|plus|large|max|ultra|opus|premier|heavy|xl|xxl|giant|thinking-pro)([-_.]|$)/;

function namingTier(modelSlug: string): number | null {
  const s = modelSlug.toLowerCase();
  const small = SMALL_TIER.test(s);
  const large = LARGE_TIER.test(s);
  if (small && !large) return 1;
  if (large && !small) return 5;
  if (small && large) return 3;
  return null;
}

function priceTier(outputPerMTok: number | null): number | null {
  if (outputPerMTok === null || !Number.isFinite(outputPerMTok) || outputPerMTok <= 0) return null;
  if (outputPerMTok <= 1) return 1;
  if (outputPerMTok <= 5) return 2;
  if (outputPerMTok <= 15) return 3;
  if (outputPerMTok <= 40) return 4;
  return 5;
}

export interface SizeTier {
  tier: NonNullable<Params['sizeTier']>;
  basis: NonNullable<Params['sizeTierBasis']>;
}

/** 闭源模型的「体型」代理指标：输出价格档位 × 厂商命名档位 → 1–5 档。 */
export function synthesizeSizeTier(
  modelSlug: string,
  outputPerMTok: number | null,
): SizeTier | null {
  const n = namingTier(modelSlug);
  const p = priceTier(outputPerMTok);
  if (n === null && p === null) return null;
  if (n !== null && p !== null) {
    const tier = Math.min(5, Math.max(1, Math.round((n + p) / 2))) as SizeTier['tier'];
    return { tier, basis: 'price+naming' };
  }
  const only = (n ?? p) as number;
  return {
    tier: Math.min(5, Math.max(1, only)) as SizeTier['tier'],
    basis: n !== null ? 'naming' : 'price',
  };
}

export interface ResolveParamsInput {
  modelSlug: string;
  /** Hugging Face safetensors 读出的总参（十亿），HF 不可达时为 null */
  hfTotalB: number | null;
  hfActiveB: number | null;
  openWeights: boolean | null;
  outputPerMTok: number | null;
}

export interface ResolvedParams {
  totalB: number | null;
  activeB: number | null;
  confidence: Confidence;
  tier: SizeTier | null;
  /** totalB / activeB 各自的来源，交给调用方写进 provenance */
  totalSource: 'huggingface' | 'derived' | null;
  activeSource: 'huggingface' | 'derived' | null;
}

/**
 * 参数量的完整裁决，抽成纯函数是为了能在不联网的自检里证明各条分支。
 *
 * 三档语义（confidence 驱动前端文案，必须准确）：
 *   exact     —— 数到了权重文件里的张量，只有 HF safetensors 能给。
 *   estimated —— 从型号名里读出来的（qwen3-235b-a22b → 235B），或闭源模型的 1–5 档规模推定。
 *                型号名是厂商的营销字符串，不是测量值：Llama-4-Scout-17B-16E 实际总参约 109B，
 *                名字里的 17B 是激活参。所以这一档只能叫 estimated。
 *   unknown   —— 什么都判不出来。
 */
export function resolveParams(input: ResolveParamsInput): ResolvedParams {
  const slugParams = paramsFromSlug(input.modelSlug);

  if (input.hfTotalB !== null && input.hfTotalB > 0) {
    const activeB = input.hfActiveB ?? slugParams.activeB;
    return {
      totalB: input.hfTotalB,
      activeB,
      confidence: 'exact',
      tier: null,
      totalSource: 'huggingface',
      activeSource: activeB === null ? null : input.hfActiveB !== null ? 'huggingface' : 'derived',
    };
  }

  if (slugParams.totalB !== null || slugParams.activeB !== null) {
    return {
      totalB: slugParams.totalB,
      activeB: slugParams.activeB,
      confidence: 'estimated',
      tier: null,
      totalSource: slugParams.totalB === null ? null : 'derived',
      activeSource: slugParams.activeB === null ? null : 'derived',
    };
  }

  // 规模档位只给「厂商不公开参数量」的模型兜底。开源模型的真值在 HF，
  // HF 拿不到就老实留 unknown，不拿价格档位假装知道它多大。
  const tier = input.openWeights === true ? null : synthesizeSizeTier(input.modelSlug, input.outputPerMTok);
  return {
    totalB: null,
    activeB: null,
    confidence: tier ? 'estimated' : 'unknown',
    tier,
    totalSource: null,
    activeSource: null,
  };
}
