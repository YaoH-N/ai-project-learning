import Link from 'next/link';
import type { CharacterVisual } from '@/lib/derive';
import type { ModelRecord } from '@/lib/types';
import {
  bookshelfOf,
  shelfDustOf,
  type Scales,
  type SweLeague,
  type VisualPruning,
} from '@/lib/derive';
import { profileFor } from '@/data/vendor-registry';
import { readableOnDark } from '@/lib/color';
import { VendorCrest } from './VendorCrest';
import { StatRow } from './StatRow';
import { TraitTags } from './TraitTags';
import { AbilityBars } from './AbilityBars';
import type { AptitudeRow } from '@/lib/aptitude';
import { StateOverlays } from './StateOverlays';
import { anchorsFor } from '@/lib/sprite-manifest';
import { Bookshelf, Computer } from '@/components/room/Furniture';
import { getDict, type Lang } from '@/lib/i18n';
import type { Trait } from '@/lib/traits';
import { asset } from '@/lib/asset';

/**
 * 村落里的一间屋子，也是整个界面的核心单元。
 *
 * 经历过两次大改，第二次的教训值得写在最前面。
 *
 * 第一版把所有属性都编码进像素画：体型是参数量、衣服质地是价格、
 * 书架层数是上下文、桌上电脑档次是编程能力。这一版的问题不是不好看，
 * 而是**读者需要先背下一套映射表才看得懂**，而没有人会去看图例。
 * 实测十个编码维度里有六个在缩略尺寸下根本分辨不出来：
 * 一排书架长得一模一样，64 像素的小人身上看不出衣服质地。
 *
 * 第二版的原则是**画归画，数归数**。宝可梦图鉴不会因为喷火龙血厚就把它画大一圈，
 * 它在旁边画一根条。所以房间与角色保留下来负责「这是谁、好不好玩」，
 * 名牌下方新增四条能力横条与一句话人设，负责「它到底强在哪、我该拿它干嘛」。
 * 房间里的书架和电脑退居为场景陈设——它们仍然由数据驱动，
 * 只是不再独自承担传达信息的责任。
 */

/** 精灵表布局，与 public/sprites/manifest.json 对应 */
const SHEET_COLUMNS = 9;
const ROW_WALK_FRONT = 3;

/**
 * 屋子的尺寸走 CSS 变量（见 globals.css 的 --room-*），
 * 这样一个断点就能同时收窄屋子、压低层高、缩小角色，小屏才排得下两列。
 */
const ROOM_W = 'var(--room-w)';
const ROOM_H = 'var(--room-h)';
const FIGURE = 'var(--room-figure)';

/**
 * 体型档位的显示缩放，比广场远景那一版拉得更开。
 * 反馈是「人物之间的特征区别不太明显」，而 0.62–1.0 的跨度在小尺寸下几乎看不出来。
 * 拉到 0.5–1.06 之后最小档和最大档是两倍多的差距，扫一眼就能分出大小。
 */
const TIER_SCALE: Record<number, number> = { 1: 0.5, 2: 0.65, 3: 0.79, 4: 0.92, 5: 1.06 };

/** 稳定哈希，用来给每间屋子的呼吸动画错开相位 */
function phase(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return (h % 2600) / 1000;
}

/** 房龄决定墙面的斑驳程度。老模型的屋子该看起来旧。 */
const WEAR: Record<CharacterVisual['stage'], { wall: string; dim: number }> = {
  newborn: { wall: 'var(--color-wall-new)', dim: 0 },
  young: { wall: 'var(--color-wall-young)', dim: 0 },
  middle: { wall: 'var(--color-wall-mid)', dim: 0.12 },
  old: { wall: 'var(--color-wall-old)', dim: 0.26 },
  ghost: { wall: 'var(--color-wall-ghost)', dim: 0.5 },
  unknown: { wall: 'var(--color-wall-mid)', dim: 0.1 },
};

/** 屋顶：西岸是平顶带霓虹檐口，东方是层叠瓦檐 */
function Roof({ continent, color }: { continent: 'west' | 'east'; color: string }) {
  if (continent === 'east') {
    return (
      <svg
        viewBox="0 0 100 14"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        className="block h-[18px] w-full"
        aria-hidden
      >
        <rect x="0" y="6" width="100" height="8" fill={color} />
        <rect x="3" y="3" width="94" height="3" fill={color} opacity="0.75" />
        {/* 两端上翘的檐角 */}
        <rect x="0" y="3" width="5" height="3" fill={color} />
        <rect x="95" y="3" width="5" height="3" fill={color} />
        <rect x="0" y="10" width="100" height="2" fill="rgb(0 0 0 / 0.35)" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 100 14"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="block h-[18px] w-full"
      aria-hidden
    >
      <rect x="0" y="4" width="100" height="10" fill={color} />
      <rect x="0" y="2" width="100" height="2" fill={color} opacity="0.6" />
      <rect x="0" y="11" width="100" height="3" fill="rgb(0 0 0 / 0.35)" />
    </svg>
  );
}

/**
 * 编程成绩的赛制说明与可信度。
 * 只有第三方测出来的成绩才让屏幕亮起来——厂商自评的屏幕是暗的，
 * 一眼就能看出哪些分数经过了独立复核。
 */
export const SWE_LEAGUE: Record<SweLeague, { name: string; thirdParty: boolean }> = {
  epoch: { name: 'SWE-bench Verified · Epoch AI 统一复跑', thirdParty: true },
  vendor: { name: 'SWE-bench Verified · 厂商自报，未经第三方复核', thirdParty: false },
  'pro-scale': { name: 'SWE-Bench Pro · Scale AI 官方榜', thirdParty: true },
  'pro-vendor': { name: 'SWE-Bench Pro · 厂商系统卡自评，未经第三方复核', thirdParty: false },
};

export interface ModelRoomProps {
  model: ModelRecord;
  visual: CharacterVisual;
  continent: 'west' | 'east';
  lang: Lang;
  hasSprite: boolean;
  traits: Trait[];
  scales: Scales;
  /** 精灵图未烘焙状态层时为 true，由前端补画。避免画出双份皇冠。 */
  overlaysNeeded: boolean;
  /** 四条能力横条的取值 */
  aptitude: AptitudeRow;
  /** 一句话人设，由 src/lib/persona.ts 套模板生成，不经过任何 LLM */
  persona: string;
  /** 当前排序依据，对应的那条能力会被高亮 */
  highlight?: string | null;
  /** 广场层的视觉裁剪：出现率过高的元素不画，见 buildVisualPruning */
  pruning: VisualPruning;
}

export function ModelRoom({
  model,
  visual,
  continent,
  lang,
  hasSprite,
  traits,
  scales,
  overlaysNeeded,
  aptitude,
  persona,
  highlight = null,
  pruning,
}: ModelRoomProps) {
  const dict = getDict(lang);
  const profile = profileFor(visual.vendorId);
  // 屋顶用较暗的品牌色，厂商名要压在深色名牌上所以另取一档更亮的
  const accent = readableOnDark(profile.accentColor, 0.24);
  const nameColor = readableOnDark(profile.accentColor, 0.42);
  const wear = WEAR[visual.stage];
  const bob = `${phase(visual.slug)}s`;

  const shelf = bookshelfOf(model);
  const dust = shelfDustOf(model);
  const computer = scales.computer.computerOf(model);
  const league = computer.league ? SWE_LEAGUE[computer.league] : null;
  const scale = TIER_SCALE[visual.size.tier] ?? 1;
  const cell = `calc(${FIGURE} * ${scale})`;

  const birth = model.releaseDate
    ? model.releaseDate.slice(0, 7).replace('-', '.')
    : '????.??';

  const computerTitle = league
    ? `编程能力 ${computer.score!.toFixed(1)}%\n${league.name}\n档位按同赛制内的分位计算，跨赛制分数不可比`
    : `编程能力${dict.unknown.noData}：没有查到公开的编程评测成绩。不知道不等于不会。`;

  return (
    <Link
      href={`/model/${visual.slug}/`}
      className="group block outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
      style={{ width: ROOM_W }}
      title={visual.name}
    >
      <div
        className="relative transition-transform duration-150 group-hover:-translate-y-1"
        style={{ ['--bob-delay' as string]: bob }}
      >
        <Roof continent={continent} color={accent} />

        {/* 屋内剖面 */}
        <div
          className="relative w-full overflow-hidden border-x-[3px] border-[var(--color-ink)]"
          style={{ height: ROOM_H, background: wear.wall }}
        >
          {/* 墙面砖缝 */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.16) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 22px)',
            }}
            aria-hidden
          />

          {/* 门楣匾额：出生年月。这是「谁更老」最直接的答案。 */}
          <div
            className="absolute left-1.5 top-1.5 z-20 border border-black/40 px-1.5 py-px font-pixel text-[12px] leading-tight"
            style={{ background: 'rgb(0 0 0 / 0.45)', color: 'var(--color-gold)' }}
          >
            {birth}
          </div>

          {/* 地板 */}
          <div
            className="absolute inset-x-0 bottom-0 h-3.5"
            style={{
              background: 'var(--color-floor)',
              boxShadow: 'inset 0 2px 0 rgb(0 0 0 / 0.4)',
              backgroundImage:
                'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 16px)',
            }}
            aria-hidden
          />

          {/* 陈设：左书架、中角色、右电脑，全部贴地对齐 */}
          <div className="absolute inset-x-0 bottom-3.5 flex items-end justify-between px-1.5">
            <div className="shrink-0" title={`上下文 ${model.contextWindow ?? '未知'}`}>
              {shelf ? (
                <Bookshelf tier={shelf} dust={dust} size={1.4} title="上下文窗口" muted />
              ) : (
                <div className="h-2 w-8" />
              )}
            </div>

            <div
              className="relative shrink-0"
              style={{
                width: cell,
                height: cell,
                // 幽灵态整体作用在角色和它的叠加层上
                opacity: visual.stage === 'ghost' ? 0.45 : 1,
                filter: visual.stage === 'ghost' ? 'grayscale(0.85)' : undefined,
              }}
            >
              {hasSprite ? (
                <div
                  className="anim-idle anim-walk absolute inset-0"
                  style={{
                    backgroundImage: `url(${asset(`/sprites/${visual.slug}.png`)})`,
                    backgroundSize: `calc(${cell} * ${SHEET_COLUMNS}) auto`,
                    backgroundPosition: '0 0',
                    backgroundRepeat: 'no-repeat',
                    imageRendering: 'pixelated',
                    ['--sheet-width' as string]: `calc(${cell} * ${SHEET_COLUMNS})`,
                    ['--walk-row' as string]: `calc(${cell} * ${-ROW_WALK_FRONT})`,
                  }}
                />
              ) : (
                <div
                  className="anim-idle absolute bottom-0 left-1/2 -translate-x-1/2"
                  style={{
                    width: `calc(${cell} * 0.4)`,
                    height: `calc(${cell} * 0.7)`,
                    background: accent,
                  }}
                />
              )}

              {/*
                皇冠、光环、闪光、雾气全在这里现画，不在精灵图里。
                排名一变下次构建就自动摘冠，不用重新合成任何 PNG。
              */}
              {overlaysNeeded && (
                <StateOverlays
                  visual={visual}
                  anchors={anchorsFor(visual.slug)}
                  hideFog={pruning.fog}
                />
              )}
            </div>

            {/*
              没有编程成绩时本来摆一张盖布问号桌。当广场上八成屋子都摆着同一张桌时，
              它已经不是警告而是墙纸了，所以整张撤掉，把「不知道」交给能力条的空槽去说。
              留一个等宽占位，否则角色会在屋里偏移，一排屋子的重心会歪。
            */}
            {computer.tier === 'none' && pruning.emptyDesk ? (
              <div className="h-2 w-8 shrink-0" />
            ) : (
              <div className="shrink-0" title={computerTitle}>
                <Computer
                  tier={computer.tier}
                  size={1.7}
                  title={computerTitle}
                  flicker={league?.thirdParty === true}
                  dim={league?.thirdParty === false}
                />
              </div>
            )}
          </div>

          {/* 房龄带来的昏暗 */}
          {wear.dim > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `rgb(13 16 23 / ${wear.dim})` }}
              aria-hidden
            />
          )}
        </div>

        {/* 名牌 */}
        <div
          className="border-[3px] border-t-0 border-[var(--color-ink)] px-2 py-1.5"
          style={{ background: 'var(--color-plate)' }}
        >
          {/*
            标签排在最上面，是整间屋子最先该被读到的东西。
            「全球最强」「白菜价」「刚出生」这类人话，比任何视觉隐喻都好懂。
          */}
          {/* 高度固定：没有标签的屋子也要占住这一行，否则一排名牌的基线会参差不齐 */}
          <div className="mb-1.5 min-h-[18px]">
            <TraitTags traits={traits} />
          </div>

          <div className="truncate font-pixel text-[14px] leading-tight text-[var(--color-parchment)] group-hover:text-[var(--color-gold)]">
            {visual.name}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[13px] leading-tight">
            <VendorCrest
              motif={profile.motif}
              accentColor={profile.accentColor}
              size={12}
              title={profile.nameZh}
            />
            <span className="truncate" style={{ color: nameColor }}>
              {profile.nameZh}
            </span>
            <span className="ml-auto shrink-0 flex items-center gap-1.5">
              <StatRow model={model} accent={nameColor} numbers={false} prune={pruning} />
            </span>
          </div>

          {/*
            四条能力横条。这是整张卡片上信息密度最高、也最不需要学习成本的部分：
            不用查图例，谁的格子多谁就强，缺数据的画成空槽加「暂无」。
          */}
          <div className="mt-2 border-t border-white/10 pt-2">
            <AbilityBars row={aptitude} compact highlight={highlight} />
          </div>

          {/*
            一句话人设。属性面板只是把数字摆出来，结论还得读者自己下；
            这一行直接把结论写出来，回答「我该拿它干嘛」。
            高度固定两行，否则一排卡片的底边会参差不齐。
          */}
          <p
            className="mt-2 line-clamp-2 min-h-[32px] border-t border-white/10 pt-1.5 text-[12px] leading-[1.45] text-[var(--color-parchment-dim)]"
            title={persona}
          >
            {persona}
          </p>
        </div>
      </div>
    </Link>
  );
}
