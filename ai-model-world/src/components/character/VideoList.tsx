import { BiliLink } from './BiliLink';
import { formatView, type VideoRecord } from '@/lib/videos';

/**
 * 详情页底部的 B 站实测视频。
 *
 * 内容来自 B 站公开搜索接口按「{模型名} 测评」搜到的结果，经 `src/lib/videos.ts`
 * 那条严格规则筛过（标题里必须出现模型名），最多 12 条。
 *
 * **每张卡上都印着 UP 主名字。** 这些是站外用户的作品，不是本站的评测结论，
 * 谁做的必须一眼可见；站长自己的视频额外打一个「站长」标并置顶。
 *
 * 封面 `<img>` **必须带 `referrerPolicy="no-referrer"`**：hdslb 有防盗链，
 * 带着非 bilibili 的 Referer 去取会吃 403，浏览器再报 `ERR_BLOCKED_BY_ORB`，图全白。
 * 用原生 `<img loading="lazy">` 而不是 next/image：站点是静态导出且 `images.unoptimized`，
 * next/image 在这里只会多一层包装，还要额外配 remotePatterns。
 */
export function VideoList({
  videos,
  modelName,
  keyword,
  authorMid,
}: {
  videos: VideoRecord[];
  modelName: string;
  keyword: string;
  authorMid: number;
}) {
  if (videos.length === 0) return null;
  const searchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(`${modelName} ${keyword}`)}`;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm text-[var(--color-parchment)]">
          B 站上的 {modelName} 实测
          <span className="ml-3 text-[12px] text-[var(--color-ghost)]">{videos.length} 个视频</span>
        </h2>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-[var(--color-ghost)] hover:text-[var(--color-gold)]"
        >
          在 B 站搜「{modelName} {keyword}」↗
        </a>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((v) => (
          <li key={v.bvid}>
            <BiliLink
              bvid={v.bvid}
              title={`${v.title} · ${v.author}`}
              className="pixel-panel-dark group flex h-full flex-col overflow-hidden transition-transform duration-150 hover:-translate-y-0.5"
            >
              <span className="relative block aspect-video overflow-hidden bg-[var(--color-plate)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.cover}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
                {v.mid === authorMid && (
                  <span
                    className="absolute left-1 top-1 px-1 text-[11px] font-semibold leading-tight text-[var(--color-ink)]"
                    style={{ background: 'var(--color-gold)' }}
                  >
                    站长
                  </span>
                )}
                <span
                  className="absolute bottom-1 right-1 px-1 font-pixel text-[12px] leading-tight text-[var(--color-parchment-lit)]"
                  style={{ background: 'rgb(0 0 0 / 0.7)' }}
                >
                  {v.duration}
                </span>
                <span
                  className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'rgb(0 0 0 / 0.35)' }}
                  aria-hidden
                >
                  <PlayBadge />
                </span>
              </span>

              <span className="flex flex-1 flex-col gap-1 px-2 py-2">
                <span className="line-clamp-2 text-[13px] leading-snug text-[var(--color-parchment)] group-hover:text-[var(--color-gold)]">
                  {v.title}
                </span>
                <span className="truncate text-[12px] leading-tight text-[var(--color-parchment-dim)]">
                  {v.author}
                </span>
                <span className="mt-auto flex items-center gap-2 font-pixel text-[12px] leading-none text-[var(--color-ghost)]">
                  <span>{v.date.replace(/-/g, '.')}</span>
                  <span>·</span>
                  <span>{formatView(v.view)}播放</span>
                </span>
              </span>
            </BiliLink>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-ghost)]">
        以上为 B 站搜索结果，按播放量排（站长的视频置顶），内容由各 UP 主提供，不代表本站观点。
      </p>
    </section>
  );
}

function PlayBadge() {
  return (
    <svg width={32} height={32} viewBox="0 0 16 16" shapeRendering="crispEdges">
      <rect x="1" y="1" width="14" height="14" fill="rgb(0 0 0 / 0.55)" />
      <rect x="1" y="1" width="14" height="1" fill="var(--color-gold)" />
      <rect x="1" y="14" width="14" height="1" fill="var(--color-gold)" />
      <rect x="1" y="1" width="1" height="14" fill="var(--color-gold)" />
      <rect x="14" y="1" width="1" height="14" fill="var(--color-gold)" />
      <rect x="6" y="4" width="1" height="8" fill="var(--color-gold)" />
      <rect x="7" y="5" width="1" height="6" fill="var(--color-gold)" />
      <rect x="8" y="6" width="1" height="4" fill="var(--color-gold)" />
      <rect x="9" y="7" width="1" height="2" fill="var(--color-gold)" />
    </svg>
  );
}
