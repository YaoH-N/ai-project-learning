import Link from 'next/link';
import type { Lineage } from '@/lib/lineage';
import type { ModelKind } from '@/lib/kind';
import { getDict, type Lang } from '@/lib/i18n';

/**
 * 同系列历代的时间轴。左旧右新，当前这一代高亮。
 *
 * 放在名牌正下方而不是页面下半截：「这是第几代、上一代是谁」属于身份信息，
 * 和名字、厂商、类型是同一层的东西。房间、属性表、战绩都是看完身份之后才要的。
 *
 * 每一格只放三样：发布月份、名字、综合智力分。分数放在这里才有意义——
 * 同一条线、同一种类型的模型，ECI 之间是可比的，一眼就能看出哪一代是真正的跨越。
 */

function monthOf(iso: string | null): string {
  if (!iso) return '日期不详';
  return `${iso.slice(0, 4)}.${iso.slice(5, 7)}`;
}

export function LineageStrip({
  lineage,
  kind,
  vendorId,
  vendorName,
  lang,
}: {
  lineage: Lineage;
  kind: ModelKind | null;
  vendorId: string;
  vendorName: string;
  lang: Lang;
}) {
  const dict = getDict(lang);
  const kindLabel = kind ? dict.kind.label[kind] : dict.kind.unknown;
  const windowed = lineage.total > lineage.entries.length;

  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          className="text-sm text-[var(--color-parchment)]"
          // 判定规则写在悬停里而不是标题下面：需要解释的东西不占正文版面
          title={`同一厂商、名字里第一个数字之前那一段相同、且同为${kindLabel}模型的，算作一个系列`}
        >
          {lineage.stem} 系列的{kindLabel}模型 · 按发布时间
        </h2>
        <span className="text-[12px] text-[var(--color-ghost)]">
          {windowed
            ? `共 ${lineage.total} 个 · 这里是相邻的 ${lineage.entries.length} 个 · `
            : `共 ${lineage.total} 个 · `}
          <Link href={`/vendor/${vendorId}/`} className="hover:text-[var(--color-gold)]">
            {vendorName}的全部模型 →
          </Link>
        </span>
      </div>

      {/*
        窄屏折行、宽屏一行。窄屏如果也用横向滚动条，高亮的「当前这一代」多半落在屏幕外，
        而读者根本不知道要往右拨——折行虽然不像时间轴，但至少每一代都看得见。
        折行时箭头就不画了，从左到右从上到下本身已经是顺序。
      */}
      <div className="pixel-panel-dark p-3 sm:overflow-x-auto">
        <ol className="flex flex-wrap items-stretch gap-1 sm:min-w-max sm:flex-nowrap">
          {lineage.entries.map((m, i) => {
            const current = i === lineage.currentIndex;
            const eci = m.benchmarks?.eci;
            return (
              <li key={m.id} className="flex w-[calc(50%-0.125rem)] items-stretch sm:w-auto">
                {i > 0 && (
                  <span
                    className="hidden self-center px-1 text-[13px] text-[var(--color-ghost)] sm:inline"
                    aria-hidden
                  >
                    →
                  </span>
                )}
                <Link
                  href={`/model/${m.slug}/`}
                  aria-current={current ? 'page' : undefined}
                  className="flex w-full flex-col gap-1 border-2 px-2 py-1.5 hover:border-[var(--color-gold)] sm:w-[124px]"
                  style={{
                    borderColor: current ? 'var(--color-gold)' : 'rgb(255 255 255 / 0.12)',
                    background: current ? 'rgb(242 207 106 / 0.12)' : 'rgb(0 0 0 / 0.25)',
                    opacity: m.retiredAt ? 0.55 : 1,
                  }}
                >
                  <span className="font-pixel text-[12px] leading-none text-[var(--color-ghost)]">
                    {monthOf(m.releaseDate)}
                  </span>
                  <span
                    className="line-clamp-2 text-[13px] leading-tight"
                    style={{ color: current ? 'var(--color-gold)' : 'var(--color-parchment)' }}
                  >
                    {m.name}
                  </span>
                  <span className="mt-auto font-pixel text-[12px] leading-none text-[var(--color-parchment-dim)]">
                    {eci != null ? `ECI ${eci.toFixed(1)}` : m.retiredAt ? '已退役' : '未参评'}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
