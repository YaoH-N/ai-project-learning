import { ENDPOINTS } from '../config';
import { perTokenToPerMTok, sanitizePrice } from '../lib/decimal';
import { alnum, canonicalVendorId } from '../lib/ids';
import { fetchJson } from '../lib/http';
import { errorMessage, log } from '../lib/log';
import { normalizeGatewayModalities, positiveIntOrNull } from './openrouter';
import type { LiteLlmEntry, LiteLlmResult } from './types';

interface RawLiteLlmEntry {
  mode?: string;
  litellm_provider?: string;
  /** 每 token 的美元，number 或 "5E-7" 这类科学计数法字符串 */
  input_cost_per_token?: number | string;
  output_cost_per_token?: number | string;
  cache_read_input_token_cost?: number | string;
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  supported_modalities?: string[];
  supported_output_modalities?: string[];
  supports_vision?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  supports_pdf_input?: boolean;
  supports_video_input?: boolean;
  [k: string]: unknown;
}

const CHAT_MODES = new Set(['chat', 'completion', 'responses']);

/**
 * `litellm_provider` 里**创作者自己就是 provider** 的那些，归一到规范 vendorId。
 * 托管商（bedrock / azure / fireworks_ai / together_ai / deepinfra……）不在表里，条目记 null：
 * 同一个 Llama 在五家托管商下五个价，谁都不是「这个模型的价」。
 */
const FIRST_PARTY_PROVIDERS: Record<string, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'google',
  xai: 'xai',
  mistral: 'mistral',
  deepseek: 'deepseek',
  cohere: 'cohere',
  cohere_chat: 'cohere',
  moonshot: 'moonshotai',
  dashscope: 'alibaba',
  qwencloud: 'alibaba',
  qwen_ai_platform: 'alibaba',
  perplexity: 'perplexity',
  ai21: 'ai21',
  minimax: 'minimax',
  zai: 'zhipuai',
  zhipuai: 'zhipuai',
  meta_llama: 'meta',
  volcengine: 'bytedance-seed',
  writer: 'writer',
  reka: 'rekaai',
  upstage: 'upstage',
  sarvam: 'sarvam',
};

/**
 * 模态：优先用显式的 supported_modalities 数组；没有的话对话类模型一定收文本，
 * 再按 supports_vision / supports_audio_input 等布尔标记逐项补。
 * 这不是估算——每个标记都是上游明确声明的能力。
 */
function modalitiesOf(entry: RawLiteLlmEntry): { input: string[]; output: string[] } {
  let input = normalizeGatewayModalities(entry.supported_modalities);
  let output = normalizeGatewayModalities(entry.supported_output_modalities);
  if (input.length === 0) {
    const set = new Set<string>(['text']);
    if (entry.supports_vision === true) set.add('image');
    if (entry.supports_audio_input === true) set.add('audio');
    if (entry.supports_pdf_input === true) set.add('pdf');
    if (entry.supports_video_input === true) set.add('video');
    input = [...set].sort();
  }
  if (output.length === 0) {
    const set = new Set<string>(['text']);
    if (entry.supports_audio_output === true) set.add('audio');
    output = [...set].sort();
  }
  return { input, output };
}

/**
 * LiteLLM 的 release_date 覆盖率实测为 0%，所以它不参与发布日期投票；
 * 调研也明确它是「深度优先」的源，最新的中国厂商模型经常整条缺失，不能用于新模型发现。
 * 它有两个用途：第三方佐证（某个 id 是否在一个与 OpenRouter 完全独立的目录里也存在），
 * 以及 models.dev 缺项时的定价 / 上下文 / 模态兜底（docs/DATA.md 仲裁表）。
 */
export async function fetchLiteLlm(fetchedAt: string): Promise<LiteLlmResult> {
  const bareSlugs = new Set<string>();
  const byBareSlug = new Map<string, LiteLlmEntry[]>();
  const counts: Record<string, number> = { total: 0, chat: 0, firstParty: 0 };
  try {
    const { data } = await fetchJson<Record<string, RawLiteLlmEntry>>(ENDPOINTS.litellm, {
      label: 'litellm/model_prices_and_context_window.json',
    });
    // 键按字典序遍历，保证 byBareSlug 里的顺序不依赖上游 JSON 的键顺序。
    for (const key of Object.keys(data).sort()) {
      const entry = data[key];
      if (key === 'sample_spec' || !entry || typeof entry !== 'object') continue;
      counts.total += 1;
      if (entry.mode && !CHAT_MODES.has(entry.mode)) continue;
      counts.chat += 1;
      const last = key.split('/').pop() ?? key;
      const a = alnum(last);
      if (!a) continue;
      bareSlugs.add(a);
      const providerRaw = (entry.litellm_provider ?? '').trim().toLowerCase();
      const vendorId = FIRST_PARTY_PROVIDERS[providerRaw]
        ? canonicalVendorId(FIRST_PARTY_PROVIDERS[providerRaw])
        : null;
      if (vendorId) counts.firstParty += 1;
      const list = byBareSlug.get(a) ?? [];
      list.push({
        key,
        vendorId,
        facts: {
          inputPerMTok: sanitizePrice(perTokenToPerMTok(entry.input_cost_per_token)),
          outputPerMTok: sanitizePrice(perTokenToPerMTok(entry.output_cost_per_token)),
          cachedInputPerMTok: sanitizePrice(perTokenToPerMTok(entry.cache_read_input_token_cost)),
          contextWindow: positiveIntOrNull(entry.max_input_tokens),
          maxOutput: positiveIntOrNull(entry.max_output_tokens) ?? positiveIntOrNull(entry.max_tokens),
          modalities: modalitiesOf(entry),
        },
      });
      byBareSlug.set(a, list);
    }
    log.step(
      `LiteLLM：${counts.total} 条，其中对话类 ${counts.chat} 条（第一方 provider ${counts.firstParty} 条），` +
        `去重型号片段 ${bareSlugs.size} 个`,
    );
    return {
      status: {
        ok: true,
        fetchedAt,
        note: `${counts.total} 条（对话类 ${counts.chat} 条）；用作新模型的第三方佐证，以及 models.dev 缺项时的定价/上下文兜底`,
      },
      bareSlugs,
      byBareSlug,
      counts,
    };
  } catch (err) {
    log.error(`LiteLLM 抓取失败：${errorMessage(err)}`);
    return {
      status: { ok: false, fetchedAt: null, note: `抓取失败：${errorMessage(err)}` },
      bareSlugs,
      byBareSlug,
      counts,
    };
  }
}

/**
 * 为某个模型挑一条 LiteLLM 事实。规则：
 *   1. 第一方 provider 的条目优先（openai 下的 gpt-4o 而不是 azure 下的）；
 *   2. 没有第一方条目时，只在**所有托管商条目对这一项给的值完全一致**时采信——
 *      五家托管商五个价的 Llama 就留空，不取中位数也不取最低价。
 * 两条都不满足返回 null。逐字段判断，所以定价可能来自共识、上下文来自另一条。
 */
export function pickLiteLlmField<K extends 'inputPerMTok' | 'outputPerMTok' | 'cachedInputPerMTok' | 'contextWindow' | 'maxOutput'>(
  entries: LiteLlmEntry[],
  vendorId: string,
  field: K,
): number | null {
  const own = entries.filter((e) => e.vendorId === vendorId && e.facts[field] !== null);
  const pool = own.length > 0 ? own : entries;
  const values = [...new Set(pool.map((e) => e.facts[field]).filter((v): v is number => v !== null))];
  return values.length === 1 ? values[0] : null;
}

/** 模态的取法同上：第一方优先，否则全体一致才用。 */
export function pickLiteLlmModalities(
  entries: LiteLlmEntry[],
  vendorId: string,
): { input: string[]; output: string[] } | null {
  const own = entries.filter((e) => e.vendorId === vendorId);
  const pool = own.length > 0 ? own : entries;
  if (pool.length === 0) return null;
  const keys = new Set(pool.map((e) => `${e.facts.modalities.input.join(',')}|${e.facts.modalities.output.join(',')}`));
  if (keys.size !== 1) return null;
  return pool[0].facts.modalities;
}
