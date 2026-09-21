'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * 把组件状态同步到地址栏的 query，让筛选结果可以直接复制链接分享。
 *
 * 不用 `useSearchParams`：在 `output: 'export'` 的静态导出下它会让整棵客户端子树
 * 退化成纯客户端渲染，首屏 HTML 里就没有榜单了。这里改成挂载后读一次
 * `window.location`，写入走 `history.replaceState`——首屏仍是服务端预渲染的默认赛道，
 * 带参数访问时在水合后的第一帧切换过去。
 *
 * 服务端渲染阶段返回 null，调用方据此使用默认状态。
 */
export function useUrlQuery(): [
  URLSearchParams | null,
  (patch: Record<string, string | null>) => void,
] {
  const [params, setParams] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const read = () => setParams(new URLSearchParams(window.location.search));
    read();
    // 浏览器前进/后退时 query 会变，跟着刷新
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  const update = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev ?? window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
      window.history.replaceState(window.history.state, '', url);
      return next;
    });
  }, []);

  return [params, update];
}
