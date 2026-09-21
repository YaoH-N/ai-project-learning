/**
 * 全站搜索。
 *
 * 要解决的是三个「找不到」：读者知道模型名却要点三层才搜得到；知道厂商却看不出它家有没有
 * 能看图的；想按能力找（「多模态的有哪些」）则根本没有入口。
 *
 * 所以这里搜的不只是名字，还有**厂商**与**能力概念**。「多模态」「开源」「国内」这类词
 * 不是标签字段——它们是从 `modalities`、`openWeights`、厂商归属现算出来的，
 * 所以搜索命中之后给出的是一个**筛选链接**加一个**真实数量**，而不是一段说明文字。
 *
 * 更要紧的是词能组合：输入「智谱 多模态」会算出「智谱 · 多模态 → N 个」。
 * 「某家有没有某类模型」是这个站被问得最多的问题，一次输入就该给出答案。
 *
 * 分工：`buildSearchIndex` 在构建期跑（scripts/search-index），产出 `public/search-index.json`；
 * `runSearch` 在浏览器里跑，纯函数、不依赖任何 React。索引按需加载——
 * 导航条在每一页都有，把几十 KB 的索引内联进 580 个静态页面是不划算的。
 */

// 这个文件要能被 scripts/search-index 用 tsx 直接跑，所以一律写相对路径：
// 构建脚本不走 Next 的 `@/` 别名解析。
import { continentForCountry, profileFor } from '../data/vendor-registry';
import { kindOf, type ModelKind } from './kind';
import type { Continent, WorldSnapshot } from './types';

/* ────────────────────────────── 索引 ────────────────────────────── */

/** 字段名压到一个字母：553 个模型，键名本身就占几十 KB */
export interface IndexVendor {
  /** 厂商 id */
  i: string;
  /** 中文名 */
  n: string;
  /** 家徽母题 */
  m: string;
  /** 家徽主色 */
  a: string;
  c: Continent;
  /** 在役模型数 */
  t: number;
}

export interface IndexModel {
  s: string;
  n: string;
  /** vendors[] 下标 */
  v: number;
  k: ModelKind | null;
  /** 综合智力名次，没有为 null */
  r: number | null;
  /** 权重：o 开源、c 闭源；字段缺失表示上游没说，两边都不算 */
  w?: 'o' | 'c';
  /** 1 表示已退役 */
  x?: 1;
}

export interface SearchIndex {
  generatedAt: string;
  vendors: IndexVendor[];
  models: IndexModel[];
}

export function buildSearchIndex(snapshot: WorldSnapshot): SearchIndex {
  const vendorIds = [...new Set(snapshot.models.map((m) => m.vendorId))];
  const known = new Map(snapshot.vendors.map((v) => [v.id, v]));
  const aliveByVendor = new Map<string, number>();
  for (const m of snapshot.models) {
    if (m.retiredAt) continue;
    aliveByVendor.set(m.vendorId, (aliveByVendor.get(m.vendorId) ?? 0) + 1);
  }

  const vendors: IndexVendor[] = vendorIds.map((id) => {
    const v = known.get(id);
    const p = profileFor(id);
    return {
      i: id,
      n: v?.nameZh ?? p.nameZh,
      m: v?.motif ?? p.motif,
      a: v?.accentColor ?? p.accentColor,
      c: v?.continent ?? continentForCountry(p.country),
      t: aliveByVendor.get(id) ?? 0,
    };
  });

  const vendorIndex = new Map(vendorIds.map((id, i) => [id, i]));

  // 名次跟排行榜一致：按 ECI 降序。这里只存名次不存分数，结果行上显示「综合智力第 N」
  const ranked = snapshot.models
    .filter((m) => !m.retiredAt && m.benchmarks?.eci != null)
    .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci!);
  const rankOf = new Map(ranked.map((m, i) => [m.id, i + 1]));

  const models: IndexModel[] = snapshot.models.map((m) => ({
    s: m.slug,
    n: m.name,
    v: vendorIndex.get(m.vendorId)!,
    k: kindOf(m),
    r: rankOf.get(m.id) ?? null,
    ...(m.openWeights === true ? { w: 'o' as const } : m.openWeights === false ? { w: 'c' as const } : {}),
    ...(m.retiredAt ? { x: 1 as const } : {}),
  }));

  return { generatedAt: snapshot.generatedAt, vendors, models };
}

/* ────────────────────────────── 概念词 ────────────────────────────── */

/**
 * 能落成总表筛选参数的概念。每个维度最多选一个，可以互相叠加，也可以再叠一个厂商。
 * `keywords` 全部写成折叠后的形式（小写、无分隔符），匹配时直接比。
 */
export type ConceptDimension = 'kind' | 'weights' | 'region';

export interface Concept {
  id: string;
  dimension: ConceptDimension;
  /** 写进 URL 的参数值 */
  value: string;
  label: string;
  /** 结果行的副标题，说清这一类是怎么判定的 */
  hint: string;
  keywords: string[];
}

export const CONCEPTS: readonly Concept[] = [
  {
    id: 'multimodal',
    dimension: 'kind',
    value: 'multimodal',
    label: '多模态',
    hint: '除纯文本以外的全部：能看图、能听声、能出图出视频',
    keywords: ['多模态', '多模', 'multimodal', 'mm', '非纯文本'],
  },
  {
    id: 'vision',
    dimension: 'kind',
    value: 'vision',
    label: '视觉',
    hint: '能看图或看视频，输出文字',
    keywords: ['视觉', '看图', '识图', '图片理解', '图像理解', '读图', 'vision', 'vl', 'vlm'],
  },
  {
    id: 'omni',
    dimension: 'kind',
    value: 'omni',
    label: '全模态',
    hint: '既能听声音又能看画面',
    keywords: ['全模态', '又听又看', 'omni'],
  },
  {
    id: 'image-gen',
    dimension: 'kind',
    value: 'image-gen',
    label: '图像生成',
    hint: '输出里含图片',
    keywords: ['图像生成', '文生图', '画图', '出图', '生图', '绘图', '生成图片', 'imagegen', 'texttoimage', 't2i'],
  },
  {
    id: 'video-gen',
    dimension: 'kind',
    value: 'video-gen',
    label: '视频生成',
    hint: '输出里含视频',
    keywords: ['视频生成', '文生视频', '出视频', '生成视频', 'videogen', 'texttovideo', 't2v'],
  },
  {
    id: 'speech',
    dimension: 'kind',
    value: 'speech',
    label: '语音',
    hint: '语音识别、语音合成，或只听不看的语音对话',
    keywords: ['语音', '声音', '音频', '语音识别', '语音合成', '转写', 'speech', 'audio', 'tts', 'asr', 'voice'],
  },
  {
    id: 'text',
    dimension: 'kind',
    value: 'text',
    label: '文本',
    hint: '只读文字、只出文字',
    keywords: ['文本', '纯文本', '文字', 'text', 'llm'],
  },
  {
    id: 'open',
    dimension: 'weights',
    value: 'open',
    label: '开源',
    hint: '权重公开，可以自己部署',
    keywords: ['开源', '开放权重', '权重公开', '可自部署', 'open', 'openweights', 'opensource'],
  },
  {
    id: 'closed',
    dimension: 'weights',
    value: 'closed',
    label: '闭源',
    hint: '权重不公开，只能走 API',
    keywords: ['闭源', '不开源', '闭源模型', 'closed', 'proprietary'],
  },
  {
    id: 'east',
    dimension: 'region',
    value: 'east',
    label: '国内',
    hint: '总部在中国（含港澳台）的厂商',
    keywords: ['国内', '国产', '中国', '大陆', 'china', 'chinese', 'domestic'],
  },
  {
    id: 'west',
    dimension: 'region',
    value: 'west',
    label: '国外',
    hint: '总部在中国以外的厂商',
    keywords: ['国外', '海外', '外国', 'foreign', 'overseas', 'us'],
  },
];

/**
 * 排行榜赛道的快捷入口。这些是「谁最强」类的问题，答案在排行榜不在总表，
 * 所以它们只给链接、不参与和厂商的组合。id 用的是 scores.ts 里写死的四条实用指标。
 */
export interface TrackShortcut {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
}

export const TRACK_SHORTCUTS: readonly TrackShortcut[] = [
  {
    id: 'context',
    label: '上下文最长',
    hint: '按一次能读进去多少字排',
    keywords: ['上下文', '长上下文', '记性', '记忆', '窗口', 'context', 'longcontext'],
  },
  {
    id: 'cheapest',
    label: '最便宜',
    hint: '按输出单价从低到高排',
    keywords: ['便宜', '最便宜', '省钱', '低价', '白菜价', 'cheap', 'cheapest', 'price'],
  },
  {
    id: 'value',
    label: '最划算',
    hint: '按同等智力下的价格优势排',
    keywords: ['划算', '性价比', '值', 'value'],
  },
  {
    id: 'newest',
    label: '最新发布',
    hint: '按发布日期从新到旧排',
    keywords: ['最新', '新发布', '最近', '刚出', 'newest', 'latest', 'new'],
  },
];

/* ────────────────────────────── 查询 ────────────────────────────── */

/** 与 filters.ts 的 fold 同一套规则，保证搜索框与总表搜索框对同一串字的理解一致 */
function fold(s: string): string {
  return s.toLowerCase().replace(/[\s._\-/·、，,]+/g, '');
}

export interface ShortcutHit {
  /** 结果行主标题，如「智谱 · 多模态」 */
  label: string;
  hint: string;
  href: string;
  /** 符合的在役模型数；赛道快捷入口没有这个数 */
  count: number | null;
  /** 有厂商参与时用它画家徽 */
  vendor: IndexVendor | null;
}

export interface VendorHit {
  vendor: IndexVendor;
  href: string;
}

export interface ModelHit {
  model: IndexModel;
  vendor: IndexVendor;
  href: string;
}

export interface SearchResult {
  shortcuts: ShortcutHit[];
  vendors: VendorHit[];
  models: ModelHit[];
  /** 名称匹配的模型总数，可能多于 models 里给出的几条 */
  modelTotal: number;
}

const EMPTY: SearchResult = { shortcuts: [], vendors: [], models: [], modelTotal: 0 };

const MAX_VENDORS = 4;
const MAX_MODELS = 8;

function conceptScore(keywords: readonly string[], token: string): number {
  let best = 0;
  for (const kw of keywords) {
    if (kw === token) best = Math.max(best, 3);
    // 「多模」应该能命中「多模态」，但单个字母不该把整张词表点亮
    else if (token.length >= 2 && kw.startsWith(token)) best = Math.max(best, 2);
    else if (kw.length >= 2 && token.includes(kw)) best = Math.max(best, 1);
  }
  return best;
}

function bestBy<T>(items: readonly T[], score: (t: T) => number): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of items) {
    const s = score(item);
    if (s > 0 && (best == null || s > best.score)) best = { item, score: s };
  }
  return best;
}

function vendorScore(v: IndexVendor, token: string): number {
  const n = fold(v.n);
  const id = fold(v.i);
  if (n === token || id === token) return 3;
  if (n.startsWith(token) || id.startsWith(token)) return 2;
  if (token.length >= 2 && (n.includes(token) || id.includes(token))) return 1;
  return 0;
}

/** 与 filters.ts 的 makePredicate 必须保持同义，否则搜索报的数和点进去看到的对不上 */
function matchesConcept(c: Concept, m: IndexModel, v: IndexVendor): boolean {
  switch (c.dimension) {
    case 'kind':
      return c.value === 'multimodal' ? m.k != null && m.k !== 'text' : m.k === c.value;
    case 'region':
      return v.c === c.value;
    case 'weights':
      return m.w === (c.value === 'open' ? 'o' : 'c');
  }
}

const PARAM_OF: Record<ConceptDimension, string> = {
  kind: 'kind',
  weights: 'weights',
  region: 'region',
};

/**
 * 跑一次搜索。`index` 由调用方加载并缓存。
 *
 * 两条路并行：
 * 1. **按词理解**——把每个 token 尝试解释成概念或厂商，全部解释得通就给一条组合筛选。
 * 2. **按串匹配**——整串去撞模型名、slug、厂商名。
 * 两条路互不干扰，「智谱」既会出现在厂商命中里，也可能参与组合。
 */
export function runSearch(index: SearchIndex | null, raw: string): SearchResult {
  const query = raw.trim();
  if (!index || query === '') return EMPTY;

  const tokens = query.split(/[\s\u3000]+/).filter(Boolean).map(fold).filter(Boolean);
  const q = fold(query);
  if (q === '') return EMPTY;

  /* ── 1. 组合筛选与赛道快捷入口 ── */
  const shortcuts: ShortcutHit[] = [];
  const picked: Concept[] = [];
  let pickedVendor: IndexVendor | null = null;
  let allUnderstood = tokens.length > 0;

  for (const t of tokens) {
    const c = bestBy(CONCEPTS, (x) => conceptScore(x.keywords, t));
    if (c && !picked.some((p) => p.dimension === c.item.dimension)) {
      picked.push(c.item);
      continue;
    }
    const v = bestBy(index.vendors, (x) => vendorScore(x, t));
    if (v && pickedVendor == null) {
      pickedVendor = v.item;
      continue;
    }
    // 重复维度的词（「视觉 全模态」）不算没读懂，只是后一个被忽略
    if (!c) allUnderstood = false;
  }

  if (picked.length > 0 && allUnderstood) {
    const params = new URLSearchParams();
    for (const c of picked) params.set(PARAM_OF[c.dimension], c.value);
    if (pickedVendor) params.set('vendor', pickedVendor.i);

    // 只数在役的：读者问「有没有」时问的是现在能用的，不是历史上出现过的
    const vendorId = pickedVendor?.i ?? null;
    const count = index.models.filter(
      (m) =>
        !m.x &&
        (vendorId == null || index.vendors[m.v].i === vendorId) &&
        picked.every((c) => matchesConcept(c, m, index.vendors[m.v])),
    ).length;

    shortcuts.push({
      label: [pickedVendor?.n, ...picked.map((c) => c.label)].filter(Boolean).join(' · '),
      hint: picked.map((c) => c.hint).join('；'),
      href: `/leaderboard/all/?${params.toString()}`,
      count,
      vendor: pickedVendor,
    });
  }

  for (const t of TRACK_SHORTCUTS) {
    if (conceptScore(t.keywords, q) > 0) {
      shortcuts.push({
        label: t.label,
        hint: t.hint,
        href: `/leaderboard/?track=${t.id}`,
        count: null,
        vendor: null,
      });
    }
  }

  /* ── 2. 整串匹配厂商与模型 ── */
  const vendorHits: { hit: VendorHit; score: number }[] = [];
  for (const v of index.vendors) {
    const s = vendorScore(v, q);
    if (s > 0) vendorHits.push({ hit: { vendor: v, href: `/vendor/${v.i}/` }, score: s });
  }
  vendorHits.sort((a, b) => b.score - a.score || b.hit.vendor.t - a.hit.vendor.t);

  const modelHits: { hit: ModelHit; score: number }[] = [];
  for (const m of index.models) {
    const name = fold(m.n);
    const vendor = index.vendors[m.v];
    let score = 0;
    if (name === q) score = 4;
    else if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    else if (fold(m.s).includes(q) || fold(vendor.n).includes(q)) score = 1;
    if (score === 0) continue;
    modelHits.push({ hit: { model: m, vendor, href: `/model/${m.s}/` }, score });
  }
  modelHits.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    // 已退役的排最后：搜「GPT 4」时读者想先看到还活着的
    const ax = a.hit.model.x ? 1 : 0;
    const bx = b.hit.model.x ? 1 : 0;
    if (ax !== bx) return ax - bx;
    const ar = a.hit.model.r ?? Number.POSITIVE_INFINITY;
    const br = b.hit.model.r ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.hit.model.n.localeCompare(b.hit.model.n);
  });

  return {
    shortcuts: shortcuts.slice(0, 3),
    vendors: vendorHits.slice(0, MAX_VENDORS).map((x) => x.hit),
    models: modelHits.slice(0, MAX_MODELS).map((x) => x.hit),
    modelTotal: modelHits.length,
  };
}
