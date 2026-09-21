/**
 * 编程共识分：一个模型在**所有**第三方编程榜上的平均分位。
 *
 * 为什么不能像以前那样拿单一榜单（SWE-bench Verified）定「最会编程」——
 * 一次实际翻车，值得记下来：
 *
 * Epoch 复跑 SWE-bench Verified 只覆盖了 25 个模型，而且跟不上发布节奏。
 * 2026-09 的快照里，综合智力第一的 Claude Fable 5 在这张榜上**没有成绩**，
 * 于是「最会编程」的头衔落到了老一代的 Claude Opus 4.7 头上——
 * 不是因为它更会写代码，只是因为它被测得更早。单榜取最大值有一个隐蔽的偏差：
 * 它系统性地偏向「被测过的老模型」，惩罚「还没轮到的新模型」。
 *
 * 这里的做法：
 * 1. 每个第三方编程榜自成一个分位池（同赛制、同测量方才可比，见 aptitude.ts）。
 * 2. 一个模型在它参加过的每个池里各得一个 0~1 的分位，取平均。
 * 3. 至少参加过 MIN_LEAGUES 个够大的池才有资格——只在一个冷门榜上拿高分不算。
 *
 * 平均分位跨榜可比，而且对「哪张榜恰好测过谁」不敏感：一个模型只要在它被测的
 * 大部分榜上都排前列，就是共识意义上的强。
 *
 * 纯函数、确定性，不依赖时间。
 */

import type { ModelRecord } from './types';

export interface CodingConsensus {
  /** 平均分位 0~1，越大越强 */
  score: number;
  /** 参与统计的榜单数 */
  leagues: number;
  /** 参与统计的榜单 id，详情页与悬停提示要列出来 */
  leagueIds: string[];
}

/** 一个池至少要有这么多成绩，分位才有意义 */
const MIN_POOL = 5;
/** 至少参加这么多个榜，才配拿「最会编程」 */
export const MIN_LEAGUES = 3;

/** 升序数组里 value 的分位，0~1 */
function percentile(sorted: number[], value: number): number {
  if (sorted.length < 2) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

export function buildCodingConsensus(
  models: ModelRecord[],
): (m: ModelRecord) => CodingConsensus | null {
  const pools = new Map<string, number[]>();
  for (const m of models) {
    for (const s of m.coding ?? []) {
      if (s.attribution !== 'third-party') continue;
      const pool = pools.get(s.league);
      if (pool) pool.push(s.score);
      else pools.set(s.league, [s.score]);
    }
  }
  for (const pool of pools.values()) pool.sort((a, b) => a - b);

  const cache = new Map<string, CodingConsensus | null>();
  return (m) => {
    const hit = cache.get(m.id);
    if (hit !== undefined) return hit;

    const pcts: number[] = [];
    const ids: string[] = [];
    for (const s of m.coding ?? []) {
      if (s.attribution !== 'third-party') continue;
      const pool = pools.get(s.league);
      if (!pool || pool.length < MIN_POOL) continue;
      pcts.push(percentile(pool, s.score));
      ids.push(s.league);
    }
    const out: CodingConsensus | null =
      pcts.length >= MIN_LEAGUES
        ? {
            score: pcts.reduce((a, b) => a + b, 0) / pcts.length,
            leagues: pcts.length,
            leagueIds: ids,
          }
        : null;
    cache.set(m.id, out);
    return out;
  };
}
