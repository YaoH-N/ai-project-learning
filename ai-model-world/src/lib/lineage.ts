/**
 * 同系列历代：这个模型在自家产品线里处于什么位置，上一代是谁、后面又出了什么。
 *
 * 「快速了解某个大模型的发展」这个需求，改版前站里只有两个半成品答案：
 * 时间线页是全站所有模型按月混排（回答的是「这个月业界发了什么」），
 * 厂商页按年份分组（回答的是「这家这些年出了多少」）。都不是「这条产品线怎么走过来的」。
 *
 * **判定规则，一句话说得清**：同一厂商 + 名字里第一个数字之前那一段相同 + 类型相同。
 *
 * 为什么是这条规则，而不是更聪明的：
 * - 版本号的位置是产品线命名里唯一稳定的结构。「GLM-5.3」「Claude Fable 5.1」
 *   「Qwen3.8-Max」的数字前面都恰好是这条线的名字。
 * - 试过把 Flash / Pro / Mini 这类档位词也剥掉，结果 OpenAI 一家 55 个模型全成一族，
 *   GPT-3.5 和 GPT-6 Astra 排进同一条时间轴——那不是产品线，是清单。
 * - 加上「类型相同」这一刀之后，GLM 的文本线（13 个）和视觉线（5 个）自然分开，
 *   而且同一条线里的 ECI 是可比的。全库 76% 的模型因此有了至少一个同系列邻居。
 *
 * 还是会有它认不出来的：GPT 用代号（Luna / Sol / Terra / Astra）而不是纯数字区分并行款，
 * 所以 OpenAI 的「gpt / 视觉」一族有 46 个。对这种超长家族开一个以当前模型为中心的窗口，
 * 并如实写出「共 N 个」，不假装那是一条线。
 *
 * 纯函数、确定性。
 */

import { kindOf } from './kind';
import type { ModelRecord } from './types';

/**
 * 一屏最多摆几代。
 *
 * 7 是量出来的：详情页正文宽 1152，减去两侧内边距与面板内边距剩约 1064，
 * 七格 124px 加六个箭头正好摆得下。放到 9 格时当前这一代会被挤出右边缘，
 * 而「当前在哪」正是这条时间轴存在的理由——看不见它就白画了。
 */
const WINDOW = 7;

export interface FamilyStem {
  /** 归一化后的匹配键 */
  key: string;
  /** 展示用，保留原始大小写，如 `GLM`、`Claude Fable` */
  display: string;
}

const stemCache = new Map<string, FamilyStem>();

/** 取名字里第一个「含数字的词」之前的那一段。`Qwen3.8` 这种连写的也会先切开。 */
export function familyStem(name: string): FamilyStem {
  const hit = stemCache.get(name);
  if (hit) return hit;

  const tokens = name
    // qwen3.8 → qwen 3.8，否则整个词都含数字，词干会变成空
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .split(/[^A-Za-z0-9.]+/)
    .filter(Boolean);

  const head: string[] = [];
  for (const t of tokens) {
    if (/\d/.test(t)) break;
    head.push(t);
  }

  const display = head.join(' ');
  const out: FamilyStem = { key: display.toLowerCase(), display };
  stemCache.set(name, out);
  return out;
}

export interface Lineage {
  /** 展示用词干 */
  stem: string;
  /** 按发布时间升序，已开窗 */
  entries: ModelRecord[];
  /** 开窗前这一族共有多少个 */
  total: number;
  /** 当前模型在 `entries` 里的下标 */
  currentIndex: number;
}

/**
 * 算出 `model` 的同系列时间轴。族里只有它自己时返回 null——
 * 一条只有一个点的时间轴不该占版面。
 */
export function buildLineage(
  model: ModelRecord,
  all: ModelRecord[],
  window = WINDOW,
): Lineage | null {
  const { key, display } = familyStem(model.name);
  if (key === '') return null;

  const kind = kindOf(model);
  const family = all
    .filter(
      (m) =>
        m.vendorId === model.vendorId &&
        kindOf(m) === kind &&
        familyStem(m.name).key === key,
    )
    .sort(
      (a, b) =>
        (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '') ||
        a.id.localeCompare(b.id),
    );

  if (family.length < 2) return null;

  const idx = family.findIndex((m) => m.id === model.id);
  let entries = family;
  if (family.length > window) {
    // 以当前模型为中心开窗，两端顶到边时整体平移，保证始终显示满 window 个
    const start = Math.min(Math.max(0, idx - Math.floor(window / 2)), family.length - window);
    entries = family.slice(start, start + window);
  }

  return {
    stem: display,
    entries,
    total: family.length,
    currentIndex: entries.findIndex((m) => m.id === model.id),
  };
}
