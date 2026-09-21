import Link from 'next/link';
import { GroundBackdrop } from '@/components/world/Ground';
import { SiteHeader } from '@/components/world/SiteHeader';
import { VendorCrest } from '@/components/character/VendorCrest';
import { loadSnapshot } from '@/lib/snapshot';
import { profileFor } from '@/data/vendor-registry';
import { readableOnDark } from '@/lib/color';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';
import { formatDate } from '@/lib/format';
import type { ModelRecord } from '@/lib/types';

export const metadata = { title: '时间线' };

/**
 * 时间线。
 *
 * 所有模型按发布日期排成一条河，从最早一直流到今天。
 * 这是全站唯一回答「这些年到底发生了什么」的一屏。
 *
 * 一个数据上的讲究：上游的发布日期有三种精度（日/月/年），
 * 只精确到月的必须显示成「2026 年 1 月」而不是补成 1 号，
 * 否则就是在编造一个不存在的确切日期。
 */

interface MonthBucket {
  key: string;
  year: number;
  month: number;
  models: ModelRecord[];
}

function bucketByMonth(models: ModelRecord[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const m of models) {
    if (!m.releaseDate) continue;
    const [y, mo] = m.releaseDate.split('-');
    const key = `${y}-${mo ?? '01'}`;
    const bucket = map.get(key);
    if (bucket) bucket.models.push(m);
    else map.set(key, { key, year: Number(y), month: Number(mo ?? 1), models: [m] });
  }
  const buckets = Array.from(map.values());
  // 新的在上：读者最关心的是当下，往下滚才是回溯历史
  buckets.sort((a, b) => b.key.localeCompare(a.key));
  for (const b of buckets) {
    b.models.sort(
      (x, y) => (y.benchmarks.eci ?? -1) - (x.benchmarks.eci ?? -1) || x.id.localeCompare(y.id),
    );
  }
  return buckets;
}

export default function ChroniclePage() {
  const lang = DEFAULT_LANG;
  const dict = getDict(lang);
  const snapshot = loadSnapshot();
  const buckets = bucketByMonth(snapshot.models);
  const busiest = Math.max(...buckets.map((b) => b.models.length), 1);

  return (
    <main className="relative min-h-dvh">
      <GroundBackdrop />
      <div className="relative">
        <SiteHeader current="chronicle" lang={lang} />

        <div className="page-shell pb-16 pt-4">
          <h1 className="pixel-outline mb-2 mt-4 text-2xl sm:text-3xl">{dict.nav.chronicle}</h1>
          <p className="mb-8 text-[14px] leading-relaxed text-[var(--color-ghost)]">
            {snapshot.models.length} 个模型按发布月份排列，最新的在上。彩色名字表示有第三方综合评测成绩。
          </p>

          {/*
            每个月一块面板，模型做成一枚枚带厂商徽记的牌子。
            早先是 12px 的纯文字挤在一起，几百个名字连成一片，读者反馈「太挤了」——
            现在牌子有底色、有边框、有 14px 的字，行距放开，一个月一眼能数清有几个。
          */}
          <ol className="relative border-l-2 border-[var(--color-stone-dark)] pl-5 sm:pl-7">
            {buckets.map((b) => (
              <li key={b.key} className="relative mb-10">
                {/* 时间轴上的节点，大小随当月发布数量变化 */}
                <span
                  className="absolute top-2 block bg-[var(--color-gold)]"
                  style={{
                    left: -22 - Math.round((b.models.length / busiest) * 4) - 5,
                    width: 10 + Math.round((b.models.length / busiest) * 8),
                    height: 10 + Math.round((b.models.length / busiest) * 8),
                    marginTop: -Math.round((b.models.length / busiest) * 4),
                    boxShadow: '0 0 8px rgb(242 207 106 / 0.45)',
                  }}
                  aria-hidden
                />
                <h2 className="flex items-baseline gap-3">
                  <span className="font-pixel text-[18px] leading-none text-[var(--color-parchment)]">
                    {b.year}.{String(b.month).padStart(2, '0')}
                  </span>
                  <span className="text-[13px] text-[var(--color-ghost)]">{b.models.length} 个发布</span>
                </h2>

                <div className="mt-3 flex flex-wrap gap-2">
                  {b.models.map((m) => {
                    const profile = profileFor(m.vendorId);
                    const scored = m.benchmarks.eci != null;
                    return (
                      <Link
                        key={m.id}
                        href={`/model/${m.slug}/`}
                        title={`${profile.nameZh} · ${formatDate(m.releaseDate, m.releaseDatePrecision, lang)}${m.releaseDatePrecision === 'month' ? '（仅精确到月）' : ''}`}
                        className="flex items-center gap-2 border-2 border-[var(--color-ink)] px-2.5 py-1.5 text-[14px] leading-none hover:border-[var(--color-gold)]"
                        style={{
                          background: 'var(--color-plate)',
                          color: scored
                            ? readableOnDark(profile.accentColor, 0.45)
                            : 'var(--color-ghost)',
                          boxShadow: '2px 2px 0 rgb(0 0 0 / 0.35)',
                        }}
                      >
                        <VendorCrest
                          motif={profile.motif}
                          accentColor={profile.accentColor}
                          size={13}
                        />
                        <span>{m.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </main>
  );
}
