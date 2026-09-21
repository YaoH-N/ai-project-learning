export interface JumpTarget {
  /** 锚点，如 `#region-east` */
  href: string;
  label: string;
  /** 识别色小方块，与该区顶边同色 */
  accent: string;
  /** 有就显示在标签后面，用像素字 */
  count?: number;
}

/**
 * 首页的本页导航：一排锚点，直接跳到「今日格局 / 按类型看 / 国外 / 国内」。
 *
 * 它取代了原先浮在广场顶上的分区标签栏。那个标签栏的问题是**它是个筛选器**：
 * 点「国内」会把国外整块藏起来，可读者要的只是「快点带我到国内那一段」，
 * 为此付出一个客户端组件、一条贴顶浮条、以及「我现在看到的是不是全部」的疑惑。
 * 锚点没有状态、没有 JavaScript、不遮挡任何东西，而且顺带给了另外两块一个入口。
 *
 * 放在内容区最上面一行：读者从顶栏往下扫，第一眼看到的就是这一页有什么。
 */
export function PageJump({ targets }: { targets: JumpTarget[] }) {
  if (targets.length === 0) return null;
  return (
    <nav aria-label="本页导航" className="mb-5 flex flex-wrap items-center gap-2">
      {targets.map((t) => (
        <a
          key={t.href}
          href={t.href}
          className="jump-chip flex items-center gap-1.5 border px-2 py-1 text-[13px] leading-tight text-[var(--color-parchment-dim)] hover:text-[var(--color-parchment-lit)]"
          style={{ ['--jump' as string]: t.accent }}
        >
          <span className="h-2.5 w-2.5" style={{ background: t.accent }} aria-hidden />
          {t.label}
          {t.count != null && (
            <span className="font-pixel text-[12px] opacity-70">{t.count}</span>
          )}
        </a>
      ))}
    </nav>
  );
}
