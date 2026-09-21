import Link from 'next/link';
import { Sky } from './Sky';
import { HorizonEdge } from './Ground';
import { SiteNav, type NavKey } from './SiteNav';
import { getDict, type Lang } from '@/lib/i18n';

/**
 * 首页以外所有页面的页头。
 *
 * 之前内页顶部只有一排居中浮着的导航：没有站名、没有天空、和下面左对齐的正文也对不齐，
 * 读者的原话是「顶部导航栏的布局很怪」「背景太素」。首页有一整条黎明天际线，
 * 内页却是一片纯色开场，看着像两个站。
 *
 * 所以内页也给一条天空带——只是压得更窄（首页 48~78px，这里 30~50px）：
 * 内页的主角是表格和时间轴，天空只负责证明「还在同一个世界里」，不能占地方。
 *
 * 宽度必须跟正文用同一个壳，否则导航贴着屏幕边、内容却居中，就是之前那个「怪」。
 * `narrow` 给素材署名这类纯阅读页用，它们的正文比默认窄。
 */
export function SiteHeader({
  current,
  lang,
  narrow = false,
}: {
  /** 当前页，null 表示不在三个主入口里（如素材署名页） */
  current: NavKey | null;
  lang: Lang;
  narrow?: boolean;
}) {
  const dict = getDict(lang);
  const shell = narrow ? 'mx-auto w-full max-w-5xl px-4 sm:px-8' : 'page-shell';

  return (
    <>
      <header className="relative shrink-0 pb-1">
        <Sky skylineHeight="clamp(30px, 4vh, 50px)" />
        <div className={`${shell} relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-2`}>
          {/* 站名兼回首页的入口。pixel-outline 的描边会溢出行盒，leading 要留余量 */}
          <Link
            href="/"
            className="pixel-outline font-pixel text-lg leading-[1.5] hover:text-[var(--color-gold)] sm:text-xl"
          >
            {dict.siteName}
          </Link>
          <SiteNav current={current} lang={lang} />
        </div>
      </header>
      <HorizonEdge />
    </>
  );
}
