/**
 * ⚠️ 仅供本地开发使用的样本数据。
 *
 * 真实数据由 `npx tsx scripts/sync/index.ts` 生成到 data/models.json。
 * 本文件的存在只是为了让「clone 下来还没跑管线」的人也能看到界面，
 * 以及让视觉迭代不必等待网络抓取。
 *
 * 生产构建时 src/lib/snapshot.ts 会在缺少 data/models.json 时**直接抛错**，
 * 因此这些样本永远不可能出现在线上——不允许一个以「展示真实状态」为使命的站点
 * 因为管线失败而静默地展示编造的数据。
 *
 * 这里选用的都是历史上确实存在过的模型，数值为量级近似，仅用于撑起视觉档位。
 */

import type { BenchmarkMeta, WorldSnapshot, ModelRecord, Modality } from './types';
import { VENDOR_REGISTRY, continentForCountry, profileFor } from '@/data/vendor-registry';

interface Seed {
  id: string;
  name: string;
  vendorId: string;
  releaseDate: string;
  ctx: number;
  maxOut: number;
  inP: number | null;
  outP: number | null;
  input: Modality[];
  output: Modality[];
  reasoning: boolean;
  tools: boolean;
  openWeights: boolean;
  totalB: number | null;
  eci: number | null;
  swe: number | null;
  aime: number | null;
  retired?: string;
}

const SEEDS: Seed[] = [
  // 西岸都会
  { id: 'openai/gpt-4o', name: 'GPT-4o', vendorId: 'openai', releaseDate: '2024-05-13', ctx: 128_000, maxOut: 16_384, inP: 2.5, outP: 10, input: ['text', 'image', 'audio'], output: ['text', 'audio'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 118, swe: 33, aime: 42 },
  { id: 'openai/o1', name: 'o1', vendorId: 'openai', releaseDate: '2024-12-05', ctx: 200_000, maxOut: 100_000, inP: 15, outP: 60, input: ['text', 'image'], output: ['text'], reasoning: true, tools: true, openWeights: false, totalB: null, eci: 141, swe: 49, aime: 83 },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', vendorId: 'openai', releaseDate: '2024-07-18', ctx: 128_000, maxOut: 16_384, inP: 0.15, outP: 0.6, input: ['text', 'image'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 92, swe: 15, aime: 21 },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', vendorId: 'anthropic', releaseDate: '2024-06-20', ctx: 200_000, maxOut: 8_192, inP: 3, outP: 15, input: ['text', 'image', 'pdf'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 128, swe: 49, aime: 38 },
  { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus', vendorId: 'anthropic', releaseDate: '2024-02-29', ctx: 200_000, maxOut: 4_096, inP: 15, outP: 75, input: ['text', 'image'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 104, swe: 22, aime: 12, retired: '2026-01-20' },
  { id: 'google/gemini-1-5-pro', name: 'Gemini 1.5 Pro', vendorId: 'google', releaseDate: '2024-02-15', ctx: 2_000_000, maxOut: 8_192, inP: 1.25, outP: 5, input: ['text', 'image', 'audio', 'video', 'pdf'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 112, swe: 25, aime: 30 },
  { id: 'meta/llama-3-1-405b', name: 'Llama 3.1 405B', vendorId: 'meta', releaseDate: '2024-07-23', ctx: 128_000, maxOut: 4_096, inP: 2.7, outP: 2.7, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 405, eci: 106, swe: 20, aime: 25 },
  { id: 'mistral/mistral-large', name: 'Mistral Large', vendorId: 'mistral', releaseDate: '2024-02-26', ctx: 128_000, maxOut: 4_096, inP: 2, outP: 6, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 98, swe: 14, aime: 18 },
  { id: 'xai/grok-2', name: 'Grok 2', vendorId: 'xai', releaseDate: '2024-08-13', ctx: 131_072, maxOut: 8_192, inP: 2, outP: 10, input: ['text', 'image'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 109, swe: 18, aime: 28 },
  { id: 'allenai/olmo-2-13b', name: 'OLMo 2 13B', vendorId: 'allenai', releaseDate: '2024-11-26', ctx: 4_096, maxOut: 2_048, inP: null, outP: null, input: ['text'], output: ['text'], reasoning: false, tools: false, openWeights: true, totalB: 13, eci: 61, swe: null, aime: null },

  // 东方城邦
  { id: 'deepseek/deepseek-v3', name: 'DeepSeek V3', vendorId: 'deepseek', releaseDate: '2024-12-26', ctx: 128_000, maxOut: 8_192, inP: 0.27, outP: 1.1, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 671, eci: 121, swe: 42, aime: 39 },
  { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', vendorId: 'deepseek', releaseDate: '2025-01-20', ctx: 128_000, maxOut: 32_768, inP: 0.55, outP: 2.19, input: ['text'], output: ['text'], reasoning: true, tools: true, openWeights: true, totalB: 671, eci: 138, swe: 49, aime: 79 },
  { id: 'alibaba/qwen2-5-72b', name: 'Qwen2.5 72B', vendorId: 'alibaba', releaseDate: '2024-09-19', ctx: 131_072, maxOut: 8_192, inP: 0.35, outP: 0.4, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 72, eci: 103, swe: 21, aime: 26 },
  { id: 'moonshotai/kimi-k2', name: 'Kimi K2', vendorId: 'moonshotai', releaseDate: '2025-07-11', ctx: 128_000, maxOut: 16_384, inP: 0.6, outP: 2.5, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 1000, eci: 126, swe: 47, aime: 45 },
  { id: 'z-ai/glm-4-plus', name: 'GLM-4 Plus', vendorId: 'z-ai', releaseDate: '2024-08-29', ctx: 128_000, maxOut: 4_096, inP: 7, outP: 7, input: ['text', 'image'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 95, swe: 12, aime: 20 },
  { id: 'minimax/minimax-text-01', name: 'MiniMax Text 01', vendorId: 'minimax', releaseDate: '2025-01-15', ctx: 1_000_000, maxOut: 8_192, inP: 0.2, outP: 1.1, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 456, eci: 99, swe: 11, aime: 17 },
  { id: 'bytedance/doubao-pro', name: 'Doubao Pro', vendorId: 'bytedance', releaseDate: '2025-01-08', ctx: 256_000, maxOut: 8_192, inP: 0.11, outP: 0.28, input: ['text', 'image'], output: ['text'], reasoning: false, tools: true, openWeights: false, totalB: null, eci: 101, swe: 16, aime: 24 },
  { id: 'tencent/hunyuan-large', name: 'Hunyuan Large', vendorId: 'tencent', releaseDate: '2024-11-05', ctx: 256_000, maxOut: 8_192, inP: 0.5, outP: 2, input: ['text'], output: ['text'], reasoning: false, tools: true, openWeights: true, totalB: 389, eci: 88, swe: 9, aime: 14 },
];

/** Epoch 公开估算过的量级（FLOP），仅用于本地预览训练算力的展示。 */
const SAMPLE_TRAINING_COMPUTE: Record<string, number> = {
  'meta/llama-3-1-405b': 3.8e25,
  'deepseek/deepseek-v3': 3.4e24,
};

function toRecord(s: Seed): ModelRecord {
  // scores[] 是 coding[] 与 benchmarks.* 的超集：一个榜单一条。样本只给 ECI / SWE / AIME 三项，
  // 缺哪项就不放哪条（不用 0 填），与管线的产出形状一致。
  const scores: ModelRecord['scores'] = [];
  if (s.eci != null) {
    scores.push({ league: 'eci', score: s.eci, unit: 'index', attribution: 'third-party', source: 'epoch.ai', sourceUrl: null });
  }
  if (s.swe != null) {
    scores.push({ league: 'swe_bench_verified', score: s.swe, unit: 'pct', attribution: 'third-party', source: 'epoch.ai', sourceUrl: null });
  }
  if (s.aime != null) {
    scores.push({ league: 'aime', score: s.aime, unit: 'pct', attribution: 'third-party', source: 'epoch.ai', sourceUrl: null });
  }
  return {
    id: s.id,
    slug: s.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
    name: s.name,
    vendorId: s.vendorId,
    releaseDate: s.releaseDate,
    releaseDatePrecision: 'day',
    knowledgeCutoff: null,
    retiredAt: s.retired ?? null,
    contextWindow: s.ctx,
    maxOutput: s.maxOut,
    pricing: { inputPerMTok: s.inP, outputPerMTok: s.outP, cachedInputPerMTok: null },
    modalities: { input: s.input, output: s.output },
    capabilities: {
      toolCall: s.tools,
      reasoning: s.reasoning,
      structuredOutput: s.tools,
      promptCaching: null,
    },
    openWeights: s.openWeights,
    license: s.openWeights ? 'Apache-2.0' : null,
    params: {
      totalB: s.totalB,
      activeB: null,
      confidence: s.totalB != null ? 'exact' : 'estimated',
    },
    benchmarks: {
      eci: s.eci,
      swe_bench_verified: s.swe,
      swe_bench_vendor: null,
      swe_bench_pro: null,
      aime: s.aime,
      gpqa_diamond: null,
      arc_agi_2: null,
      fiction_live: null,
      webdev_arena_elo: null,
    },
    coding:
      s.swe == null
        ? []
        : [
            {
              league: 'swe_bench_verified',
              score: s.swe,
              unit: 'pct',
              attribution: 'third-party',
              source: 'epoch.ai',
              sourceUrl: null,
            },
          ],
    scores,
    // 训练算力只给两条 Epoch 公开过量级的样本，其余 null——样本数据也不拿估算值填空。
    trainingComputeFlop: SAMPLE_TRAINING_COMPUTE[s.id] ?? null,
    provenance: { releaseDate: 'models.dev', pricing: 'models.dev', benchmarks: 'epoch.ai' },
    firstSeenAt: s.releaseDate,
  };
}

const SAMPLE_MODELS = SEEDS.map(toRecord);

/** 与 scores[] 里出现的三个榜单一一对应；models 字段按样本实际命中数算，不写死。 */
const SAMPLE_BENCHMARKS: BenchmarkMeta[] = (
  [
  {
    id: 'eci',
    sourceFile: 'epoch_capabilities_index.csv',
    scoreColumn: 'ECI Score',
    unit: 'index',
    randomBaseline: null,
    scoreCeiling: null,
    releaseDate: null,
    supersededBy: null,
    inEci: false,
    models: 0,
  },
  {
    id: 'swe_bench_verified',
    sourceFile: 'swe_bench_verified.csv',
    scoreColumn: 'mean_score',
    unit: 'pct',
    randomBaseline: 0,
    scoreCeiling: 100,
    releaseDate: '2024-08-13',
    supersededBy: null,
    inEci: true,
    models: 0,
  },
  {
    id: 'aime',
    sourceFile: 'otis_mock_aime_2024_2025.csv',
    scoreColumn: 'mean_score',
    unit: 'pct',
    randomBaseline: 0.1,
    scoreCeiling: 100,
    releaseDate: '2024-12-19',
    supersededBy: null,
    inEci: true,
    models: 0,
  },
  ] satisfies BenchmarkMeta[]
).map((b) => ({
  ...b,
  models: SAMPLE_MODELS.filter((m) => (m.scores ?? []).some((s) => s.league === b.id)).length,
}));

export const SAMPLE_SNAPSHOT: WorldSnapshot = {
  generatedAt: '2026-01-01T00:00:00.000Z',
  sources: {
    'models.dev': { ok: true, fetchedAt: null, note: '样本数据' },
    'epoch.ai': { ok: true, fetchedAt: null, note: '样本数据' },
    huggingface: { ok: false, fetchedAt: null, note: '样本数据' },
    openrouter: { ok: false, fetchedAt: null, note: '样本数据' },
    'vercel-gateway': { ok: false, fetchedAt: null, note: '样本数据' },
    litellm: { ok: false, fetchedAt: null, note: '样本数据' },
    livebench: { ok: false, fetchedAt: null, note: '样本数据' },
    lmarena: { ok: false, fetchedAt: null, note: '样本数据' },
    derived: { ok: true, fetchedAt: null, note: '样本数据' },
    override: { ok: true, fetchedAt: null, note: '样本数据' },
  },
  vendors: Array.from(new Set(SEEDS.map((s) => s.vendorId))).map((id) => {
    const p = profileFor(id);
    return {
      id,
      name: VENDOR_REGISTRY[id] ? id : id,
      nameZh: p.nameZh,
      country: p.country,
      continent: continentForCountry(p.country),
      motif: p.motif,
      accentColor: p.accentColor,
      homepage: p.homepage,
    };
  }),
  models: SAMPLE_MODELS,
  benchmarks: SAMPLE_BENCHMARKS,
};
