import type { Trait, TraitTone } from '@/lib/traits';

/**
 * 特征标签牌。
 *
 * 刻意做得比屋里其它元素都醒目——这是整间屋子最先该被读到的东西。
 * 颜色分五档：金色是榜首类，绿色是「便宜、新、开源」这类好消息，
 * 蓝色是能力，红色是贵，灰色是老与退役。
 */

const TONE: Record<TraitTone, { bg: string; fg: string; border: string }> = {
  crown: { bg: '#f5d76e', fg: '#1a1526', border: '#a8912f' },
  good: { bg: '#7ee787', fg: '#12301a', border: '#3f9a4c' },
  cool: { bg: '#68c7f0', fg: '#0d2431', border: '#2a7fa3' },
  costly: { bg: '#ef7a6f', fg: '#31100c', border: '#a8433a' },
  aged: { bg: '#8b95b5', fg: '#191b26', border: '#535b75' },
};

export function TraitTags({ traits }: { traits: Trait[] }) {
  if (traits.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {traits.map((t, i) => {
        const tone = TONE[t.tone];
        return (
          <span
            key={t.id}
            title={t.title}
            // 标签是中文短句，必须用无衬线体。
            // 中文像素字在 12px 上笔画会粘连，而这块牌子恰恰是整间屋子最该被读清楚的东西——
            // 游戏感靠像素画和硬边框来给，不靠把字弄糊。
            // 窄屏屋子只有 172px，第三块牌子会折到第二行把整排卡片的基线撑歪，所以只在 sm 以上露面。
            className={`text-[13px] font-semibold leading-none ${i >= 2 ? 'hidden sm:inline' : ''}`}
            style={{
              background: tone.bg,
              color: tone.fg,
              padding: '4px 6px 5px',
              letterSpacing: '0.02em',
              // 像素风的硬边框，不用圆角
              boxShadow: `inset 0 0 0 1px ${tone.border}, 2px 2px 0 0 rgb(0 0 0 / 0.35)`,
            }}
          >
            {t.label}
          </span>
        );
      })}
    </div>
  );
}
