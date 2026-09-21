/**
 * Artificial Analysis 合规过滤器。集中放在这里，因为它现在有三个入口。
 *
 * AA 的免费层与 Pro 层都明确禁止再分发原始数据文件，只有 Commercial 套餐才有再分发权。
 * 「数据是从别人那里拿的」不构成豁免——经由第三方间接展示 AA 的数据，实质仍是再分发。
 *
 * 两个已知的渗入路径：
 *   1. OpenRouter /api/v1/models 的 `benchmarks.artificial_analysis` 子字段
 *      （intelligence_index / coding_index / agentic_index）。
 *   2. **models.dev 的 `benchmarks[]`**：656 条里有 70 条的 `source` 指向
 *      artificialanalysis.ai，而且其中大部分**名字是中性的**
 *      （"SWE-Bench Pro"、"Terminal-Bench"、"SWE-Atlas Codebase QnA"），
 *      光看 name 根本认不出来。所以必须同时按名字和来源 URL 两条线拦。
 *
 *   3. **OpenRouter 的「benchmarks」页**：见下面 BLOCKED_SOURCE_HOSTS 的实测证据。
 *   4. **Epoch AI 的 benchmark zip**：见下面 classifyEpochFile 的说明。
 *      Epoch 自己是 CC-BY 4.0 的干净源，但它的 `*_external.csv` 是**转载别人的榜单**，
 *      转载谁就带着谁的条款——其中 `scicode_external.csv` 转的正是 AA。
 *
 * 不要放宽这些判定，也不要因为「这条看起来是中性榜单」就开口子。
 */

/**
 * 来源域名命中即拦截，不看这条记录叫什么名字。
 *
 * `openrouter.ai` 是 2026-09 实测确认的**第三跳**，证据有四条，缺一条都不足以定案：
 *
 *   1. models.dev 上所有 `source` 指向 openrouter.ai 的成绩，URL 形态清一色是
 *      `https://openrouter.ai/<vendor>/<model>/benchmarks`——OpenRouter 的「Benchmarks」标签页，
 *      而那一页的数据由 Artificial Analysis 供给（同一条渗入路径的另一个出口，
 *      正是 /api/v1/models 里被我们剔掉的 `benchmarks.artificial_analysis`）。
 *   2. 这个域名上**只出现 3 个榜单名**：`SciCode`、`Terminal-Bench Hard`、
 *      以及字面就叫 `Artificial Analysis Coding Index` 的那一个。
 *      第三个已经被下面的名字规则拦掉了——三个里有一个自己承认了身份。
 *   3. 29 个带 openrouter.ai 成绩的模型里，22 个的三项**完全捆绑同时出现**
 *      （coding index + scicode + terminal bench hard），剩下 7 个是这三项的子集。
 *      它们是一个整体被搬运的，不是三次独立测评。
 *   4. SciCode 与 Terminal-Bench Hard 都是 Artificial Analysis Intelligence Index 的**成分榜**。
 *      拿走指数、留下成分，仍然是再分发 AA 的测量结果。
 *
 * 结论：**openrouter.ai 上的成绩一律按 AA 处理。** 代价是 `terminal_bench_hard`
 * 这个赛制当前 22 条数据全部被拦掉、落地 0 条（见 sources/models-dev.ts 的赛制表），
 * 而 `scicode` 剩下 3 条——它另有口径上的问题，在那边一并排除。
 *
 * 注意这条只约束**评测成绩的来源**。OpenRouter 作为新模型发现源、
 * 以及 `vendors[].homepage` 里可能出现的 openrouter.ai 都不受影响，
 * 所以写盘前的兜底扫描按字段路径判断（见 findBlockedBenchmarkSources），
 * 不是在整棵树里搜字符串——后者会把厂商主页误判成泄漏。
 */
const BLOCKED_SOURCE_HOSTS = ['artificialanalysis.ai', 'openrouter.ai'];

/** 名字里带这些标记的，即便来源是厂商官网也拦掉——它转载的仍是 AA 的指数。 */
const BLOCKED_NAME_PATTERNS = [
  /artificial\s*analysis/i,
  /\baa\b/i,
  /(^|[^a-z])aa[-_ ]/i,
  /[-_ ]aa($|[^a-z])/i,
];

export function isArtificialAnalysisSourced(
  name: string | null | undefined,
  sourceUrl: string | null | undefined,
): boolean {
  const url = (sourceUrl ?? '').toLowerCase();
  if (BLOCKED_SOURCE_HOSTS.some((host) => url.includes(host))) return true;
  const n = (name ?? '').trim();
  if (!n) return false;
  return BLOCKED_NAME_PATTERNS.some((re) => re.test(n));
}

/**
 * 递归删除任意 JSON 里的 artificial_analysis 子对象。
 * 用于 OpenRouter 的响应体——连落盘的原始快照里也不保留，从物理上杜绝后人接回展示层。
 */
export function stripArtificialAnalysis(payload: unknown): { data: unknown; stripped: number } {
  let stripped = 0;
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const src = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(src)) {
        if (k === 'artificial_analysis' || k === 'artificialAnalysis') {
          stripped += 1;
          continue;
        }
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };
  return { data: walk(payload), stripped };
}

/**
 * LMArena 家族的域名。与 AA 分开列，因为**两者的处置不同**——见 EPOCH_LMARENA_EXEMPT_FILES。
 * AA 是「任何路径、任何形式都不许用」；LMArena 是「不许我们自己去抓」。
 */
const LMARENA_SOURCE_HOSTS = ['lmarena.ai', 'arena.ai', 'lmsys.org', 'chat.lmsys.org'];

/**
 * Epoch zip 里按文件名直接拉黑的。
 *
 * `scicode_external.csv`：129 行的 `Source` 列指向 `https://artificialanalysis.ai/evaluations/scicode`，
 * 而且它有一列**直接叫 `AA model slug`**。这是 Epoch 转载 AA 的榜单，
 * Epoch 自己的 CC-BY 授权覆盖不了它转载的内容。
 *
 * 光靠下面的列级扫描其实也能拦住它，但仍然显式列在这里：
 * 列级扫描依赖上游继续填 `Source` 列，而这一条是已经查实的结论，不该依赖上游的好习惯。
 * 两道一起上，任意一道失效都还有另一道。
 */
const EPOCH_BLOCKED_FILES = ['scicode_external.csv'];

/**
 * **只对 LMArena 规则**豁免的 Epoch 文件。AA 规则永不豁免。
 *
 * `webdev_arena_external.csv` 的上游是 LMArena（`Source link` 列 121 处指向
 * `https://web.lmarena.ai/leaderboard`，`Source` 列 104 处指向 `arena.ai`）。
 * 它当前已经接进管线（`benchmarks.webdev_arena_elo`，85 个模型）。
 *
 * **这不是漏洞，是 docs/HANDOFF.md 4.2 记录的一个刻意决定**：
 * 原文是「绝不抓取 LMArena……替代品是 Epoch 收录的 WebDev Arena Elo」。
 * 也就是说我们的合规依据是「消费 Epoch 在 CC-BY 4.0 下的再分发」，
 * 而不是「我们自己去 LMArena 抓」——后者才是 LMArena ToS 明文禁止的行为。
 * LMArena 的 ToS 约束的是抓取方；Epoch 已经完成了收录并以 CC-BY 重新发布，
 * 我们对 Epoch 这一份的使用受 CC-BY 约束（署名即可）。
 *
 * 这个立场是否继续，项目负责人正在确认中。**在拿到结论前不要删除这一条豁免、
 * 也不要撤掉 webdev_arena 的接入**——它看起来像个合规漏洞，其实是有据可查的决定。
 * 若结论是撤掉，需要动的是：这里的豁免、epoch.ts 的 BENCHMARKS、
 * 以及 build.ts 里 webdev_arena_elo 进 coding[] 的那一段。
 */
const EPOCH_LMARENA_EXEMPT_FILES = ['webdev_arena_external.csv'];

export interface EpochFileVerdict {
  blocked: boolean;
  /** 命中的域名，用于日志与同步报告 */
  hosts: string[];
  reason: string | null;
}

/**
 * 判断 Epoch zip 里的某个 CSV 能不能解析。**文件名 + 内容里的来源域名双线**。
 *
 * 列级扫描刻意不去精确定位「哪一列是来源列」——上游的列名在
 * `Source` / `Source link` / `Source Link` / `Source link (site from table)` 之间来回变，
 * 写死列名等于给自己埋一个静默失效。直接在整份 CSV 文本里找域名，
 * 宁可多拦不可漏拦；代价是万一某个干净榜单的 Notes 里提了一句 AA 就会被整份丢掉，
 * 而那种情况丢掉也不冤。
 *
 * 这样将来 Epoch 新增 AA 来源的 CSV 会被**自动拦住**，不需要有人来维护黑名单。
 */
export function classifyEpochFile(fileName: string, csvText: string): EpochFileVerdict {
  const base = (fileName.split('/').pop() ?? fileName).toLowerCase();
  if (EPOCH_BLOCKED_FILES.includes(base)) {
    return { blocked: true, hosts: ['artificialanalysis.ai'], reason: '文件级黑名单：Epoch 转载的 AA 榜单' };
  }
  const text = csvText.toLowerCase();
  const aa = BLOCKED_SOURCE_HOSTS.filter((h) => text.includes(h));
  if (aa.length > 0) {
    return { blocked: true, hosts: aa, reason: `来源列指向 Artificial Analysis 血缘域名（${aa.join(', ')}）` };
  }
  const arena = LMARENA_SOURCE_HOSTS.filter((h) => text.includes(h));
  if (arena.length > 0) {
    if (EPOCH_LMARENA_EXEMPT_FILES.includes(base)) {
      return {
        blocked: false,
        hosts: arena,
        reason: `上游是 LMArena，按 HANDOFF 4.2 的既有决定消费 Epoch 的 CC-BY 再分发（${arena.join(', ')}）`,
      };
    }
    return { blocked: true, hosts: arena, reason: `来源列指向 LMArena 血缘域名（${arena.join(', ')}）` };
  }
  return { blocked: false, hosts: [], reason: null };
}

/**
 * 写盘前针对**评测成绩来源**的兜底扫描。
 *
 * 与 findArtificialAnalysisLeaks 的分工：那一个在整棵树里搜字符串，抓的是
 * `artificialanalysis.ai` 与 AA 的指数字段名；这一个只看 `coding[]` 每一条的来源域名，
 * 因此可以把 `openrouter.ai` 也纳入判据而不会误伤 `vendors[].homepage`
 * ——openrouter 是 models.dev api.json 里的一个正常 provider，它的主页出现在快照里是合法的。
 */
export function findBlockedBenchmarkSources(
  models: Array<{
    id: string;
    coding?: Array<{ league: string; sourceUrl: string | null }>;
    scores?: Array<{ league: string; sourceUrl: string | null }>;
  }>,
): string[] {
  const hits: string[] = [];
  // coding[] / scores[] 里不该出现任何 LMArena 链接：WebDev Arena 那一条的署名指向 epoch.ai
  // （我们消费的是 Epoch 的再分发，署名就该给 Epoch），不指向 lmarena。
  const banned = [...BLOCKED_SOURCE_HOSTS, ...LMARENA_SOURCE_HOSTS];
  for (const m of models) {
    for (const [field, list] of [
      ['coding', m.coding ?? []],
      ['scores', m.scores ?? []],
    ] as const) {
      for (const score of list) {
        const url = (score.sourceUrl ?? '').toLowerCase();
        if (!url) continue;
        const host = banned.find((h) => url.includes(h));
        if (host) hits.push(`${m.id} 的 ${field}[${score.league}] 来源是 ${host}`);
      }
    }
  }
  return hits;
}

/** 写盘前的最后一道保险：整棵树里不该再出现任何 AA 痕迹。 */
export function findArtificialAnalysisLeaks(payload: unknown): string[] {
  const hits: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (/artificial_?analysis|intelligence_index|coding_index|agentic_index/i.test(k)) {
          hits.push(`${path}.${k}`);
        }
        walk(v, `${path}.${k}`);
      }
      return;
    }
    if (typeof node === 'string' && /artificialanalysis\.ai/i.test(node)) {
      hits.push(`${path} = ${node}`);
    }
  };
  walk(payload, '$');
  return hits;
}
