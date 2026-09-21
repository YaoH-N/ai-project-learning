import { ENDPOINTS, HF } from '../config';
import { fetchJson } from '../lib/http';
import { errorMessage, log } from '../lib/log';
import type { HuggingFaceFacts, HuggingFaceResult } from './types';

interface RawHfModel {
  id?: string;
  safetensors?: { total?: number; parameters?: Record<string, number> };
  cardData?: { license?: string | string[]; license_name?: string };
  config?: { num_experts?: number; num_experts_per_tok?: number };
}

/**
 * safetensors.total 是各 dtype 分片求和，混合量化仓库（同时含 BF16 / F8_E4M3 / I8）会失真。
 * 取占比最高的单一 dtype 作为主权重格式；若没有任何 dtype 占到多数，才回落到 total。
 */
function pickParameterCount(st: RawHfModel['safetensors']): number | null {
  if (!st) return null;
  const params = st.parameters ?? {};
  const entries = Object.entries(params).filter(([, v]) => typeof v === 'number' && v > 0);
  if (entries.length === 0) {
    return typeof st.total === 'number' && st.total > 0 ? st.total : null;
  }
  const total = entries.reduce((acc, [, v]) => acc + v, 0);
  const dominant = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  if (dominant[1] / total >= 0.6) return dominant[1];
  return typeof st.total === 'number' && st.total > 0 ? st.total : total;
}

function normalizeLicense(card: RawHfModel['cardData']): string | null {
  if (!card) return null;
  const raw = Array.isArray(card.license) ? card.license[0] : card.license;
  const value = (raw ?? card.license_name ?? '').toString().trim();
  return value || null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * 第三层容错的典型场景：HF 从中国大陆被 TCP reset，本地必然失败。
 * 先打一次探针，探针不通就整段跳过——不阻塞管线，参数量与许可证留 null。
 */
export async function fetchHuggingFace(
  fetchedAt: string,
  targets: Array<{ modelId: string; repos: string[] }>,
): Promise<HuggingFaceResult> {
  const byModelId = new Map<string, HuggingFaceFacts>();
  const counts: Record<string, number> = { requested: targets.length, resolved: 0, failed: 0 };

  if (targets.length === 0) {
    return {
      status: { ok: false, fetchedAt: null, note: '没有需要查询的开源模型仓库' },
      byModelId,
      counts,
    };
  }

  try {
    await fetchJson<RawHfModel>(
      `${ENDPOINTS.huggingfaceModel}/${HF.probeRepo}?expand%5B%5D=safetensors`,
      { label: 'huggingface 探针', timeoutMs: HF.timeoutMs, retries: HF.retries, noCache: true },
    );
  } catch (err) {
    const note = `探针 ${HF.probeRepo} 不可达（${errorMessage(err)}）：整段跳过，参数量与许可证留空`;
    log.warn(`Hugging Face ${note}`);
    return { status: { ok: false, fetchedAt: null, note }, byModelId, counts };
  }

  await mapWithConcurrency(targets, HF.concurrency, async (target) => {
    for (const repo of target.repos) {
      try {
        const url =
          `${ENDPOINTS.huggingfaceModel}/${repo}` +
          '?expand%5B%5D=safetensors&expand%5B%5D=cardData&expand%5B%5D=config';
        const { data } = await fetchJson<RawHfModel>(url, {
          label: `huggingface/${repo}`,
          timeoutMs: HF.timeoutMs,
          retries: HF.retries,
        });
        const totalParams = pickParameterCount(data.safetensors);
        byModelId.set(target.modelId, {
          repo,
          totalB: totalParams === null ? null : Math.round((totalParams / 1e9) * 100) / 100,
          activeB: null,
          licenseRaw: normalizeLicense(data.cardData),
        });
        counts.resolved += 1;
        return;
      } catch {
        // 单个仓库失败只丢弃该仓库，继续试同一模型的下一个仓库地址。
      }
    }
    counts.failed += 1;
  });

  const ok = counts.resolved > 0;
  log.step(`Hugging Face：请求 ${counts.requested} 个模型，成功 ${counts.resolved}，失败 ${counts.failed}`);
  return {
    status: {
      ok,
      fetchedAt: ok ? fetchedAt : null,
      note: `请求 ${counts.requested} 个开源模型，成功 ${counts.resolved}，失败 ${counts.failed}`,
    },
    byModelId,
    counts,
  };
}
