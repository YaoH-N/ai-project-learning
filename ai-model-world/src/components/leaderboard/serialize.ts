import type { ModelRecord, WorldSnapshot } from '@/lib/types';
import { continentForCountry, profileFor } from '@/data/vendor-registry';
import { buildAptitudeScale } from '@/lib/aptitude';
import { rankByEci } from '@/lib/derive';
import { formatCount, formatDate, formatPrice } from '@/lib/format';
import { DEFAULT_LANG } from '@/lib/i18n';
import { kindOf } from '@/lib/kind';
import { allScoresOf, buildTrackIndex, defaultTrackId, TRACK_CATEGORIES, type Track } from '@/lib/scores';
import type { AllRow, AllTableData, ExplorerData, LeanModel, LeanVendor } from './types';

/**
 * 服务端：把完整快照压成客户端组件需要的最小形状。
 * 只在构建期运行，客户端拿到的 props 里不含任何多余字段。
 */

function leanVendors(snapshot: WorldSnapshot): LeanVendor[] {
  const ids = new Set(snapshot.models.map((m) => m.vendorId));
  const known = new Map(snapshot.vendors.map((v) => [v.id, v]));
  return [...ids].map((id) => {
    const v = known.get(id);
    const p = profileFor(id);
    return {
      id,
      nameZh: v?.nameZh ?? p.nameZh,
      motif: v?.motif ?? p.motif,
      accent: v?.accentColor ?? p.accentColor,
      continent: v?.continent ?? continentForCountry(p.country),
    };
  });
}

function leanModel(m: ModelRecord): LeanModel {
  const year = m.releaseDate ? Number(m.releaseDate.slice(0, 4)) : null;
  return {
    id: m.id,
    slug: m.slug,
    name: m.name,
    vendor: m.vendorId,
    year: year != null && Number.isFinite(year) ? year : null,
    open: m.openWeights,
    retired: m.retiredAt != null,
    kind: kindOf(m),
  };
}

export function serializeExplorer(snapshot: WorldSnapshot, tracks: Track[] = buildTrackIndex(snapshot)): ExplorerData {
  const index = new Map(snapshot.models.map((m, i) => [m.id, i]));
  const urls: string[] = [];
  const urlIndex = new Map<string, number>();
  const urlOf = (u: string | null): number | undefined => {
    if (!u) return undefined;
    let i = urlIndex.get(u);
    if (i == null) {
      i = urls.length;
      urls.push(u);
      urlIndex.set(u, i);
    }
    return i;
  };

  return {
    models: snapshot.models.map(leanModel),
    vendors: leanVendors(snapshot),
    tracks: tracks.map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      note: t.note,
      higherIsBetter: t.higherIsBetter,
      scale: t.scale,
      superseded: t.superseded,
      selfReported: t.selfReported,
      homepage: t.homepage,
      entries: t.entries.map((e) => {
        const u = urlOf(e.sourceUrl);
        return {
          m: index.get(e.model.id)!,
          v: e.value,
          t: e.text,
          ...(e.attribution === 'vendor-self-reported' ? { s: 1 as const } : {}),
          ...(u != null ? { u } : {}),
        };
      }),
    })),
    urls,
    categories: TRACK_CATEGORIES,
    defaultTrack: defaultTrackId(tracks),
  };
}

export function serializeAllTable(snapshot: WorldSnapshot): AllTableData {
  const aptitude = buildAptitudeScale(snapshot.models);
  const ranks = rankByEci(snapshot.models);

  const rows: AllRow[] = snapshot.models.map((m, i) => {
    const row = aptitude.rowOf(m);
    const code = row.values.code;
    const leagues = new Set(allScoresOf(m).map((s) => s.league));
    const price = m.pricing.outputPerMTok;
    return {
      m: i,
      date: m.releaseDate,
      dateText: formatDate(m.releaseDate, m.releaseDatePrecision, DEFAULT_LANG),
      ctx: m.contextWindow != null && m.contextWindow > 0 ? m.contextWindow : null,
      ctxText: m.contextWindow != null && m.contextWindow > 0 ? formatCount(m.contextWindow) : null,
      price: price != null && price > 0 ? price : null,
      priceText: price != null && price > 0 ? formatPrice(price, DEFAULT_LANG).replace(' / 百万 tokens', '') : null,
      eci: m.benchmarks?.eci ?? null,
      eciRank: ranks.get(m.id) ?? null,
      code:
        code.fill != null
          ? {
              verdict: code.literal ?? '已参赛',
              fill: code.fill,
              self: code.selfReported === true,
              // 悬停只留「赛制 + 原始分」与「池内名次」两行，赛制的长说明留给详情页——
              // 546 行都带上会让这一页的 HTML 多出几十 KB
              title: code.title.split('\n').slice(0, 2).join('\n'),
            }
          : null,
      n: leagues.size,
    };
  });

  return {
    models: snapshot.models.map(leanModel),
    vendors: leanVendors(snapshot),
    rows,
  };
}
