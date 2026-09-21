/**
 * 服务端瘦身后交给客户端组件的数据形状。
 *
 * 完整的 `ModelRecord` 带着 provenance、pricing、modalities 等几十个字段，
 * 484 个模型序列化进 HTML 要一两兆。排行榜只需要认人（名字、家徽、厂商）
 * 与筛选（地区、开源、年份、退役）用到的几个字段，其余一律不下发。
 *
 * 数值一律在服务端格式化成展示文本再下发，客户端不带格式化逻辑。
 */

import type { ModelKind } from '@/lib/kind';
import type { Continent } from '@/lib/types';

export interface LeanVendor {
  id: string;
  nameZh: string;
  motif: string;
  accent: string;
  continent: Continent;
}

export interface LeanModel {
  id: string;
  slug: string;
  name: string;
  vendor: string;
  /** 发布年份，筛选用；无发布日期为 null */
  year: number | null;
  open: boolean | null;
  retired: boolean;
  /** 模型类型，由模态推导（kind.ts）；上游没标模态时为 null */
  kind: ModelKind | null;
}

export interface LeanEntry {
  /** 模型在 `models[]` 里的下标 */
  m: number;
  /** 排序与条形图用的原始值 */
  v: number;
  /** 已格式化的展示文本 */
  t: string;
  /** 厂商自报 */
  s?: 1;
  /** 出处链接在 `urls[]` 里的下标 */
  u?: number;
}

export interface LeanTrack {
  id: string;
  label: string;
  category: string;
  note: string;
  higherIsBetter: boolean;
  scale: 'linear' | 'log';
  superseded: boolean;
  selfReported: boolean;
  homepage: string | null;
  entries: LeanEntry[];
}

export interface ExplorerData {
  models: LeanModel[];
  vendors: LeanVendor[];
  tracks: LeanTrack[];
  /** 出处链接去重表，条目用下标引用 */
  urls: string[];
  /** 分类展示顺序 */
  categories: string[];
  defaultTrack: string;
}

/** 总表的一行。数值已格式化，排序键另存原始值。 */
export interface AllRow {
  m: number;
  /** 发布日期 ISO，排序用 */
  date: string | null;
  dateText: string;
  ctx: number | null;
  ctxText: string | null;
  price: number | null;
  priceText: string | null;
  eci: number | null;
  eciRank: number | null;
  /** 编程代表成绩，取自能力条同一套挑选逻辑 */
  code: {
    /** 档位词或「已参赛」 */
    verdict: string;
    /** 分位 0~1，排序用 */
    fill: number;
    self: boolean;
    /** 悬停全文：赛制、原始分、池内名次 */
    title: string;
  } | null;
  /** 参赛榜数（去重后的榜单数） */
  n: number;
}

export interface AllTableData {
  models: LeanModel[];
  vendors: LeanVendor[];
  rows: AllRow[];
}
