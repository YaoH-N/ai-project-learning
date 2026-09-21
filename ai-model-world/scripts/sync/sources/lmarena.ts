/**
 * LMArena 官方榜单数据集（`lmarena-ai/leaderboard-dataset`，CC-BY 4.0）。
 *
 * 它补上的是别处补不上的一块：**图像生成与视频生成**。站内这两类当前是零成绩的
 * 空壳，而它们清一色是闭源商业模型（Nano Banana 家族、GPT-Image 家族、Grok Imagine、
 * Veo、Gemini Omni），公开做评测的只有 Artificial Analysis 与 LMArena 两家。
 * 实测过的其他候选全部不成立：Epoch 那个 zip 的 87 个文件里没有任何生成类榜单
 * （`video_mme` 是视频**理解**）；HELM 的图像分支 HEIM 停在 2023 年那一代，
 * 26 个模型与站内零交集；VBench 方向对但成绩数据集是私有的，取不到。
 *
 * ---
 *
 * ## 为什么这不违反「绝不抓取 LMArena」那条红线
 *
 * 红线针对的是**抓站**：`arena.ai/robots.txt` 至今仍是 `Disallow: /api/`，
 * 站点条款也禁止自动化抓取，那条依然有效，本管线不会去碰它。
 *
 * 这里读的是权利人**自己发布**的数据集，许可是 CC-BY 4.0，明确允许再分发与商用，
 * 条件只有署名。性质上与本管线消费 Epoch（同样 CC-BY 4.0）转载的 WebDev Arena Elo
 * 一致，而且更直接：那次是第三方转载，这次是权利人本人的发布。
 *
 * 对照 Artificial Analysis 可以看出两者的区别是方向性的：AA 没有任何授权，
 * 条款明文禁止再分发、并且禁止「为构建类似或竞争的服务而访问」；
 * 这份是主动给出的公共许可。**AA 永不豁免，这一条不改变那个立场。**
 *
 * CC-BY 的义务落在 `src/components/world/SiteFooter.tsx` 与致谢页：要给出创作者、
 * 许可名称与链接、材料链接，并且**声明我们做过修改**（我们做了改名匹配与重新排序）。
 *
 * ---
 *
 * ## 两件必须做对的事
 *
 * 1. **Arena 分数绝不能并进综合智力。** 它是人类盲投的 Bradley-Terry 分，
 *    与学术评测的通过率不是一个赛制，而且上游方法论换过好几轮（Elo → Bradley-Terry、
 *    style control 默认开启、频率重加权）。按项目铁律「跨赛制永不混算」，
 *    每个 arena 单独成榜，只进 `scores[]`，不碰 `benchmarks.eci`。
 *
 * 2. **模型名要从括号里取别名。** 上游的 `model_name` 形如
 *    `gemini-3-pro-image-2k (nano-banana-pro)`、`gpt-image-2 (medium)`，
 *    括号里往往才是站内用的通行名。所以主名与括号内容都要注册成候选键，
 *    再交给 `slugVariants` 归一。只认主名会漏掉 Google 那一整批。
 */
import { ENDPOINTS } from '../config';
import { alnum, slugVariants, stripParenthetical } from '../lib/ids';
import { fetchJson } from '../lib/http';
import { errorMessage, log } from '../lib/log';
import type { ScoreUnit } from '../../../src/lib/types';

/** 上游一页最多给 100 行，超过要翻页 */
const PAGE = 100;

/**
 * 翻页之间的间隔。
 *
 * 首次实测：八个分榜连着翻二十多页，后三个（text / search / document）全部吃到
 * HTTP 429。datasets-server 对匿名请求有速率限制，而文本竞技场有六百多行、单独就要七页。
 * 加这个间隔之后整轮多花十几秒，同步本来就不是实时任务，换取的是分榜不再随机掉。
 */
const PAGE_DELAY_MS = 700;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 成绩的署名地址指向**数据集**，不是 arena.ai 的榜单页。
 *
 * 两个理由，任一条都足够。其一，CC-BY 要求给出「材料」的链接，而我们消费的是这份
 * 数据集，不是那个网页；这与 WebDev Arena 那一条把 sourceUrl 写成 epoch.ai 是同一个
 * 道理——署名给我们真正读的那一份。其二，写站点地址会被 `findBlockedBenchmarkSources`
 * 拦下，而那道闸门**不该为此放宽**：它防的是「分数是抓 arena.ai 得来的」，
 * 这个判据继续严格成立才是对的。人类可读的榜单页放在 benchmark-registry 的 homepage 里。
 */
const DATASET_URL = 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset';

export interface ArenaScore {
  league: string;
  /** 归一化后的候选键，形如 `nanobananapro`。合并阶段按它匹配站内模型 */
  keys: string[];
  /** 上游给的机构名，用于收窄匹配，避免跨厂商撞名 */
  organization: string;
  score: number;
  unit: ScoreUnit;
  voteCount: number;
  rank: number;
  publishDate: string;
  sourceUrl: string;
}

export interface ArenaResult {
  scores: ArenaScore[];
  /** 逐个分榜的行数，进同步报告 */
  counts: Record<string, number>;
  ok: boolean;
  note: string;
}

/**
 * 要拉的分榜。`config` 是上游的 config 名，`league` 是站内赛制 id。
 *
 * **`webdev` 故意不在这里。** 站内已经有 `webdev_arena_elo`，走的是 Epoch 的转载，
 * 两边同时接会让同一个赛制出现两份来源不同的分数。等哪天决定切换再一起动，
 * 现在重复接入只会制造一个需要仲裁的新问题。
 *
 * **`text` 也不在这里，原因是体量。** 它的 `latest` 有 10606 行，而其余分榜都在
 * 10 到 650 行之间。一页 100 行就是 107 次请求，实测直接把 datasets-server 的匿名限流
 * 打满，而且会连累排在它后面的分榜一起 429（首轮 text / search / document 三个一起掉）。
 * 行数这么大是因为同一个模型在 overall、coding、math、多轮、指令遵循等十几个子分类里
 * 各占一行，而我们只要 overall 那一条。
 *
 * 不接的代价很小：文本模型站内本来就有 ECI 与几十个学术榜单，竞技场只是锦上添花；
 * 图像视频模型则是没有它就一个分数都没有。真要接，正确做法是改读 parquet
 * （一个分榜一次请求）而不是翻页，或者用 `/filter` 端点在服务端按 category 过滤。
 */
const ARENAS: Array<{ config: string; league: string }> = [
  { config: 'text_to_image', league: 'arena_text_to_image' },
  { config: 'text_to_video', league: 'arena_text_to_video' },
  { config: 'image_edit', league: 'arena_image_edit' },
  { config: 'image_to_video', league: 'arena_image_to_video' },
  { config: 'video_edit', league: 'arena_video_edit' },
  { config: 'search', league: 'arena_search' },
  { config: 'document', league: 'arena_document' },
];

interface RawRow {
  model_name?: string;
  organization?: string;
  rating?: number;
  vote_count?: number;
  rank?: number;
  category?: string;
  leaderboard_publish_date?: string;
}

interface RowsResponse {
  rows?: Array<{ row?: RawRow }>;
  num_rows_total?: number;
}

/**
 * 尾部的**配置后缀**，不是模型身份的一部分，要逐层剥掉再比。
 *
 * 两边都挂，而且挂的不是同一套，不剥就对不上：上游是 `veo-3.1-audio`、
 * `gpt-image-1.5-high-fidelity`、`grok-imagine-video-1.5-agent`，
 * 我们这边是 `veo-3.1-generate-preview`。实测不剥的话图像视频模型只能匹配三分之一。
 *
 * **`fast`、`lite`、`pro`、`turbo`、`mini` 绝不能进这张表。** 它们是同一家族里不同
 * 型号的区分位，剥掉之后 `veo-3.1-fast` 会跟 `veo-3.1` 撞成一个，分数就串了。
 * 这张表只收「同一个型号的不同跑法」：分辨率、输出档位、有没有声音、带不带 harness。
 */
const CONFIG_TOKENS = new Set([
  'audio',
  '1080p',
  '720p',
  '480p',
  '2k',
  '4k',
  'high',
  'low',
  'medium',
  'quality',
  'fidelity',
  'highfidelity',
  'agent',
  'preview',
  'generate',
  'latest',
  'exp',
  'experimental',
]);

/** 逐层剥掉尾部配置词，把每一层都当候选。`veo-3.1-fast-audio` → `veo31fastaudio` + `veo31fast` */
function configStripped(raw: string): string[] {
  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let end = tokens.length; end > 0; end -= 1) {
    out.push(tokens.slice(0, end).join('-'));
    const last = tokens[end - 1].replace(/\./g, '');
    if (!CONFIG_TOKENS.has(last)) break;
  }
  return out;
}

/**
 * 从上游的一个 `model_name` 里榨出全部候选键。
 *
 * 三种形态都要覆盖：
 *   `veo-3.1-audio`                            剥掉 audio 之后才是 veo-3.1
 *   `gemini-3-pro-image-2k (nano-banana-pro)`  括号里是通行名，比主名更可能匹配上
 *   `gpt-image-2 (medium)`                     括号里是档位，去掉它才是模型名
 * 主名与括号内容各自都要注册，每一个再走一遍后缀剥离。
 */
export function arenaNameKeys(modelName: string): string[] {
  const keys = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    for (const stripped of configStripped(t)) {
      for (const v of slugVariants(stripped)) if (v) keys.add(v);
    }
  };

  // `[web-search]` 这类方括号标记是运行配置，不是模型名的一部分
  const cleaned = modelName.replace(/\[[^\]]*\]/g, ' ').trim();
  add(stripParenthetical(cleaned));
  for (const m of cleaned.matchAll(/\(([^)]*)\)/g)) add(m[1]);
  return [...keys].filter(Boolean);
}

/** 站内模型名同样要剥一遍，否则 `veo-3.1-generate-preview` 永远碰不到 `veo-3.1` */
export function arenaMatchCandidates(names: string[]): string[] {
  const keys = new Set<string>();
  for (const n of names) {
    for (const stripped of configStripped(n)) {
      for (const v of slugVariants(stripped)) if (v) keys.add(v);
    }
  }
  return [...keys].filter(Boolean);
}

/** 把抓到的分数按归一化名建索引，一个键可能对应多条（不同分榜、不同档位） */
export function indexArenaScores(scores: ArenaScore[]): Map<string, ArenaScore[]> {
  const index = new Map<string, ArenaScore[]>();
  for (const s of scores) {
    for (const k of s.keys) {
      const arr = index.get(k);
      if (arr) arr.push(s);
      else index.set(k, [s]);
    }
  }
  return index;
}

/**
 * 匹配。归一化名命中之后还要**厂商对得上**才算。
 *
 * 上游的 `organization` 是自由文本（`google`、`microsoft-ai`、`spacexai`，也有空串），
 * 跟站内厂商 id 不是一套词表，所以这里只把它当**否决条件**：两边都拿得到、
 * 归一化后互不包含，才判定为撞名丢弃；上游没给机构名时放行，靠名字本身收敛。
 * 反过来写成「必须相等才通过」会漏掉一大批，得不偿失。
 *
 * 竞技场里同名不同家的情况是真实存在的（`wan3.0` 挂 alibaba、`wan2.7-t2v` 挂 wan），
 * 所以这道否决不能省。
 */
export function lookupArenaScores(
  index: Map<string, ArenaScore[]>,
  vendorId: string,
  candidates: string[],
): ArenaScore[] {
  const picked = new Map<string, ArenaScore>();
  const vendorKey = alnum(vendorId);
  for (const key of candidates) {
    for (const s of index.get(key) ?? []) {
      if (
        s.organization &&
        vendorKey &&
        !s.organization.includes(vendorKey) &&
        !vendorKey.includes(s.organization)
      ) {
        continue;
      }
      // 同一个模型在一个分榜里可能匹配到多条（不同档位、不同分辨率），
      // 取投票数最多的那条：样本越大分数越稳。
      const cur = picked.get(s.league);
      if (!cur || s.voteCount > cur.voteCount) picked.set(s.league, s);
    }
  }
  return [...picked.values()];
}

async function fetchArena(config: string, league: string): Promise<ArenaScore[]> {
  const out: ArenaScore[] = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    if (offset > 0) await sleep(PAGE_DELAY_MS);
    const url = ENDPOINTS.lmarenaRows(config, offset, PAGE);
    const { data } = await fetchJson<RowsResponse>(url, { label: `lmarena/${config}@${offset}` });
    total = data.num_rows_total ?? 0;
    const rows = data.rows ?? [];
    if (rows.length === 0) break;

    for (const { row } of rows) {
      // 只取总榜。上游在同一个 config 里还塞了 coding / math 这类子分类，
      // 混进来会让同一个模型在同一个赛制里出现多条互相矛盾的分数。
      if (!row || row.category !== 'overall') continue;
      const name = row.model_name?.trim();
      const rating = row.rating;
      if (!name || typeof rating !== 'number' || !Number.isFinite(rating)) continue;

      const keys = arenaNameKeys(name);
      if (keys.length === 0) continue;

      out.push({
        league,
        keys,
        organization: alnum(row.organization ?? ''),
        score: Math.round(rating * 10) / 10,
        unit: 'elo',
        voteCount: typeof row.vote_count === 'number' ? row.vote_count : 0,
        rank: typeof row.rank === 'number' ? row.rank : 0,
        publishDate: row.leaderboard_publish_date ?? '',
        sourceUrl: DATASET_URL,
      });
    }
    offset += rows.length;
  }

  return out;
}

export async function fetchLmArena(): Promise<ArenaResult> {
  const scores: ArenaScore[] = [];
  const counts: Record<string, number> = {};
  const failed: string[] = [];

  for (const { config, league } of ARENAS) {
    if (scores.length > 0) await sleep(PAGE_DELAY_MS);
    try {
      const rows = await fetchArena(config, league);
      scores.push(...rows);
      counts[league] = rows.length;
    } catch (err) {
      // 单个分榜拿不到不该拖垮整轮同步，其余分榜照常落地
      failed.push(config);
      counts[league] = 0;
      log.warn(`lmarena：${config} 抓取失败，${errorMessage(err)}`);
    }
  }

  const ok = failed.length < ARENAS.length;
  const note = ok
    ? `${ARENAS.length - failed.length}/${ARENAS.length} 个分榜，共 ${scores.length} 条 Arena 分${failed.length ? `；失败 ${failed.join(' ')}` : ''}`
    : '全部分榜抓取失败';
  return { scores, counts, ok, note };
}
