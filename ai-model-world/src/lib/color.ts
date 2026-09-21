/**
 * 厂商主色直接拿来当深色背景上的文字或剪影会出问题——
 * xAI 的品牌色是近乎纯黑的 #1d1d1f，画在夜色地面上等于隐形。
 * 这里把过暗的颜色按需提亮，但保留色相，让品牌识别度不丢。
 */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function toHex(rgb: [number, number, number]): string {
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** WCAG 相对亮度 */
function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * 提亮到至少 minLum 的相对亮度。
 * 纯灰阶色（品牌色是黑或白的情况）没有色相可保，直接抬到中性亮灰。
 */
export function readableOnDark(hex: string, minLum = 0.22): string {
  let rgb = parseHex(hex);
  if (luminance(rgb) >= minLum) return hex;

  const maxChannel = Math.max(...rgb);
  if (maxChannel < 12) {
    // 近乎纯黑，没有色相信息可以保留
    return '#c8ccd8';
  }

  // 按比例整体提亮，保持通道比值即保持色相
  for (let i = 0; i < 24 && luminance(rgb) < minLum; i++) {
    rgb = [rgb[0] * 1.18 + 6, rgb[1] * 1.18 + 6, rgb[2] * 1.18 + 6] as [number, number, number];
  }
  return toHex(rgb);
}
