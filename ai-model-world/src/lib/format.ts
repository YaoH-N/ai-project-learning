import type { DatePrecision, ModelRecord, ScoreUnit } from './types';
import { getDict, type Lang } from './i18n';

/**
 * 展示层的格式化。
 *
 * 一条原则贯穿全部函数：**没有数据就说没有数据**，绝不用 0、'-' 或者估算值糊过去。
 * 这个站点的使命是让人看到真实状态，一个假的 0 比一个诚实的「暂无数据」有害得多。
 */

/**
 * 按量纲写评测分数与单位。
 *
 * `index` 这一支不能省：ALE-Bench 的成绩是 137–2177 的自定义评分标度、
 * AlgoTune 的是 1.3–2 倍的加速比，两者都不是百分数。
 * 早先只区分 elo 与「其余一律当百分数」，ALE-Bench 的 2176.9 被渲染成了「2176.9%」——
 * 一个看起来像数据错误、实则是渲染错误的数字，比缺数据更伤可信度。
 */
export function formatScoreByUnit(score: number, unit: ScoreUnit): string {
  if (unit === 'elo') return `${Math.round(score)} Elo`;
  // index 没有通用单位：大标度（ALE-Bench）取整，小倍率（AlgoTune 的加速比）留两位
  if (unit === 'index') return score >= 100 ? String(Math.round(score)) : `${score.toFixed(2)}×`;
  if (unit === 'minutes') return formatMinutes(score);
  if (unit === 'usd') return formatUsd(score);
  return `${score.toFixed(1)}%`;
}

/**
 * 时长按人的习惯换单位：METR 的「能独立完成多长的任务」从几分钟到几天都有，
 * 统一写成分钟会出现「4320 分钟」这种要心算的数字。
 */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes < 10 ? minutes.toFixed(1) : Math.round(minutes)} 分钟`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} 小时`;
  const days = hours / 24;
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} 天`;
}

/** 美元金额，千分位分隔，整数即可——Vending-Bench 的经营净值精确到分没有意义 */
export function formatUsd(usd: number): string {
  const abs = Math.abs(usd);
  const body = abs.toLocaleString('en-US', { maximumFractionDigits: abs < 100 ? 2 : 0 });
  return usd < 0 ? `-$${body}` : `$${body}`;
}

export function formatCount(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

/** 上下文窗口按「能装下多少字」来说，比裸 token 数对普通人更有画面感 */
export function formatContext(tokens: number | null, lang: Lang): string {
  const dict = getDict(lang);
  if (tokens == null) return dict.unknown.noData;
  return `${formatCount(tokens)} tokens`;
}

export function formatPrice(usdPerMTok: number | null, lang: Lang): string {
  const dict = getDict(lang);
  if (usdPerMTok == null) return dict.unknown.noData;
  if (usdPerMTok === 0) return '$0';
  const digits = usdPerMTok < 0.1 ? 3 : usdPerMTok < 10 ? 2 : 0;
  return `$${usdPerMTok.toFixed(digits)} / 百万 tokens`;
}

/** 低精度日期必须按其真实精度展示，把 2026-01 说成 2026-01-01 就是编造 */
export function formatDate(
  iso: string | null,
  precision: DatePrecision | null,
  lang: Lang,
): string {
  const dict = getDict(lang);
  if (!iso) return dict.unknown.noData;
  const [y, m, d] = iso.split('-');
  if (precision === 'year' || !m) return `${y} 年`;
  if (precision === 'month' || !d) return dict.unknown.monthOnly(Number(y), Number(m));
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

export function formatParams(model: ModelRecord, lang: Lang): string {
  const dict = getDict(lang);
  const { totalB, activeB, confidence } = model.params;
  if (totalB == null) return dict.unknown.sizeEstimated;
  const total = totalB >= 1000 ? `${(totalB / 1000).toFixed(1)}T` : `${totalB}B`;
  const body = activeB != null ? `${total}（激活 ${activeB}B）` : total;
  // 参数量的来源必须写清楚：从型号名读出来的和从权重文件量出来的不是一回事
  return confidence === 'exact' ? body : `${body} · 由型号名推断`;
}

export function formatBool(v: boolean | null, lang: Lang): string {
  const dict = getDict(lang);
  if (v == null) return dict.unknown.noData;
  return v ? '是' : '否';
}

const MODALITY_ZH: Record<string, string> = {
  text: '文字',
  image: '图像',
  audio: '声音',
  video: '视频',
  pdf: '文件',
};

export function formatModalities(list: string[], lang: Lang): string {
  const dict = getDict(lang);
  if (list.length === 0) return dict.unknown.noData;
  return list.map((m) => MODALITY_ZH[m] ?? m).join('、');
}

export function formatScore(v: number | null, lang: Lang, suffix = ''): string {
  const dict = getDict(lang);
  if (v == null) return dict.unknown.notRanked;
  return `${v.toFixed(1)}${suffix}`;
}
