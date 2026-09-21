import Link from 'next/link';
import type { ModelRecord } from '@/lib/types';
import { attributionLabel } from '@/data/coding-leagues';
import { BENCHMARK_CATEGORIES, benchmarkOf, isCodingBenchmark } from '@/data/benchmark-registry';
import {
  allScoresOf,
  buildScorePools,
  formatLeagueScore,
  poolKeyOf,
  rankInPool,
  trackIdFor,
  type ScorePools,
} from '@/lib/scores';

/**
 * 详情页的「全部成绩」：把一个模型在编程以外的每个榜单上的成绩按分类列出来，
 * 带原始值、在该榜有成绩的模型里的名次、测量方与出处。
 *
 * 编程成绩不在这里——它们有自己的一张战绩表（CodingLedger），二十多个赛制
 * 需要更详细的口径说明。
 *
 * 名次的分母是「同榜单、同测量方有成绩的模型数」，不是全站模型数。
 * 「第 3 / 10」和「第 3 / 194」不是一回事，所以分母必须写出来。
 */

/** 分位池按快照缓存：534 个详情页共用一份，不必每页重算 */
const POOL_CACHE = new WeakMap<ModelRecord[], ScorePools>();

function poolsFor(models: ModelRecord[]): ScorePools {
  let pools = POOL_CACHE.get(models);
  if (!pools) {
    pools = buildScorePools(models);
    POOL_CACHE.set(models, pools);
  }
  return pools;
}

export function ScoreLedger({ model, models }: { model: ModelRecord; models: ModelRecord[] }) {
  const scores = allScoresOf(model).filter((s) => !isCodingBenchmark(s.league));
  if (scores.length === 0) return null;

  const pools = poolsFor(models);
  const order = new Map(BENCHMARK_CATEGORIES.map((c, i) => [c, i]));

  const rows = scores
    .map((s) => {
      const info = benchmarkOf(s.league);
      const pool = pools.get(poolKeyOf(s.league, s.attribution)) ?? [];
      const { rank, total } = rankInPool(pool, s.score, info.higherIsBetter);
      return { s, info, rank, total };
    })
    .sort(
      (a, b) =>
        (order.get(a.info.category) ?? 99) - (order.get(b.info.category) ?? 99) ||
        a.info.priority - b.info.priority ||
        a.s.league.localeCompare(b.s.league),
    );

  const groups: { category: string; rows: typeof rows }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.category === r.info.category) last.rows.push(r);
    else groups.push({ category: r.info.category, rows: [r] });
  }

  return (
    <section className="mt-6">
      <div className="pixel-panel-dark p-5">
        <h2 className="mb-1 text-sm text-[var(--color-parchment)]">全部成绩（按榜单分列）</h2>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--color-ghost)]">
          名次的分母是在同一个榜、由同一类测量方测过的模型数，不是全站模型数。不同榜的分数不可互相比较。
        </p>

        {groups.map((g) => (
          <div key={g.category} className="mb-3 last:mb-0">
            <div className="mb-1 text-[13px] text-[var(--color-gold)]">{g.category}</div>
            <ul className="flex flex-col">
              {g.rows.map(({ s, info, rank, total }) => {
                const thirdParty = s.attribution === 'third-party';
                const trackId = trackIdFor(pools, s.league, s.attribution);
                return (
                  <li key={`${s.league}-${s.attribution}-${s.source}`} className="border-b border-white/10 py-2 last:border-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[14px] text-[var(--color-parchment)]">
                        {trackId ? (
                          <Link
                            href={`/leaderboard/?track=${encodeURIComponent(trackId)}`}
                            className="hover:text-[var(--color-gold)]"
                            title="去排行榜看这个榜的完整名单"
                          >
                            {info.label}
                          </Link>
                        ) : (
                          info.label
                        )}
                      </span>
                      <span className="shrink-0 text-right text-[14px] tabular-nums text-[var(--color-gold)]">
                        {formatLeagueScore(s.league, s.score, s.unit)}
                        <span className="ml-2 text-[13px] text-[var(--color-parchment-dim)]">
                          第 {rank} / {total}
                        </span>
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-3">
                      <span className="text-[13px] leading-snug text-[var(--color-ghost)]">{info.blurb}</span>
                      <span
                        className="shrink-0 text-[13px]"
                        style={{ color: thirdParty ? 'var(--color-newborn)' : 'var(--color-ghost)' }}
                        title={
                          thirdParty
                            ? '由榜单方或独立第三方测出并公布'
                            : '由厂商在自家系统卡或发布博客里公布，没有经过独立复核'
                        }
                      >
                        {attributionLabel(s.attribution)}
                      </span>
                    </div>
                    {(s.sourceUrl || info.homepage) && (
                      <a
                        href={s.sourceUrl ?? info.homepage!}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 block truncate text-[13px] text-[var(--color-ghost)] hover:text-[var(--color-parchment)]"
                      >
                        {s.sourceUrl ?? info.homepage}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
