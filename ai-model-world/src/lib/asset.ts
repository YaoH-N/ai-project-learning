/**
 * 静态资源前缀。
 *
 * 平时这个站挂在域名根上，`/sprites/x.png` 怎么写怎么对。但作为 B 站 Toy 发布时，
 * 页面跑在 `https://www.bilibili.com/toy/<slug>/` 这个子路径下，
 * 根绝对路径会解析到 bilibili.com 的站点根，精灵图、字体、搜索索引全部 404，
 * 整页只剩一片黑——这是 Toy 平台官方内容清单里排第一位的高频坑。
 *
 * Next 自己会给 `next/link` 的跳转和 `_next/` 下的构建产物加 `basePath`，
 * 但它管不到我们手写在内联样式里的 `url(/sprites/...)` 和 `fetch('/search-index.json')`。
 * 这个函数就补这一段，取值来自构建期注入的 `NEXT_PUBLIC_BASE_PATH`，
 * 不设时返回原样，所以普通部署完全不受影响。
 *
 * 字体是唯一的例外：它写在 `globals.css` 的 `@font-face` 里，构建期拿不到环境变量，
 * 那边改用相对路径解决（CSS 产物固定落在 `_next/static/chunks/`，往上三级正好是站点根）。
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** 给以 `/` 开头的公共资源路径加上部署前缀 */
export function asset(path: string): string {
  return BASE ? `${BASE}${path}` : path;
}
