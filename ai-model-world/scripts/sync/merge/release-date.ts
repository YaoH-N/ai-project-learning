import { RELEASE_DATE_OUTLIER_DAYS } from '../config';
import { comparableDay, type LooseDate } from '../lib/dates';
import type { SourceId } from '../../../src/lib/types';

export interface DateCandidate {
  source: SourceId;
  value: LooseDate;
  /**
   * 是否可以充当异常护栏的锚点。
   * models.dev 与 Epoch AI 的 release_date 是人工/半人工维护的「发布日期」字段，
   * 而网关的 created/released 本质上是上架时间，只能当选票，不能当基准。
   */
  anchor: boolean;
}

export interface DateVerdict {
  value: LooseDate;
  source: SourceId;
  candidates: Array<{ source: SourceId; iso: string; dropped: boolean }>;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/**
 * 发布日期仲裁。
 *
 * 依据调研第 4 节：OpenRouter 的 `created` 是上架日期而非发布日期，实测最大偏差 +179 天，
 * 且系统性地推迟中国厂商与开源权重模型（ByteDance Seed 滞后 179 天、Meituan LongCat 滞后 20 天）。
 * 「上架晚于发布」是系统性偏差，「早于真实发布日」极为罕见，所以基准策略是多源取 min。
 *
 * 护栏针对的是另一类错误：实测 qwen3-coder-next 的 Vercel `released` 比 models.dev 早 196 天，
 * 明显是别名/错值。如果无脑取 min，这条会把模型在时间轴上前移半年。
 *
 * 关键在于护栏的基准怎么选。调研原文写的是「比其他源的中位数早 60 天以上」，
 * 但只有两个候选时这条规则是对称的，会把 ByteDance 那个正确的早日期也一并丢掉
 * （models.dev=2026-02-14 vs OpenRouter=2026-08-12，前者才是对的）。
 * 所以这里改成以「发布日期语义的源」为锚点：models.dev / Epoch 说了算，
 * 网关只有在没有锚点时才用留一法中位数兜底。两个实测反例都能得到正确结果。
 */
export function arbitrateReleaseDate(input: DateCandidate[]): DateVerdict | null {
  const candidates = input.filter((c) => c.value);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return {
      value: candidates[0].value,
      source: candidates[0].source,
      candidates: [{ source: candidates[0].source, iso: candidates[0].value.iso, dropped: false }],
    };
  }

  const days = candidates.map((c) => comparableDay(c.value));
  const anchorIdx = candidates.findIndex((c) => c.anchor);
  const kept: DateCandidate[] = [];
  const trace: Array<{ source: SourceId; iso: string; dropped: boolean }> = [];

  for (let i = 0; i < candidates.length; i += 1) {
    let baseline: number;
    if (anchorIdx >= 0) {
      if (i === anchorIdx) {
        // 锚点自己永远不会被丢掉。
        trace.push({ source: candidates[i].source, iso: candidates[i].value.iso, dropped: false });
        kept.push(candidates[i]);
        continue;
      }
      baseline = days[anchorIdx];
    } else {
      baseline = medianOf(days.filter((_, j) => j !== i));
    }
    const dropped = days[i] < baseline - RELEASE_DATE_OUTLIER_DAYS;
    trace.push({ source: candidates[i].source, iso: candidates[i].value.iso, dropped });
    if (!dropped) kept.push(candidates[i]);
  }

  const pool = kept.length > 0 ? kept : candidates;
  // 取 min；同一天时按传入顺序（即源的优先级）取第一个，保证确定性。
  let best = pool[0];
  let bestDay = comparableDay(best.value);
  for (const c of pool.slice(1)) {
    const d = comparableDay(c.value);
    if (d < bestDay) {
      best = c;
      bestDay = d;
    }
  }

  trace.sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  return { value: best.value, source: best.source, candidates: trace };
}
