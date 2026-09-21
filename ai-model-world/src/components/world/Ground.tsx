/**
 * 地平线以下的地面。
 *
 * 纹理全部用 repeating-linear-gradient 画，不加载图片：
 * 石板缝隙 + 细微的颗粒噪点，够撑起「这是一块实地」的感觉，又不喧宾夺主。
 */

/**
 * 天空与地面的交界。三层横带：受光草皮、背光草皮、泥土。
 * 早先试过给草皮加锯齿断面，结果在整屏宽度上重复成了一排栅栏——
 * 像素风里规则重复的高频图案会变成图案本身，不再是「边缘」。
 */
export function HorizonEdge() {
  return (
    <div className="relative w-full" aria-hidden>
      <div className="h-1.5" style={{ background: '#6d9e73' }} />
      <div className="h-2.5" style={{ background: 'var(--color-grass)' }} />
      <div className="h-2" style={{ background: 'var(--color-grass-dark)' }} />
      <div className="h-1.5" style={{ background: 'var(--color-stone-dark)' }} />
    </div>
  );
}

/**
 * 页面底色。
 *
 * 第一版画了石板缝（横竖两组 2px 深线，40×64 的砖砌网格）。像素风里这很「地面」，
 * 但整页都是文字卡片压在网格上，用户反馈网格一直在干扰阅读——
 * 眼睛会不自觉地去追那些线。现在只留一块平色加极淡的上下渐变，地面感交给天空
 * 下面那条草皮带（HorizonEdge）去给，正文后面必须是安静的。
 */
export function GroundBackdrop({ className = '' }: { className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${className}`}
      aria-hidden
      style={{
        backgroundColor: 'var(--color-ground)',
        backgroundImage:
          // 顶部承接天空的余光，往下渐渐沉进夜色
          'linear-gradient(180deg, rgb(233 166 99 / 0.05) 0%, transparent 360px), linear-gradient(180deg, transparent 60%, rgb(0 0 0 / 0.18) 100%)',
      }}
    />
  );
}
