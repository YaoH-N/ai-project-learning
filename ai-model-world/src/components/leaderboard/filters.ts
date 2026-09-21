/**
 * 筛选条件与 URL 参数之间的往返，以及作用在瘦身模型上的判定。
 * 纯函数，排行榜与总表共用同一套，保证两个页面的 `?region=east` 意思一致。
 */

import { isModelKind, type ModelKind } from '@/lib/kind';
import type { LeanModel, LeanVendor } from './types';

export type Region = 'all' | 'east' | 'west';
export type Weights = 'all' | 'open' | 'closed';
/**
 * `multimodal` 不是 kind.ts 里的一类，而是「除纯文本以外的全部」这个跨类的问法。
 * 「有没有多模态模型」是这个站被问得最多的问题之一，而它在六选一的类型里无处落脚：
 * 读者得挨个点视觉、全模态、图像生成、视频生成、语音才能拼出答案。
 */
export type Kind = 'all' | 'multimodal' | ModelKind;

export interface FilterState {
  region: Region;
  weights: Weights;
  /** 模型类型：文本 / 视觉 / 全模态 / 图像生成 / 视频生成 / 语音 */
  kind: Kind;
  /** 选中的厂商 id；空数组表示不限 */
  vendors: string[];
  /** 发布年份；null 表示不限 */
  year: number | null;
  /** 是否把已退役的模型也算进来 */
  retired: boolean;
  /** 模糊搜索：模型名或厂商名 */
  q: string;
}

export const EMPTY_FILTER: FilterState = {
  region: 'all',
  weights: 'all',
  kind: 'all',
  vendors: [],
  year: null,
  retired: false,
  q: '',
};

export function filterFromParams(p: URLSearchParams): FilterState {
  const region = p.get('region');
  const weights = p.get('weights');
  const kind = p.get('kind');
  const year = Number(p.get('year'));
  return {
    region: region === 'east' || region === 'west' ? region : 'all',
    weights: weights === 'open' || weights === 'closed' ? weights : 'all',
    kind: kind === 'multimodal' ? 'multimodal' : isModelKind(kind) ? kind : 'all',
    vendors: (p.get('vendor') ?? '').split(',').filter(Boolean),
    year: Number.isInteger(year) && year > 2000 ? year : null,
    retired: p.get('retired') === '1',
    q: p.get('q') ?? '',
  };
}

/** 只写非默认值，URL 保持干净 */
export function filterToParams(f: FilterState): Record<string, string | null> {
  return {
    region: f.region === 'all' ? null : f.region,
    weights: f.weights === 'all' ? null : f.weights,
    kind: f.kind === 'all' ? null : f.kind,
    vendor: f.vendors.length ? f.vendors.join(',') : null,
    year: f.year == null ? null : String(f.year),
    retired: f.retired ? '1' : null,
    q: f.q.trim() ? f.q.trim() : null,
  };
}

export function isFilterActive(f: FilterState): boolean {
  return (
    f.region !== 'all' ||
    f.weights !== 'all' ||
    f.kind !== 'all' ||
    f.vendors.length > 0 ||
    f.year != null ||
    f.retired ||
    f.q.trim() !== ''
  );
}

/** 搜索用的小写归一：去掉分隔符，让 `gpt5.5`、`GPT-5.5`、`gpt 5 5` 都能对上 */
function fold(s: string): string {
  return s.toLowerCase().replace(/[\s._\-/]+/g, '');
}

export function makePredicate(
  f: FilterState,
  vendors: Map<string, LeanVendor>,
): (m: LeanModel) => boolean {
  const q = fold(f.q);
  const vendorSet = new Set(f.vendors);
  return (m) => {
    const v = vendors.get(m.vendor);
    if (!f.retired && m.retired) return false;
    if (f.region !== 'all' && (v?.continent ?? 'west') !== f.region) return false;
    if (f.weights === 'open' && m.open !== true) return false;
    if (f.weights === 'closed' && m.open !== false) return false;
    // 「未知」（上游没标模态）不算多模态，宁可漏也不要把没数据说成有能力
    if (f.kind === 'multimodal') {
      if (m.kind == null || m.kind === 'text') return false;
    } else if (f.kind !== 'all' && m.kind !== f.kind) return false;
    if (vendorSet.size > 0 && !vendorSet.has(m.vendor)) return false;
    if (f.year != null && m.year !== f.year) return false;
    if (q) {
      const hay = fold(`${m.name} ${m.id} ${v?.nameZh ?? ''} ${v?.id ?? m.vendor}`);
      if (!hay.includes(q)) return false;
    }
    return true;
  };
}
