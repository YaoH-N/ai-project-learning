import { CREST_SIZE, crestFor } from '@/data/crests';
import { readableOnDark } from '@/lib/color';

/**
 * 厂商家徽。把 12×12 的字符画渲染成内联 SVG。
 *
 * 用 SVG 而不是图片：任意尺寸都锐利、不增加请求、颜色可以随厂商配色实时变化。
 * `shapeRendering="crispEdges"` 保证像素格不被抗锯齿糊掉。
 */

interface VendorCrestProps {
  motif: string;
  /** 厂商主色。过暗的会被自动提亮，否则在夜色背景上等于隐形。 */
  accentColor: string;
  /** 显示边长，单位像素。建议取 12 的整数倍以保证像素对齐。 */
  size?: number;
  className?: string;
  title?: string;
}

export function VendorCrest({
  motif,
  accentColor,
  size = 24,
  className = '',
  title,
}: VendorCrestProps) {
  const grid = crestFor(motif);
  const base = readableOnDark(accentColor, 0.18);
  const colors: Record<string, string> = {
    '#': base,
    o: readableOnDark(accentColor, 0.55),
    '+': 'rgb(0 0 0 / 0.55)',
  };

  const cells: { x: number; y: number; fill: string }[] = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const fill = colors[row[x]];
      if (fill) cells.push({ x, y, fill });
    }
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${CREST_SIZE} ${CREST_SIZE}`}
      shapeRendering="crispEdges"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title && <title>{title}</title>}
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={1} height={1} fill={c.fill} />
      ))}
    </svg>
  );
}
