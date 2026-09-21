import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GroundBackdrop } from '@/components/world/Ground';
import { SiteHeader } from '@/components/world/SiteHeader';
import { DEFAULT_LANG, getDict } from '@/lib/i18n';

export const metadata = { title: '素材署名' };

/**
 * 素材署名页。
 *
 * 角色由 Liberated Pixel Cup 的分层素材合成，其中 OGA-BY 3.0 许可的部分要求署名。
 * 名单的唯一事实来源是 `assets/lpc/CREDITS.md`（由 vendoring 脚本生成），
 * 这里在构建期把它读出来渲染，不另抄一份——抄了就会两处不一致。
 */

interface AssetRow {
  asset: string;
  authors: string;
  license: string;
  sources: { label: string; href: string }[];
}

const CREDITS_PATH = join(process.cwd(), 'assets', 'lpc', 'CREDITS.md');

function parseCredits(md: string): { authors: string[]; rows: AssetRow[] } {
  const lines = md.split('\n');

  const authorsHeading = lines.findIndex((l) => l.startsWith('## 作者名单'));
  const authorsLine = lines.slice(authorsHeading + 1).find((l) => l.trim().length > 0) ?? '';
  const authors = authorsLine
    .split('、')
    .map((s) => s.trim())
    .filter(Boolean);

  const rows: AssetRow[] = [];
  for (const line of lines) {
    if (!line.startsWith('| `')) continue;
    const cells = line
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'));
    if (cells.length < 5) continue;
    const [asset, authorsCell, license, , sourceCell] = cells;
    const sources: AssetRow['sources'] = [];
    for (const m of sourceCell.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
      sources.push({ label: m[1], href: m[2] });
    }
    rows.push({ asset: asset.replace(/`/g, ''), authors: authorsCell, license, sources });
  }
  return { authors, rows };
}

export default function CreditsPage() {
  const lang = DEFAULT_LANG;
  const dict = getDict(lang);
  const { authors, rows } = parseCredits(readFileSync(CREDITS_PATH, 'utf8'));

  return (
    <main className="relative min-h-dvh">
      <GroundBackdrop />
      <div className="relative">
        <SiteHeader current={null} lang={lang} narrow />

        <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-8">
          <h1 className="pixel-outline mb-2 mt-4 text-2xl sm:text-3xl">{dict.footer.credits}</h1>
          <p className="mb-6 max-w-2xl text-[13px] leading-relaxed text-[var(--color-ghost)]">
            本站的像素角色由{' '}
            <a
              href="https://lpc.opengameart.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-parchment)] underline decoration-dotted underline-offset-2"
            >
              Liberated Pixel Cup
            </a>{' '}
            社区的分层素材程序化合成。只使用了提供 CC0 或 OGA-BY 3.0 许可选项的素材，
            下面是全部 {rows.length} 个素材目录与 {authors.length} 位作者。
            合成器为本项目自研，未使用上游生成器的任何代码。
          </p>

          <section className="pixel-panel-dark mb-6 p-4">
            <h2 className="mb-2 font-pixel text-[14px] text-[var(--color-gold)]">作者</h2>
            <p className="text-[13px] leading-relaxed text-[var(--color-parchment)]">{authors.join('、')}</p>
          </section>

          <section className="pixel-panel-dark mb-6 p-4">
            <h2 className="mb-2 font-pixel text-[14px] text-[var(--color-gold)]">数据</h2>
            <ul className="space-y-1 text-[13px] leading-relaxed text-[var(--color-parchment)]">
              <li>
                评测成绩：Epoch AI《AI Benchmarking Hub》，CC-BY 4.0。本站按榜单分列展示，不做跨榜混算。
              </li>
              <li>模型元数据（发布日期、定价、上下文）：models.dev，MIT；缺项时由 LiteLLM、OpenRouter、Vercel AI Gateway 公开目录补齐事实字段。</li>
              <li>编程分项：LiveBench，Apache-2.0。</li>
              {/*
                CC-BY 4.0 要求四件事：署创作者、给许可名与链接、给材料链接、声明改动。
                前三项在这一句里，第四项是后半句——少了它就是违约。
              */}
              <li>
                竞技场成绩（文生图、文生视频、图像与视频编辑、文本、搜索、文档）：
                <a
                  href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted hover:text-[var(--color-gold)]"
                >
                  LMArena 官方榜单数据集
                </a>
                ，
                <a
                  href="https://creativecommons.org/licenses/by/4.0/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted hover:text-[var(--color-gold)]"
                >
                  CC-BY 4.0
                </a>
                。本站做过两处改动：把上游的模型名匹配到站内的模型条目，以及按本站的赛制分列重新排序；
                分数本身原样引用，未做换算。这些分数是真人盲投的偏好分，与学术评测不可比，因此单独成榜。
              </li>
              <li>中文像素字体：Fusion Pixel Font（缝合像素字体），OFL-1.1。</li>
            </ul>
          </section>

          <section className="pixel-panel-dark overflow-x-auto p-4">
            <h2 className="mb-2 font-pixel text-[14px] text-[var(--color-gold)]">逐素材明细</h2>
            <table className="w-full text-left text-[12px] leading-snug">
              <thead className="text-[var(--color-ghost)]">
                <tr>
                  <th className="pb-1 pr-3 font-normal">素材</th>
                  <th className="pb-1 pr-3 font-normal">作者</th>
                  <th className="pb-1 pr-3 font-normal">许可</th>
                  <th className="pb-1 font-normal">来源</th>
                </tr>
              </thead>
              <tbody className="text-[var(--color-parchment)]">
                {rows.map((r) => (
                  <tr key={r.asset} className="border-t border-white/5 align-top">
                    <td className="py-1 pr-3 font-mono text-[12px] text-[var(--color-ghost)]">{r.asset}</td>
                    <td className="py-1 pr-3">{r.authors}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{r.license}</td>
                    <td className="py-1">
                      {r.sources.map((s, i) => (
                        <a
                          key={`${s.href}-${i}`}
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mr-1.5 underline decoration-dotted underline-offset-2 hover:text-[var(--color-gold)]"
                        >
                          [{s.label}]
                        </a>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </main>
  );
}
