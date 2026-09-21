/**
 * 角色房间里的家具。
 *
 * 全部用程序化生成的 SVG 像素图，而不是手绘的若干张变体图：
 * 书架的层数、电脑的屏数、黑板上的公式密度本身就是数据档位，
 * 用循环生成既省掉几十张手绘，也保证「档位变了图必然跟着变」，不会出现图与数据脱节。
 *
 * 所有图形都对齐整数像素网格并用 shapeRendering="crispEdges"，缩放到任意尺寸都锐利。
 */

import type { ComputerTier, Tier } from '@/lib/derive';

interface PixelSvgProps {
  width: number;
  height: number;
  size: number;
  children: React.ReactNode;
  title: string;
}

function PixelSvg({ width, height, size, children, title }: PixelSvgProps) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * size}
      height={height * size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

const WOOD = '#6b4a2f';
const WOOD_DARK = '#4a3220';
const METAL = '#5a6273';
const METAL_DARK = '#3a4150';
const SCREEN_OFF = '#1d2430';
const SCREEN_ON = '#4cc9f0';

/**
 * 电脑，档次来自 SWE-bench Verified 成绩。
 * 无数据时是一张空桌——不能因为没成绩就随便配一台，那是编造。
 */
export function Computer({
  tier,
  size = 3,
  title,
  flicker = false,
  dim = false,
}: {
  tier: ComputerTier;
  size?: number;
  title: string;
  /** 屏幕微弱闪烁，让房间里有「正在运行」的活气 */
  flicker?: boolean;
  /** 成绩来自厂商自评而非第三方复跑时屏幕不亮，一眼可辨可信度 */
  dim?: boolean;
}) {
  const monitors: Record<ComputerTier, { count: number; w: number; h: number; glow: boolean }> = {
    none: { count: 0, w: 0, h: 0, glow: false },
    crt: { count: 1, w: 8, h: 7, glow: false },
    laptop: { count: 1, w: 11, h: 7, glow: true },
    dual: { count: 2, w: 9, h: 8, glow: true },
    battlestation: { count: 3, w: 8, h: 9, glow: true },
  };
  const m = monitors[tier];
  const W = 32;
  const H = 24;
  const deskY = 19;

  // 「没有编程评测数据」和「不会写代码」是两回事。
  // 早先两者都画成一张空桌，那根横线在页面上什么也没传达，
  // 而且容易被读成「这个模型不会编程」。改成盖着防尘布、上面立一个问号牌。
  if (tier === 'none') {
    return (
      <PixelSvg width={W} height={H} size={size} title={title}>
        <rect x={2} y={deskY} width={W - 4} height={2} fill={WOOD} />
        <rect x={3} y={deskY + 2} width={2} height={3} fill={WOOD_DARK} />
        <rect x={W - 5} y={deskY + 2} width={2} height={3} fill={WOOD_DARK} />
        {/* 防尘布：一块起伏的灰布罩住桌面上的东西 */}
        <rect x={6} y={deskY - 7} width={20} height={7} fill="#4b4260" />
        <rect x={7} y={deskY - 9} width={18} height={2} fill="#5a5170" />
        <rect x={9} y={deskY - 10} width={14} height={1} fill="#5a5170" />
        <rect x={6} y={deskY - 1} width={4} height={1} fill="#3c3550" />
        <rect x={13} y={deskY - 1} width={5} height={1} fill="#3c3550" />
        <rect x={21} y={deskY - 1} width={5} height={1} fill="#3c3550" />
        {/* 问号：明确表示未知而非没有 */}
        <rect x={14} y={deskY - 6} width={3} height={1} fill="#8b95b5" />
        <rect x={17} y={deskY - 5} width={1} height={1} fill="#8b95b5" />
        <rect x={15} y={deskY - 4} width={2} height={1} fill="#8b95b5" />
        <rect x={15} y={deskY - 2} width={1} height={1} fill="#8b95b5" />
      </PixelSvg>
    );
  }

  const screens = [];
  const totalW = m.count * m.w + (m.count - 1);
  const startX = Math.round((W - totalW) / 2);
  for (let i = 0; i < m.count; i++) {
    const x = startX + i * (m.w + 1);
    const y = deskY - m.h - 1;
    screens.push(
      <g key={i} className={flicker && m.glow ? 'anim-screen' : undefined}>
        <rect x={x} y={y} width={m.w} height={m.h} fill={METAL_DARK} />
        <rect
          x={x + 1}
          y={y + 1}
          width={m.w - 2}
          height={m.h - 3}
          fill={m.glow && !dim ? SCREEN_ON : SCREEN_OFF}
          opacity={m.glow && !dim ? 0.85 : 1}
        />
        {/* 屏幕上的代码行，密度随档次提高 */}
        {m.glow &&
          !dim &&
          Array.from({ length: Math.min(4, m.h - 4) }, (_, r) => (
            <rect
              key={r}
              x={x + 2}
              y={y + 2 + r * 2}
              width={m.w - 4 - ((r * 3) % 4)}
              height={1}
              fill="#0b1622"
              opacity={0.5}
            />
          ))}
        <rect x={x + Math.floor(m.w / 2) - 1} y={y + m.h} width={2} height={1} fill={METAL} />
      </g>,
    );
  }

  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      {/* 桌面与桌腿 */}
      <rect x={2} y={deskY} width={W - 4} height={2} fill={WOOD} />
      <rect x={3} y={deskY + 2} width={2} height={3} fill={WOOD_DARK} />
      <rect x={W - 5} y={deskY + 2} width={2} height={3} fill={WOOD_DARK} />
      {screens}
      {/* 键盘。空桌就什么都不放。 */}
      {m.count > 0 && <rect x={11} y={deskY - 1} width={10} height={1} fill={METAL} />}
      {tier === 'battlestation' && (
        <rect x={11} y={deskY - 1} width={10} height={1} fill="#f5d76e" opacity={0.8} />
      )}
    </PixelSvg>
  );
}

/**
 * 书架，层数来自上下文窗口大小。
 * `dust` 是「标称很大但长文本实测很差」的落灰程度，上层书架会蒙灰。
 */
export function Bookshelf({
  tier,
  dust,
  size = 3,
  title,
  muted = false,
}: {
  tier: Tier;
  dust: number | null;
  size?: number;
  title: string;
  /**
   * 降为场景陈设。
   *
   * 广场上「记性」这条已经由能力条如实给出，书架就不再是信息通道了。
   * 而它偏偏是屋里最抢眼的东西——满格的彩色书脊比角色本身还跳，
   * 且四成屋子的书架完全一样（上下文窗口普遍到了百万级）。
   * 降饱和之后视线会先落到角色和能力条上，这才是该被先读到的东西。
   * 详情页不传这个参数，书架仍然是原来的样子。
   */
  muted?: boolean;
}) {
  const W = 24;
  const SHELF_H = 6;
  const H = tier * SHELF_H + 2;
  const bookColors = muted
    ? ['#6b5a52', '#55665c', '#4a5570', '#7a6a56', '#5e5470', '#4c5f6e']
    : ['#c8553d', '#4a7c59', '#3859ff', '#f2a65a', '#8b5cf6', '#0ea5e9'];

  const shelves = [];
  for (let s = 0; s < tier; s++) {
    const y = H - (s + 1) * SHELF_H;
    // 越上层落灰越重
    const dustHere = dust == null ? 0 : Math.max(0, dust * ((s + 1) / tier));
    const books = [];
    let x = 2;
    let i = 0;
    while (x < W - 3) {
      const w = 2 + ((s * 7 + i * 3) % 3);
      books.push(
        <rect
          key={i}
          x={x}
          y={y + 1}
          width={w}
          height={SHELF_H - 2}
          fill={bookColors[(s * 3 + i) % bookColors.length]}
          opacity={1 - dustHere * 0.65}
        />,
      );
      x += w + 1;
      i++;
    }
    shelves.push(
      <g key={s}>
        {books}
        <rect x={0} y={y + SHELF_H - 1} width={W} height={1} fill={WOOD_DARK} />
        {dustHere > 0.15 && (
          <rect x={1} y={y} width={W - 2} height={1} fill="#8b95b5" opacity={dustHere * 0.8} />
        )}
      </g>,
    );
  }

  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      <rect x={0} y={0} width={W} height={H} fill={WOOD} />
      <rect x={1} y={1} width={W - 2} height={H - 2} fill="var(--color-floor)" />
      {shelves}
    </PixelSvg>
  );
}

/** 墙上的日历，停摆在模型的知识截止日期那一天 */
export function Calendar({ label, size = 3, title }: { label: string; size?: number; title: string }) {
  const W = 20;
  const H = 18;
  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      <rect x={0} y={2} width={W} height={H - 2} fill="#f3e9d2" />
      <rect x={0} y={2} width={W} height={4} fill="#c8553d" />
      <rect x={4} y={0} width={2} height={4} fill={METAL} />
      <rect x={W - 6} y={0} width={2} height={4} fill={METAL} />
      {/* 日期格。缺数据时留空格，不编造。 */}
      {label
        ? Array.from({ length: 3 }, (_, r) =>
            Array.from({ length: 5 }, (_, c) => (
              <rect
                key={`${r}-${c}`}
                x={2 + c * 3.4}
                y={8 + r * 3.4}
                width={2}
                height={2}
                fill={r === 1 && c === 2 ? '#c8553d' : '#c3b394'}
              />
            )),
          )
        : null}
    </PixelSvg>
  );
}

/** 黑板，公式密度随数学与科学推理成绩提高 */
export function Blackboard({
  density,
  size = 3,
  title,
}: {
  density: number;
  size?: number;
  title: string;
}) {
  const W = 30;
  const H = 20;
  const lines = Math.round(density * 5);
  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      <rect x={0} y={0} width={W} height={H} fill={WOOD_DARK} />
      <rect x={1} y={1} width={W - 2} height={H - 4} fill="#1f3328" />
      {Array.from({ length: lines }, (_, r) => {
        const y = 3 + r * 3;
        const segs = 2 + ((r * 5) % 3);
        return (
          <g key={r}>
            {Array.from({ length: segs }, (_, s) => (
              <rect
                key={s}
                x={3 + s * 8 + ((r * 3) % 3)}
                y={y}
                width={4 + ((r + s) % 3)}
                height={1}
                fill="#e8e4d8"
                opacity={0.8}
              />
            ))}
          </g>
        );
      })}
      <rect x={1} y={H - 3} width={W - 2} height={2} fill={WOOD} />
    </PixelSvg>
  );
}

/** 墙角的冰箱，支持上下文缓存的模型才有——用来存记忆 */
export function Fridge({ size = 3, title }: { size?: number; title: string }) {
  const W = 14;
  const H = 22;
  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      <rect x={0} y={0} width={W} height={H} fill="#cbd5e1" />
      <rect x={1} y={1} width={W - 2} height={7} fill="#e2e8f0" />
      <rect x={1} y={9} width={W - 2} height={H - 10} fill="#e2e8f0" />
      <rect x={W - 4} y={4} width={1} height={3} fill={METAL} />
      <rect x={W - 4} y={12} width={1} height={4} fill={METAL} />
      {/* 冰箱贴 */}
      <rect x={3} y={12} width={3} height={3} fill="#f5d76e" />
      <rect x={3} y={17} width={4} height={2} fill="#4cc9f0" />
    </PixelSvg>
  );
}

/** 门禁：开源模型的大门敞开无围墙，闭源模型有围墙与门锁 */
export function Gate({ open, size = 3, title }: { open: boolean; size?: number; title: string }) {
  const W = 24;
  const H = 20;
  return (
    <PixelSvg width={W} height={H} size={size} title={title}>
      {open ? (
        <>
          {/* 两根门柱，中间空着 */}
          <rect x={1} y={2} width={3} height={H - 2} fill={WOOD} />
          <rect x={W - 4} y={2} width={3} height={H - 2} fill={WOOD} />
          <rect x={1} y={0} width={W - 2} height={2} fill={WOOD_DARK} />
          {/* 敞开的门扇向内折 */}
          <rect x={4} y={4} width={1} height={H - 4} fill={WOOD_DARK} />
          <rect x={W - 5} y={4} width={1} height={H - 4} fill={WOOD_DARK} />
        </>
      ) : (
        <>
          <rect x={0} y={0} width={W} height={H} fill={METAL_DARK} />
          <rect x={1} y={1} width={W - 2} height={H - 2} fill={METAL} />
          {/* 门缝与锁 */}
          <rect x={W / 2 - 1} y={1} width={2} height={H - 2} fill={METAL_DARK} />
          <rect x={W / 2 - 3} y={H / 2 - 2} width={6} height={4} fill="#f5d76e" />
          <rect x={W / 2 - 1} y={H / 2 - 1} width={2} height={2} fill={METAL_DARK} />
        </>
      )}
    </PixelSvg>
  );
}
