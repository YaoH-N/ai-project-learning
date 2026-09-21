import { ENDPOINTS } from '../config';
import { stripArtificialAnalysis } from '../lib/compliance';
import { parseLooseDate } from '../lib/dates';
import { perTokenToPerMTok, sanitizePrice } from '../lib/decimal';
import { canonicalizeId, NON_CREATOR_NAMESPACES } from '../lib/ids';
import { fetchJson } from '../lib/http';
import { errorMessage, log } from '../lib/log';
import type { GatewayModel, GatewayResult } from './types';

interface RawOpenRouterModel {
  id?: string;
  canonical_slug?: string;
  name?: string;
  created?: number;
  context_length?: number;
  architecture?: { input_modalities?: string[]; output_modalities?: string[]; modality?: string };
  /**
   * 每 token 的美元字符串。只取 prompt / completion / input_cache_read 三项：
   * `image`（按张）、`request`（按次）、`web_search`（按次）都不是 per-token 的量，不折算。
   */
  pricing?: { prompt?: string; completion?: string; input_cache_read?: string; [k: string]: unknown };
  top_provider?: { context_length?: number; max_completion_tokens?: number | null };
  benchmarks?: Record<string, unknown>;
  [k: string]: unknown;
}

/** OpenRouter 把 PDF 等文档输入叫 `file`，契约里叫 `pdf`。 */
export function normalizeGatewayModalities(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map((x) => String(x).trim().toLowerCase())
      .map((x) => (x === 'file' ? 'pdf' : x))
      .filter(Boolean),
  )].sort();
}

export function positiveIntOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

export async function fetchOpenRouter(
  fetchedAt: string,
): Promise<GatewayResult & { rawForSnapshot: unknown; strippedCount: number }> {
  const models = new Map<string, GatewayModel>();
  const counts: Record<string, number> = { total: 0, usable: 0, skippedVariant: 0 };

  try {
    const { data } = await fetchJson<{ data?: RawOpenRouterModel[] }>(ENDPOINTS.openrouter, {
      label: 'openrouter/api/v1/models',
    });
    const { data: sanitized, stripped } = stripArtificialAnalysis(data);
    const list = (sanitized as { data?: RawOpenRouterModel[] }).data ?? [];

    for (const model of list) {
      counts.total += 1;
      if (!model.id) continue;
      const canon = canonicalizeId(model.id);
      if (!canon) continue;
      // `~` 动态别名与 :free/:batch 变体指向的是同一个模型，不重复计入。
      if (canon.variant) {
        counts.skippedVariant += 1;
        continue;
      }
      if (NON_CREATOR_NAMESPACES.has(canon.vendorId)) continue;
      if (models.has(canon.id)) continue;
      counts.usable += 1;
      models.set(canon.id, {
        id: canon.id,
        vendorId: canon.vendorId,
        modelSlug: canon.modelSlug,
        // created 是「上架 OpenRouter 的日期」，不是发布日期。
        // 只作为发布日期多源投票里的一票，绝不单独采信。
        releaseDate: parseLooseDate(model.created),
        upstreamName: model.name ?? null,
        // 只在 models.dev 缺项时兜底。benchmarks.* 已在上面整段剔除，这里绝不碰。
        facts: {
          inputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.prompt)),
          outputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.completion)),
          cachedInputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.input_cache_read)),
          contextWindow:
            positiveIntOrNull(model.context_length) ??
            positiveIntOrNull(model.top_provider?.context_length),
          maxOutput: positiveIntOrNull(model.top_provider?.max_completion_tokens),
          modalities: {
            input: normalizeGatewayModalities(model.architecture?.input_modalities),
            output: normalizeGatewayModalities(model.architecture?.output_modalities),
          },
        },
      });
    }
    log.step(
      `OpenRouter：${counts.total} 条，可用 ${counts.usable} 条（剔除变体 ${counts.skippedVariant} 条），` +
        `主动剔除 artificial_analysis 字段 ${stripped} 处`,
    );
    return {
      status: {
        ok: true,
        fetchedAt,
        note: `${counts.total} 条；已剔除 artificial_analysis ${stripped} 处（AA ToS 合规）；用于新模型发现、发布日期投票，以及 models.dev 缺项时的定价/上下文/模态兜底`,
      },
      models,
      counts,
      rawForSnapshot: sanitized,
      strippedCount: stripped,
    };
  } catch (err) {
    log.error(`OpenRouter 抓取失败：${errorMessage(err)}`);
    return {
      status: { ok: false, fetchedAt: null, note: `抓取失败：${errorMessage(err)}` },
      models,
      counts,
      rawForSnapshot: null,
      strippedCount: 0,
    };
  }
}
