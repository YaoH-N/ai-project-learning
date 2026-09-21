/**
 * 模型详情页底部的 B 站实测视频。
 *
 * 数据从哪来：构建期之外**手动**跑 `npm run bilibili`，用 B 站公开的视频搜索接口
 * 按「{模型名} 测评」搜一遍，结果提交进 `data/bilibili.json`。
 * 为什么不在浏览器里现搜：B 站接口没有对任意站点开放 CORS，而这个站是纯静态导出，
 * 没有可以代理的服务端。为什么不在构建期搜：B 站风控很紧，构建一次要发上百个请求，
 * 等于把「能不能构建成功」押在别人的风控策略上。
 *
 * **搜索结果不能直接用。** 搜「DeepSeek V4 Pro 测评」，前几条里混着
 * 「DeepSeek 开发指南」「深夜宕机，天才程序员的陨落」这种沾边但不对题的。
 * 所以过一道和站内其它地方同源的严格规则：**标题里必须出现这个模型的名字**
 * （折叠比对 + 词边界）。命中少但不会错——给 GPT-6 的页面挂一条讲别的模型的视频，
 * 比这块空着糟得多。
 *
 * 纯函数、确定性。过滤规则放在这里而不是脚本里，是为了让「为什么这条在/不在」
 * 能在 src 里一眼查到，改规则也不用重新联网抓一遍。
 */

/** 每个模型最多列几个。12 是产品负责人定的。 */
export const MAX_PER_MODEL = 12;

/** 名字太短的不参与匹配：三个字符以下在中文标题里几乎必然误命中 */
const MIN_NEEDLE = 4;

export interface VideoRecord {
  bvid: string;
  title: string;
  /** 封面，已归一到 https */
  cover: string;
  /** 发布日期 YYYY-MM-DD */
  date: string;
  /** mm:ss */
  duration: string;
  view: number;
  /** UP 主昵称 */
  author: string;
  /** UP 主 mid，用来认出站长自己的视频 */
  mid: number;
}

export interface ModelVideos {
  fetchedAt: string;
  videos: VideoRecord[];
  /**
   * 页面标题上显示的名字。多数时候就是模型名；带日期后缀的型号（见 `baseName`）
   * 显示的是去掉日期的那个，因为列表里多数视频讲的是整条产品线而不是这一个快照。
   * **必须显示出来**——读者得知道这些视频讲的到底是哪一个。
   */
  matchedName?: string;
}

export interface VideoLibrary {
  fetchedAt: string;
  /** 搜索时拼在模型名后面的词，写进数据里是为了让读者能复现同一次搜索 */
  keyword: string;
  /** 站长 mid，他的视频会排在最前面并打标 */
  authorMid: number;
  /** model.id → 这个模型的视频 */
  byModel: Record<string, ModelVideos>;
}

/**
 * 去掉名字末尾的日期型号，如 `DeepSeek V4 Flash 0731` → `DeepSeek V4 Flash`、
 * `Qwen3 235B A22b 2507` → `Qwen3 235B A22b`。没有日期后缀时返回 null。
 *
 * 为什么需要：这类后缀是厂商给 API 快照编的号，**没有人会把它写进视频标题**。
 * 于是「DeepSeek V4 Flash 0731」这种页面搜出来永远是零条，而它 ECI 排全球第 31，
 * 是读者真会点进去的页面。退一步用不带日期的名字去搜，再把用到的名字如实写在标题上。
 *
 * 只认 4 / 6 / 8 位纯数字，且必须是独立的最后一个词——
 * 「Llama 3.1 70B」的 70B 不是纯数字，「GPT-4」的 4 不够四位，都不会被误剥。
 */
export function baseName(modelName: string): string | null {
  const m = /^(.*\S)\s+\d{4}(?:\d{2})?(?:\d{2})?$/.exec(modelName.trim());
  if (!m) return null;
  const base = m[1].trim();
  return base.length >= MIN_NEEDLE && base !== modelName.trim() ? base : null;
}

/** 与 search.ts / filters.ts 同一套折叠规则：大小写、分隔符都不计 */
function fold(s: string): string {
  return s.toLowerCase().replace(/[\s._\-/·、，,：:！!？?（）()【】[\]|｜]+/g, '');
}

const isAlnum = (c: string | undefined) => c != null && /[a-z0-9]/.test(c);

/**
 * 折叠后的 haystack 里是否作为一个「完整的词」出现过 needle。
 *
 * 边界检查是必须的：折叠之后 `grok4` 是 `grok46` 的前缀，
 * 不查边界的话「Grok 4.6 实测」会被挂到 Grok 4 上。
 */
export function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i < 0) return false;
    if (!isAlnum(haystack[i - 1]) && !isAlnum(haystack[i + needle.length])) return true;
    from = i + 1;
  }
}

/**
 * 从搜索结果里挑出真正属于这个模型的，排好序。
 *
 * `names` 可以给多个，命中任意一个就算数。日期型号要靠这一点：
 * `DeepSeek V4 Flash 0731` 得同时认「…0731」和「DeepSeek V4 Flash」两个名字——
 * 只认前者会把整条产品线的实测全漏掉，只认后者又会把那条真写了 0731 的漏掉，
 * 因为词边界规则下 `deepseekv4flash` 后面紧跟 `0731` 不算一个完整的词。
 *
 * 排序：**站长的视频排最前**（这是他的站，而且做成 B 站 Toy 之后作者视频是第一现场），
 * 其余按播放量降序。不沿用 B 站的相关性顺序，是因为那个顺序说不清；
 * 播放量是卡片上就印着的数字，读者能自己判断这个排序合不合理。
 */
export function pickVideos(
  names: string | string[],
  candidates: VideoRecord[],
  authorMid: number,
  limit = MAX_PER_MODEL,
): VideoRecord[] {
  const needles = (Array.isArray(names) ? names : [names]).map(fold).filter((n) => n.length >= MIN_NEEDLE);
  if (needles.length === 0) return [];

  const seen = new Set<string>();
  const hits = candidates.filter((v) => {
    if (seen.has(v.bvid)) return false;
    const title = fold(v.title);
    if (!needles.some((n) => containsWord(title, n))) return false;
    seen.add(v.bvid);
    return true;
  });

  hits.sort((a, b) => {
    const am = a.mid === authorMid ? 0 : 1;
    const bm = b.mid === authorMid ? 0 : 1;
    if (am !== bm) return am - bm;
    return b.view - a.view || a.bvid.localeCompare(b.bvid);
  });

  return hits.slice(0, limit);
}

/** 页面拿这一个就够：视频列表 + 实际用来搜索的名字 */
export function videosFor(
  library: VideoLibrary,
  modelId: string,
  modelName: string,
): { videos: VideoRecord[]; queryName: string } {
  const entry = library.byModel[modelId];
  return { videos: entry?.videos ?? [], queryName: entry?.matchedName ?? modelName };
}

/** 播放量：1.3 万 / 1.2 亿。B 站自己也是这么显示的。 */
export function formatView(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)} 亿`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万`;
  return String(n);
}
