/**
 * 跨源合并的连接键。
 *
 * 同一个模型在各源里的命名空间完全不同：
 *   models.dev      alibaba/qwen3.8-flash      （创作者/模型）
 *   OpenRouter      qwen/qwen3.8-flash         （命名空间是品牌）
 *   Vercel Gateway  alibaba/qwen-3-14b         （连字符位置不同）
 *   Epoch AI        Organization="Alibaba" + Model version="qwen3.7-max"
 * 所以要先把厂商归一，再把型号里的分隔符全部抹平，才能对齐。
 */

/** 各源的厂商命名空间 → 规范 vendorId（以 models.dev 的创作者前缀为准）。 */
const VENDOR_ALIASES: Record<string, string> = {
  qwen: 'alibaba',
  'alibaba-cloud': 'alibaba',
  alibabacloud: 'alibaba',
  tongyi: 'alibaba',
  'z-ai': 'zhipuai',
  zai: 'zhipuai',
  'zai-org': 'zhipuai',
  zhipu: 'zhipuai',
  'zhipu-ai': 'zhipuai',
  glm: 'zhipuai',
  mistralai: 'mistral',
  'mistral-ai': 'mistral',
  'meta-llama': 'meta',
  'meta-ai': 'meta',
  'meta-models': 'meta',
  llama: 'meta',
  'x-ai': 'xai',
  spacexai: 'xai',
  grok: 'xai',
  bytedance: 'bytedance-seed',
  'bytedance-research': 'bytedance-seed',
  seed: 'bytedance-seed',
  'ibm-granite': 'ibm',
  moonshot: 'moonshotai',
  'moonshot-ai': 'moonshotai',
  'deepseek-ai': 'deepseek',
  minimaxai: 'minimax',
  'minimax-ai': 'minimax',
  'stepfun-ai': 'stepfun',
  'thinking-machines': 'thinkingmachines',
  'thinking-machines-lab': 'thinkingmachines',
  sarvamai: 'sarvam',
  'sarvam-ai': 'sarvam',
  reka: 'rekaai',
  arcee: 'arcee-ai',
  arceeai: 'arcee-ai',
  kuaishou: 'kwaipilot',
  sakanaai: 'sakana',
  'sakana-ai': 'sakana',
  longcat: 'meituan',
  hunyuan: 'tencent',
  'tencent-hunyuan': 'tencent',
  'deepreinforce-ai': 'deepreinforce',
  'ornith-ai': 'deepreinforce',
  'inclusion-ai': 'inclusionai',
  'ai-singapore': 'aisingapore',
  'swissai': 'swiss-ai',
  '01-ai': '01ai',
  aws: 'amazon',
  bedrock: 'amazon',
  azure: 'microsoft',
  'microsoft-research': 'microsoft',
  google_vertex: 'google',
  'google-vertex': 'google',
  googleai: 'google',
  gemini: 'google',
  gemma: 'google',
};

/** Epoch AI 的 Organization 字段 → 规范 vendorId。 */
const EPOCH_ORG_ALIASES: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  'google deepmind': 'google',
  google: 'google',
  'google deepmind,google': 'google',
  'google,google deepmind': 'google',
  alibaba: 'alibaba',
  deepseek: 'deepseek',
  'meta ai': 'meta',
  meta: 'meta',
  xai: 'xai',
  'x.ai': 'xai',
  'mistral ai': 'mistral',
  moonshot: 'moonshotai',
  'moonshot ai': 'moonshotai',
  'z.ai (zhipu ai)': 'zhipuai',
  'z.ai (zhipu ai),tsinghua university': 'zhipuai',
  'zhipu ai': 'zhipuai',
  microsoft: 'microsoft',
  'microsoft research': 'microsoft',
  'thinking machines': 'thinkingmachines',
  nvidia: 'nvidia',
  tencent: 'tencent',
  minimax: 'minimax',
  bytedance: 'bytedance-seed',
  'bytedance seed': 'bytedance-seed',
  baidu: 'baidu',
  xiaomi: 'xiaomi',
  stepfun: 'stepfun',
  upstage: 'upstage',
  cohere: 'cohere',
  ibm: 'ibm',
  amazon: 'amazon',
  meituan: 'meituan',
  perplexity: 'perplexity',
  inclusionai: 'inclusionai',
  'ai singapore': 'aisingapore',
  'sakana ai': 'sakana',
  '01.ai': '01ai',
  'reka ai': 'rekaai',
  'arcee ai': 'arcee-ai',
  'lg ai research': 'lg-ai',
  'technology innovation institute': 'tii',
  'allen institute for ai': 'allenai',
  'nous research': 'nousresearch',
  'kuaishou technology': 'kwaipilot',
  kwaipilot: 'kwaipilot',
  'swiss ai initiative': 'swiss-ai',
  'sarvam ai': 'sarvam',
  poolside: 'poolside',
  'deep reinforce': 'deepreinforce',
  'trendyol': 'trendyol',
  sdaia: 'sdaia',
};

/** 这些命名空间不是真正的模型创作者，只是路由/托管别名，不参与发现。 */
export const NON_CREATOR_NAMESPACES = new Set(['openrouter', 'unknown', 'auto', 'router']);

/** vendorId → 这个厂商在各源里用过的所有别名，用于反查外部注册表的键。 */
export function vendorAliasesFor(vendorId: string): string[] {
  const out = new Set<string>([vendorId]);
  for (const [alias, target] of Object.entries(VENDOR_ALIASES)) {
    if (target === vendorId) out.add(alias);
  }
  out.add(vendorId.replace(/-/g, ''));
  out.add(vendorId.replace(/([a-z])(ai)$/, '$1-$2'));
  return [...out];
}

export function canonicalVendorId(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/^~+/, '').replace(/\s+/g, '-');
  return VENDOR_ALIASES[v] ?? v;
}

export function vendorFromEpochOrg(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (EPOCH_ORG_ALIASES[key]) return EPOCH_ORG_ALIASES[key];
  // 逗号分隔的联合署名取第一个已知的
  for (const part of key.split(',')) {
    const hit = EPOCH_ORG_ALIASES[part.trim()];
    if (hit) return hit;
  }
  return null;
}

export interface CanonicalId {
  id: string;
  vendorId: string;
  modelSlug: string;
  /** 被剥掉的变体后缀，例如 OpenRouter 的 :free / :batch */
  variant: string | null;
}

/**
 * 把任意源的模型 id 归一成 `vendorId/model-slug`。
 * `~` 前缀（OpenRouter 的动态别名）与 `:free`/`:batch` 变体都会被剥掉。
 */
export function canonicalizeId(rawId: string, fallbackVendor?: string): CanonicalId | null {
  let raw = rawId.trim();
  if (!raw) return null;
  const dynamic = raw.startsWith('~');
  raw = raw.replace(/^~+/, '');

  let variant: string | null = dynamic ? 'alias' : null;
  const colon = raw.indexOf(':');
  if (colon >= 0) {
    variant = raw.slice(colon + 1) || variant;
    raw = raw.slice(0, colon);
  }

  let vendorRaw: string;
  let modelSlug: string;
  const slash = raw.indexOf('/');
  if (slash > 0) {
    vendorRaw = raw.slice(0, slash);
    modelSlug = raw.slice(slash + 1);
  } else if (fallbackVendor) {
    vendorRaw = fallbackVendor;
    modelSlug = raw;
  } else {
    return null;
  }
  modelSlug = modelSlug.trim().toLowerCase();
  if (!modelSlug) return null;
  const vendorId = canonicalVendorId(vendorRaw);
  return { id: `${vendorId}/${modelSlug}`, vendorId, modelSlug, variant };
}

export function alnum(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const TRAILING_DATE = [
  /-\d{8}$/, // -20240229
  /-\d{4}-\d{2}-\d{2}$/, // -2024-02-29
  /-\d{2}-\d{2}$/, // -02-29
  /-\d{4}$/, // -0709 / -2507
];
const TRAILING_TAG =
  /-(preview|pre-release|prerelease|exp|experimental|beta|alpha|latest|it|instruct|chat|hf|fp8|bf16|awq|gptq|int4|int8|nonthinking|non-thinking|thinking|reasoning|v\d+(\.\d+)?)$/;

/**
 * 为一个型号生成一串由精确到宽松的匹配候选。
 * Epoch 的 `Model version` 常带日期戳（claude-3-opus-20240229）或后缀（Llama-4-Scout-17B-16E-Instruct），
 * 逐级剥离才能对上 models.dev 的 `claude-3-opus`。
 */
export function slugVariants(slug: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const a = alnum(s);
    if (a && !out.includes(a)) out.push(a);
  };
  // 展示名用空格分词（"Grok 4.3 Beta"），型号用连字符（grok-4.3-beta）。
  // 先统一成连字符，下面按 `-beta$` 剥后缀的规则才对两种写法都生效；
  // 不统一的话 "Grok 4.3 Beta" 剥不出 grok43，它的 ECI 就挂不到我们的 grok-4.3 上。
  let s = slug.trim().toLowerCase().replace(/[\s_]+/g, '-');
  push(s);
  for (let i = 0; i < 5; i += 1) {
    let changed = false;
    for (const re of TRAILING_DATE) {
      const n = s.replace(re, '');
      if (n !== s && n.length > 2) {
        s = n;
        push(s);
        changed = true;
      }
    }
    const n = s.replace(TRAILING_TAG, '');
    if (n !== s && n.length > 2) {
      s = n;
      push(s);
      changed = true;
    }
    if (!changed) break;
  }
  return out;
}

/**
 * 型号结尾的参数量 token：`-235b` / `-a22b` / `-550b-a55b` / `-2.4t` / `-16e`。
 * 分隔符要同时认连字符和空格——slug 写作 `nemotron-3-ultra-550b-a55b`，
 * 而展示名写作 `Nemotron 3 Ultra 550B A55B`，两边都要能剥。
 */
const PARAM_TAIL =
  /[-_\s](\d+(\.\d+)?[bmt]([-_\s]?a\d+(\.\d+)?[bmt])?|a\d+(\.\d+)?[bmt]|\d+e)$/i;

/**
 * 名字里任意位置带参数量标记。
 *
 * 用途只有一个：判断**上游那边**的标识自己有没有带规模，
 * 从而决定能不能对我们这边的型号做「去参数量」的兜底匹配。见 paramStrippedVariants 的说明。
 *
 * 右边界必须是非字母数字或行尾，否则 "Grok 3 mini" 里的 "3 m" 会被当成 3 百万参数。
 */
const PARAM_TOKEN = /(^|[^a-z0-9])a?\d+(\.\d+)?\s?[bmt]([^a-z0-9]|$)/i;

export function hasParamToken(label: string): boolean {
  return PARAM_TOKEN.test(label.trim());
}

/**
 * 把型号结尾的参数量也剥掉，产出一串更宽松的候选。
 *
 * 存在的理由：Epoch 常用营销名（"Nemotron 3 Ultra"），而 models.dev 用带权重的完整 slug
 * （`nemotron-3-ultra-550b-a55b`），现有的后缀阶梯剥不掉 `-550b-a55b`，于是这个模型
 * 明明在 Epoch 上有 ECI / AIME / GPQA 三项成绩，在站上却显示未参赛。
 *
 * **这是一个危险的操作，必须配合两道守卫使用，缺一不可。**
 * 不带守卫直接放进匹配阶梯，实测是 1 对 2 错——
 *   对：`Nemotron 3 Ultra`          → nvidia/nemotron-3-ultra-550b-a55b
 *   错：`Llama 3.1-405B`            → meta/llama-3.1-70b        （405B 的分挂到 70B 头上）
 *   错：`Qwen2.5-Coder (1.5B)`      → alibaba/qwen2.5-coder-0.5b（1.5B 的分挂到 0.5B 头上）
 * 净效果是负的，正好是 docs/HANDOFF.md 反复警告的「把 gpt-4-turbo 的成绩挂到 gpt-4 头上」。
 *
 * 两道守卫：
 *   1. 上游标识自己带规模标记的（405B、1.5B），一律不许走这条兜底——
 *      它已经指名了规模，匹配到别的规模必然是错的。见 fetchEpoch 里的 `unsized` 索引。
 *   2. 去掉参数量后有多个自家模型撞在同一个键上的（`meta|llama31` 同时对应 70B 和 8B），
 *      整个键作废。见 merge/build.ts 的 ambiguous 集合。
 * 加上守卫后实测净增 1 个模型、0 个错配。
 */
export function paramStrippedVariants(slug: string): string[] {
  const out: string[] = [];
  let s = slug.trim().toLowerCase();
  const push = (x: string) => {
    const a = alnum(x);
    if (a && !out.includes(a)) out.push(a);
  };
  for (let i = 0; i < 6; i += 1) {
    let changed = false;
    // 先剥常规后缀与日期戳，`gemma-3-27b-it` 得先去掉 `-it` 才轮得到 `-27b`。
    for (const re of TRAILING_DATE) {
      const n = s.replace(re, '');
      if (n !== s && n.length > 2) {
        s = n;
        changed = true;
      }
    }
    const tagged = s.replace(TRAILING_TAG, '');
    if (tagged !== s && tagged.length > 2) {
      s = tagged;
      changed = true;
    }
    const sized = s.replace(PARAM_TAIL, '');
    if (sized !== s && sized.length > 2) {
      s = sized;
      changed = true;
      push(s);
    }
    if (!changed) break;
  }
  return out;
}

/** Epoch 的 reasoning-effort 后缀用下划线分隔（glm-5.2_max），而 `qwen3.7-max` 的 max 是型号的一部分。 */
const EFFORT_SUFFIX =
  /_(max|xhigh|high|medium|low|none|minimal|unknown|promax|pro|thinking|think|nothinking|default|standard|verylow|xlow|reasoning|adaptive|auto|fast|flex|priority|scale|batch|\d+k)$/i;

export function stripEffortSuffix(modelVersion: string): string {
  let s = modelVersion.trim();
  for (let i = 0; i < 5; i += 1) {
    const n = s.replace(EFFORT_SUFFIX, '');
    if (n === s) break;
    s = n;
  }
  return s;
}

/** "GPT-5.6 Sol (Max)" → "GPT-5.6 Sol" */
export function stripParenthetical(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * 模型 id → 页面 slug。
 *
 * **点号必须转成连字符，不能保留。** Next 的 `trailingSlash: true` 在末段含点时
 * 会把它当成文件名而不补斜杠，于是 `qwen-2.5-72b` 这类模型的链接变成
 * `/model/alibaba-qwen-2.5-72b-instruct`（无斜杠），而导出的文件却在
 * `model/alibaba-qwen-2.5-72b-instruct/index.html`（是个目录）。
 *
 * 本地 Python 服务器和 Vercel 都会做 `/x` → `/x/` 的重定向，所以这个坑藏得很深；
 * 换成不做重定向的对象存储（B 站 Toy、部分 CDN 静态托管）就是实打实的 404。
 * 实测全站 556 个模型里有 215 个（39%）的 slug 带点，等于近四成详情页打不开。
 *
 * 转换后逐个核对过，零碰撞。
 */
export function toSlug(id: string): string {
  return id.replace(/\//g, '-').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
}

/** 从 id 反推一个像样的展示名，用于上游没给名字（或不该用上游名字）的情况。 */
export function displayNameFromSlug(modelSlug: string): string {
  return modelSlug
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => {
      if (/^\d/.test(part)) return part.toUpperCase();
      if (part.length <= 3) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}
