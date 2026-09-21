'use client';

import type { ReactNode } from 'react';

/**
 * 指向 B 站视频的链接。
 *
 * 这个站要作为 B 站 Toy 跑，所以在 Toy 容器里不能直接把 WebView 导航到视频页——
 * 那样会把用户从 Toy 里顶出去。Toy SDK 提供了 `toy.navigate({ type: 'video' })`，
 * 由客户端原生打开播放页，Toy 本身留在后台。SDK 要求由用户手势触发，点击正好满足。
 *
 * 不在 Toy 里（普通网页、被人直接访问）时就是一个再普通不过的 `<a target="_blank">`。
 * SDK 没加载、调用抛错，都退回这条路——这一整块是锦上添花，不该因为环境不对就点不动。
 */

interface ToyBridge {
  navigate?: (req: { type: string; id: string; extra?: Record<string, string> }) => Promise<void>;
}

export function BiliLink({
  bvid,
  className,
  title,
  children,
}: {
  bvid: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const href = `https://www.bilibili.com/video/${bvid}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className={className}
      onClick={(e) => {
        const toy = (window as unknown as { toy?: ToyBridge }).toy;
        if (!toy?.navigate) return;
        e.preventDefault();
        void toy.navigate({ type: 'video', id: bvid, extra: { from: 'ai-model-world' } }).catch(() => {
          window.open(href, '_blank', 'noopener');
        });
      }}
    >
      {children}
    </a>
  );
}
