import Link from 'next/link';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';

/** 数据源署名。CC-BY 4.0 要求每个展示页都能找到出处，所以放在全站布局里而不是某一页。 */
const DATA_SOURCES = [
  { name: 'Epoch AI', license: 'CC-BY 4.0', href: 'https://epoch.ai/data/ai-benchmarking-dashboard' },
  { name: 'models.dev', license: 'MIT', href: 'https://models.dev' },
  { name: 'LiveBench', license: 'Apache-2.0', href: 'https://livebench.ai' },
  /*
   * 竞技场分来自 LMArena 官方发布的 `lmarena-ai/leaderboard-dataset`（CC-BY 4.0）。
   * 链接指向数据集本身而不是 arena.ai 的榜单页：CC-BY 要求给出**材料**的链接，
   * 而我们用的是那份数据集，不是那个网页。修改声明在致谢页。
   */
  {
    name: 'LMArena',
    license: 'CC-BY 4.0',
    href: 'https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset',
  },
];

const ART_SOURCES = [
  {
    name: 'Liberated Pixel Cup',
    license: 'CC0 / OGA-BY 3.0',
    href: 'https://lpc.opengameart.org',
  },
  {
    name: 'Fusion Pixel Font',
    license: 'OFL-1.1',
    href: 'https://github.com/TakWolf/fusion-pixel-font',
  },
];

/** 站长与他的其他站点。放在页脚最上面一行，是全站唯一的引流位。站长名链到 B 站主页。 */
const AUTHOR = { name: '程序员鱼皮', href: 'https://space.bilibili.com/12890453' };

/**
 * 开源仓库。
 *
 * 放在页脚下半段的署名区，与数据源、美术素材并排，而不是挤进上面那排引流按钮——
 * 那一排留给站长自己的站点。这里的三行本来就是在回答「这些东西都是哪来的」，
 * 「代码本身也是公开的」正好是同一个问题的最后一问。
 */
const REPO = { name: 'liyupi/ai-model-world', href: 'https://github.com/liyupi/ai-model-world' };

/** 免费教程单独拎出来做主按钮：三个站点并列时它会被淹没，而它是这里最值得点的一个。 */
const TUTORIAL = {
  name: 'AI 编程入门教程',
  blurb: '零基础学 Vibe Coding · 免费',
  href: 'https://ai.codefather.cn/vibe',
};

const AUTHOR_SITES = [
  {
    name: '鱼皮 AI 导航',
    blurb: 'AI 工具、资讯与提示词大全',
    href: 'https://ai.codefather.cn',
  },
  {
    name: '编程导航',
    blurb: '程序员一站式编程学习交流社区',
    href: 'https://www.codefather.cn',
  },
];

/** 一条像素小鱼，站长的徽记 */
function FishCrest({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      shapeRendering="crispEdges"
      aria-hidden
      className="shrink-0"
    >
      <rect x="3" y="3" width="6" height="6" fill="var(--color-gold)" />
      <rect x="2" y="4" width="1" height="4" fill="var(--color-gold)" />
      <rect x="4" y="2" width="4" height="1" fill="var(--color-gold)" />
      <rect x="4" y="9" width="4" height="1" fill="var(--color-gold)" />
      <rect x="9" y="4" width="1" height="1" fill="var(--color-gold)" />
      <rect x="9" y="7" width="1" height="1" fill="var(--color-gold)" />
      <rect x="10" y="3" width="1" height="1" fill="var(--color-gold)" />
      <rect x="10" y="8" width="1" height="1" fill="var(--color-gold)" />
      <rect x="10" y="5" width="1" height="2" fill="var(--color-gold)" />
      <rect x="4" y="4" width="1" height="1" fill="var(--color-ink)" />
      <rect x="6" y="6" width="2" height="1" fill="var(--color-ink)" opacity="0.4" />
    </svg>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-parchment)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold)]"
    >
      {children}
    </a>
  );
}

/**
 * 全站页脚：数据与美术的出处。
 *
 * 这不是装饰。Epoch 的 CC-BY 与 LPC 素材的 OGA-BY 都是「署名即可用」的许可，
 * 署名做在每一页的页脚是最稳妥的履约方式——读者截任何一页的图，出处都在。
 * 逐资产的作者名单太长，放在 /credits/ 单页，这里只给入口。
 */
export function SiteFooter() {
  const dict = getDict(DEFAULT_LANG);
  return (
    <footer className="relative mt-12 border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-5 text-[12px] leading-relaxed text-[var(--color-ghost)] sm:px-8">
        {/*
          站长与他的另外两个站。做成一排像素按钮而不是一行小字：
          这是全站唯一的引流位，得让人看见；但只占一行，不抢正文。
        */}
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/10 pb-4">
          <a
            href={AUTHOR.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 font-pixel text-[13px] text-[var(--color-parchment)] hover:text-[var(--color-gold)]"
          >
            <FishCrest />
            {dict.footer.author}：{AUTHOR.name}
          </a>
          <span className="hidden opacity-40 sm:inline">|</span>
          <a
            href={TUTORIAL.href}
            target="_blank"
            rel="noopener noreferrer"
            title={TUTORIAL.blurb}
            className="pixel-button flex items-center gap-1.5 bg-[var(--color-gold)] px-2 py-0.5 text-[12px] leading-tight text-[var(--color-ink)] hover:brightness-110"
          >
            <span className="font-semibold">{TUTORIAL.name}</span>
            <span className="hidden text-[var(--color-ink-soft)] sm:inline">{TUTORIAL.blurb}</span>
          </a>
          <span className="text-[var(--color-ghost)]">{dict.footer.alsoVisit}</span>
          {AUTHOR_SITES.map((s) => (
            <a
              key={s.href}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              title={s.blurb}
              className="pixel-button flex items-center gap-1.5 px-2 py-0.5 text-[12px] leading-tight text-[var(--color-ink)] hover:bg-[var(--color-gold)]"
            >
              <span className="font-semibold">{s.name}</span>
              <span className="hidden text-[var(--color-ink-soft)] sm:inline">{s.blurb}</span>
            </a>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-1.5 gap-y-1">
          <span>{dict.footer.dataFrom}</span>
          {DATA_SOURCES.map((s, i) => (
            <span key={s.name}>
              <ExtLink href={s.href}>{s.name}</ExtLink>
              <span className="opacity-70">（{s.license}）</span>
              {i < DATA_SOURCES.length - 1 && <span className="mx-1 opacity-50">·</span>}
            </span>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1">
          <span>{dict.footer.artFrom}</span>
          {ART_SOURCES.map((s, i) => (
            <span key={s.name}>
              <ExtLink href={s.href}>{s.name}</ExtLink>
              <span className="opacity-70">（{s.license}）</span>
              {i < ART_SOURCES.length - 1 && <span className="mx-1 opacity-50">·</span>}
            </span>
          ))}
          <span className="mx-1 opacity-50">·</span>
          <Link
            href="/credits/"
            className="text-[var(--color-parchment)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold)]"
          >
            {dict.footer.credits}
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1.5 gap-y-1" title={dict.footer.sourceCodeHint}>
          <span>{dict.footer.sourceCode}</span>
          <ExtLink href={REPO.href}>{REPO.name}</ExtLink>
          <span className="opacity-70">（MIT）</span>
        </div>
      </div>
    </footer>
  );
}
