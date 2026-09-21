import { APTITUDES, type AptitudeRow } from '@/lib/aptitude';

/**
 * 四条能力横条。
 *
 * 画成分段的方块而不是连续的进度条，是为了让它读起来像 JRPG 的状态栏
 * 而不像后台管理系统。方块数固定，格数一眼可数，横向扫过一排卡片时
 * 「谁的格子多」比「谁的条长」更快分辨。
 *
 * 缺数据的那一条画成带斜纹的空槽加问号，与填了 0 格的条在视觉上截然不同——
 * 「没测过」和「得了零分」必须一眼可辨，这是全站数据诚信原则的界面落点。
 */

const SEGMENTS = 8;

/** 排在越前面的能力用越暖的色，方便横向扫的时候按位置记住哪条是哪条 */
const TONE: Record<string, string> = {
  smart: 'var(--color-gold)',
  code: '#7fd4ff',
  memory: '#9ae6a0',
  cheap: '#ffb27f',
};

function Bar({
  fill,
  color,
  compact,
}: {
  fill: number | null;
  color: string;
  compact: boolean;
}) {
  const w = compact ? 7 : 9;
  const h = compact ? 7 : 9;
  const gap = 2;
  const total = SEGMENTS * (w + gap) - gap;

  if (fill == null) {
    return (
      <svg
        viewBox={`0 0 ${total} ${h}`}
        width={total}
        height={h}
        shapeRendering="crispEdges"
        className="shrink-0"
        aria-hidden
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <rect
            key={i}
            x={i * (w + gap)}
            y={0}
            width={w}
            height={h}
            fill="none"
            stroke="rgb(255 255 255 / 0.16)"
            strokeWidth={1}
          />
        ))}
      </svg>
    );
  }

  // 向上取整，保证有数据但分位极低的模型也至少亮一格：
  // 一格都不亮会和「没数据」的空槽混淆。
  const lit = Math.max(1, Math.ceil(fill * SEGMENTS));

  return (
    <svg
      viewBox={`0 0 ${total} ${h}`}
      width={total}
      height={h}
      shapeRendering="crispEdges"
      className="shrink-0"
      aria-hidden
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <rect
          key={i}
          x={i * (w + gap)}
          y={0}
          width={w}
          height={h}
          fill={i < lit ? color : 'rgb(255 255 255 / 0.08)'}
        />
      ))}
    </svg>
  );
}

export interface AbilityBarsProps {
  row: AptitudeRow;
  /** 卡片上用紧凑版，详情页用大号 */
  compact?: boolean;
  /** 当前排序依据的那一条会被高亮，给用户一个「我正在按什么排」的锚点 */
  highlight?: string | null;
}

export function AbilityBars({ row, compact = false, highlight = null }: AbilityBarsProps) {
  return (
    <div className={compact ? 'flex flex-col gap-[3px]' : 'flex flex-col gap-1.5'}>
      {APTITUDES.map((apt) => {
        const v = row.values[apt.id];
        const on = highlight === apt.id;
        return (
          <div
            key={apt.id}
            className="flex items-center gap-1.5"
            style={{
              // 高亮不用边框，边框会让这一行变高、把整排卡片的基线顶歪
              background: on ? 'rgb(255 255 255 / 0.07)' : undefined,
            }}
            title={`${apt.label}｜${apt.blurb}\n\n${v.title}`}
          >
            <span
              className={`shrink-0 ${compact ? 'text-[12px]' : 'text-[14px]'} leading-none`}
              style={{ color: on ? TONE[apt.id] : 'rgb(255 255 255 / 0.55)', width: compact ? 24 : 30 }}
            >
              {v.labelOverride ?? apt.label}
            </span>
            <Bar fill={v.fill} color={TONE[apt.id]} compact={compact} />
            <span
              className={`ml-auto flex shrink-0 items-baseline gap-0.5 tabular-nums ${
                compact ? 'text-[12px]' : 'text-[14px]'
              } leading-none`}
              style={{ color: v.fill == null ? 'rgb(255 255 255 / 0.3)' : 'var(--color-parchment)' }}
            >
              {v.literal ?? '暂无'}
              {/*
                厂商自报的分数必须当场标出来。悬停提示里写了不算数——
                一屏几十张卡片，没人会去悬停，而 95（自报）和 78（第三方实测）
                摆在一起不加标注，读者一定会得出错误结论。
              */}
              {v.selfReported && (
                <span
                  className="shrink-0 text-[11px] leading-none"
                  style={{ color: 'rgb(255 255 255 / 0.4)' }}
                >
                  自报
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
