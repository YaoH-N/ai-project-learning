import type { BenchmarkScore } from '@/lib/types';
import { attributionLabel, leagueOf } from '@/data/coding-leagues';
import { formatScoreByUnit } from '@/lib/format';

/**
 * 编程战绩明细。
 *
 * 广场卡片上那一行只显示「榜内第几」，因为二十多个赛制的原始分数互不可比，
 * 并排摆在一起一定会被读者直接比大小。原始分数不是不重要，是不该出现在
 * 一个用于横向扫视的位置——所以全都落在这里。
 *
 * 一个赛制一行，写清分数、谁测的、出处链接。同一个模型在不同赛制上
 * 分数差二三十分是常态，这张表存在的意义之一就是让人亲眼看到这件事。
 */
export function CodingLedger({ scores }: { scores: BenchmarkScore[] }) {
  if (scores.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-[var(--color-ghost)]">
        没有查到这个模型的任何公开编程评测成绩。
        <br />
        这表示「没人公开测过它」，不表示「它不会写代码」——本站不会用估算值填补空缺。
      </p>
    );
  }

  const sorted = [...scores].sort(
    (a, b) => leagueOf(a.league).priority - leagueOf(b.league).priority,
  );

  return (
    <>
      <ul className="flex flex-col">
        {sorted.map((s) => {
          const league = leagueOf(s.league);
          const thirdParty = s.attribution === 'third-party';
          return (
            <li
              key={`${s.league}-${s.source}`}
              className="border-b border-white/10 py-2 last:border-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12px] text-[var(--color-parchment)]">
                  {league.homepage ? (
                    <a
                      href={league.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[var(--color-gold)]"
                    >
                      {league.label}
                    </a>
                  ) : (
                    league.label
                  )}
                </span>
                <span className="shrink-0 text-right text-xs tabular-nums text-[var(--color-gold)]">
                  {formatScoreByUnit(s.score, s.unit)}
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-3">
                <span className="text-[12px] leading-snug text-[var(--color-ghost)]">
                  {league.blurb}
                </span>
                <span
                  className="shrink-0 text-[12px]"
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
              {s.sourceUrl && (
                <a
                  href={s.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-0.5 block truncate text-[12px] text-[var(--color-ghost)] hover:text-[var(--color-parchment)]"
                >
                  {s.sourceUrl}
                </a>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ghost)]">
        这些分数<strong className="text-[var(--color-parchment)]">不可互相比较</strong>。同一个模型换一套评测脚手架就能差二三十分：
        SWE-bench Verified 的中位数是 75.7，而难度更高的 SWE-Bench Pro 只有 41.0。
        广场上的能力条因此显示的是「在同一把尺子下排第几」，而不是分数本身。
      </p>
    </>
  );
}
