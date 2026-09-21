import { ENDPOINTS } from '../config';
import { parseLooseDate } from '../lib/dates';
import { perTokenToPerMTok, sanitizePrice } from '../lib/decimal';
import { canonicalizeId, NON_CREATOR_NAMESPACES } from '../lib/ids';
import { fetchJson } from '../lib/http';
import { errorMessage, log } from '../lib/log';
import { normalizeGatewayModalities, positiveIntOrNull } from './openrouter';
import type { GatewayModel, GatewayResult } from './types';

interface RawVercelModel {
  id?: string;
  owned_by?: string;
  name?: string;
  created?: number;
  released?: number;
  type?: string;
  context_window?: number;
  max_tokens?: number;
  modalities?: { input?: string[]; output?: string[] };
  /** 每 token 的美元字符串（"0.00000025"）。input_cache_write 是写缓存的价，契约里没有位置。 */
  pricing?: { input?: string; output?: string; input_cache_read?: string; [k: string]: unknown };
  [k: string]: unknown;
}

export async function fetchVercelGateway(
  fetchedAt: string,
): Promise<GatewayResult & { rawForSnapshot: unknown }> {
  const models = new Map<string, GatewayModel>();
  const counts: Record<string, number> = { total: 0, language: 0, usable: 0 };

  try {
    const { data } = await fetchJson<{ data?: RawVercelModel[] }>(ENDPOINTS.vercelGateway, {
      label: 'ai-gateway.vercel.sh/v1/models',
    });
    const list = data.data ?? [];
    for (const model of list) {
      counts.total += 1;
      // 网关里混着 image/video/embedding/speech，只有 language 才是「大模型世界」的居民。
      if (model.type && model.type !== 'language') continue;
      counts.language += 1;
      if (!model.id) continue;
      const canon = canonicalizeId(model.id, model.owned_by);
      if (!canon || canon.variant) continue;
      if (NON_CREATOR_NAMESPACES.has(canon.vendorId)) continue;
      if (models.has(canon.id)) continue;
      counts.usable += 1;
      models.set(canon.id, {
        id: canon.id,
        vendorId: canon.vendorId,
        modelSlug: canon.modelSlug,
        // Vercel 是唯一把「上架」(created) 与「发布」(released) 分开的商业网关，
        // 这里取 released 参与发布日期投票。
        releaseDate: parseLooseDate(model.released) ?? parseLooseDate(model.created),
        upstreamName: model.name ?? null,
        facts: {
          inputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.input)),
          outputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.output)),
          cachedInputPerMTok: sanitizePrice(perTokenToPerMTok(model.pricing?.input_cache_read)),
          contextWindow: positiveIntOrNull(model.context_window),
          maxOutput: positiveIntOrNull(model.max_tokens),
          modalities: {
            input: normalizeGatewayModalities(model.modalities?.input),
            output: normalizeGatewayModalities(model.modalities?.output),
          },
        },
      });
    }
    log.step(`Vercel AI Gateway：${counts.total} 条，其中 language ${counts.language} 条，可用 ${counts.usable} 条`);
    return {
      status: {
        ok: true,
        fetchedAt,
        note: `${counts.total} 条（language ${counts.language} 条）；用于新模型发现、发布日期投票，以及 models.dev 缺项时的定价/上下文/模态兜底`,
      },
      models,
      counts,
      rawForSnapshot: data,
    };
  } catch (err) {
    log.error(`Vercel AI Gateway 抓取失败：${errorMessage(err)}`);
    return {
      status: { ok: false, fetchedAt: null, note: `抓取失败：${errorMessage(err)}` },
      models,
      counts,
      rawForSnapshot: null,
    };
  }
}
