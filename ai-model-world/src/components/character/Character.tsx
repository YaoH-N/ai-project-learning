import Link from 'next/link';
import type { CharacterVisual, Tier } from '@/lib/derive';
import { profileFor } from '@/data/vendor-registry';
import { readableOnDark } from '@/lib/color';
import { getDict, type Lang } from '@/lib/i18n';
import { VendorCrest } from './VendorCrest';
import { StateOverlays } from './StateOverlays';
import { anchorsFor } from '@/lib/sprite-manifest';
import { asset } from '@/lib/asset';

/**
 * 广场上的一个角色。
 *
 * 只承载第一层（远景）的四个信号：体型、服饰华丽度、冠冕、新旧生死。
 * 能力符号属于第二层，靠近看才分辨得出。
 *
 * 两条渲染路径：
 * - 有精灵图时直接切帧显示。冠冕、光环、耳机、闪光、雾化斗篷、幽灵态**全部由合成管线烘焙进图里**，
 *   前端不得再叠一层，否则会画两遍。
 * - 精灵图缺失时回退到剪影，并用 CSS 补画那些状态标记。
 *   这不是临时占位——数据管线发现新模型与美术管线合成精灵图之间必然有时间差，
 *   缺图的角色要照常成立，而不是变成破图。
 */

/** 显示盒边长由 CSS 变量给出，见 globals.css 的 --sprite-box */
const BOX = 'var(--sprite-box)';

/** 精灵表布局，与 public/sprites/manifest.json 的 frame 字段对应 */
const SHEET_COLUMNS = 9;
const ROW_STAND = 0;

/**
 * 体型档位的显示缩放。
 *
 * 为什么不靠精灵图自己表达体型：LPC 的身体类型（child/teen/female/male）**不是按身高排序的**。
 * 实测五个档位的站立帧平均高度是 48.0 / 52.8 / 51.3 / 54.3 / 61.3 像素——
 * 档位 2 到 3 竟然是 -1.5px，更大的模型反而更矮，而且全档跨度只有 13px（画布的 21%）。
 * 体型是广场远景仅有的四个信号之一，非单调等于这个维度失效。
 *
 * 所以身体类型只保留为个体差异的花样，档位改由显示缩放接管，高度严格单调、跨度约 49px。
 * 缩放走 image-rendering: pixelated，是最近邻而非插值，边缘不会糊。
 */
const TIER_SCALE: Record<Tier, number> = { 1: 0.62, 2: 0.72, 3: 0.82, 4: 0.91, 5: 1 };

function Silhouette({ visual }: { visual: CharacterVisual }) {
  const color = readableOnDark(profileFor(visual.vendorId).accentColor);
  const h = TIER_SCALE[visual.size.tier];
  const head = `calc(${BOX} * ${(h * 0.3).toFixed(3)})`;

  return (
    <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-end">
      <div
        style={{
          width: head,
          height: head,
          background: color,
          boxShadow: 'inset 0 -3px 0 rgb(0 0 0 / 0.25)',
        }}
      />
      <div
        style={{
          width: `calc(${BOX} * ${(h * 0.375).toFixed(3)})`,
          height: `calc(${BOX} * ${(h * 0.52).toFixed(3)})`,
          background: color,
          filter: 'brightness(0.72)',
          boxShadow: 'inset 0 -4px 0 rgb(0 0 0 / 0.28)',
        }}
      />
    </div>
  );
}

export interface CharacterProps {
  visual: CharacterVisual;
  lang: Lang;
  /** 精灵图是否已生成。缺失时回退到剪影。 */
  hasSprite?: boolean;
  /** 名牌。角色详情页的标题已经写了名字，那里就不必再挂一块。 */
  showLabel?: boolean;
  /** 详情页里角色就是页面主体，不该再链回自己 */
  linked?: boolean;
  /** 精灵图未烘焙皇冠、光环等状态层时为 true，由前端补画 */
  overlaysNeeded?: boolean;
  /**
   * 名牌上补一行小字。厂商页用它标类型——
   * 「智谱有没有能看图的」这种问题，光看一排名字是答不出来的：
   * 全站 89% 的视觉模型名字里没有 V 或 VL。
   */
  badge?: string;
  /** badge 的悬停说明 */
  badgeTitle?: string;
}

export function Character({
  visual,
  lang,
  hasSprite = false,
  showLabel = true,
  linked = true,
  overlaysNeeded = false,
  badge,
  badgeTitle,
}: CharacterProps) {
  const dict = getDict(lang);
  const profile = profileFor(visual.vendorId);
  const accent = readableOnDark(profile.accentColor);
  const ghost = visual.stage === 'ghost';

  const title = !visual.dataComplete
    ? `${visual.name} · ${dict.unknown.incomplete}`
    : visual.size.opaque
      ? `${visual.name} · ${dict.unknown.sizeEstimated}`
      : visual.size.estimated
        ? `${visual.name} · ${dict.unknown.sizeApprox}`
        : visual.name;

  const scale = TIER_SCALE[visual.size.tier];
  const cell = `calc(${BOX} * ${scale})`;

  const Wrapper = linked ? Link : 'div';
  const wrapperProps = linked
    ? { href: `/model/${visual.slug}/` as const, title }
    : { title };

  return (
    <Wrapper
      {...(wrapperProps as { href: string; title: string })}
      className="group relative flex flex-col items-center outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-gold)]"
    >
      {/* 所有档位共用同一个盒子高度，靠 items-end 对齐到同一条地平线 */}
      <div
        className="relative flex items-end justify-center"
        style={{ width: BOX, height: BOX }}
      >
        {/* 地面投影，大小随体型变化，让角色真的站在地上而不是浮着 */}
        <div
          className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-[50%]"
          style={{
            width: `calc(${BOX} * ${(0.42 * scale).toFixed(3)})`,
            height: 7,
            background: 'rgb(0 0 0 / 0.32)',
            filter: 'blur(1px)',
          }}
          aria-hidden
        />

        <div
          className="relative transition-transform group-hover:-translate-y-1"
          style={{
            width: cell,
            height: cell,
            opacity: ghost ? 0.45 : 1,
            filter: ghost ? 'grayscale(0.85)' : undefined,
          }}
        >
          {hasSprite ? (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${asset(`/sprites/${visual.slug}.png`)})`,
                // 精灵表是 9 列，把整表宽度放大到 9 个格子，每格才正好等于一个显示单元
                backgroundSize: `calc(${cell} * ${SHEET_COLUMNS}) auto`,
                backgroundPosition: `0 calc(${cell} * ${-ROW_STAND})`,
                backgroundRepeat: 'no-repeat',
                imageRendering: 'pixelated',
              }}
            />
          ) : (
            <Silhouette visual={visual} />
          )}

          {/* 皇冠、光环、闪光、雾气按当下数据现画，不在精灵图里 */}
          {overlaysNeeded && <StateOverlays visual={visual} anchors={anchorsFor(visual.slug)} />}
        </div>
      </div>

      {showLabel && (
        <div
          className="mt-1 flex flex-col items-center gap-0.5"
          style={{ maxWidth: `calc(${BOX} + 8px)` }}
        >
          <span className="w-full truncate text-center text-[12px] leading-tight text-[var(--color-parchment)] group-hover:text-[var(--color-gold)]">
            {visual.name}
          </span>
          <span
            className="flex items-center gap-1 text-[12px] leading-tight"
            style={{ color: accent }}
          >
            {/*
              家徽。LPC 只有人类、蜥蜴、兔子这几种头型，角色的种族表达不了「这是哪一家」，
              厂商身份由这枚纹章单独承载。
            */}
            <VendorCrest
              motif={profile.motif}
              accentColor={profile.accentColor}
              size={12}
              title={profile.nameZh}
            />
            {visual.rank != null ? `#${visual.rank}` : dict.unknown.notRanked}
          </span>
          {badge && (
            <span
              title={badgeTitle}
              className="border border-white/15 bg-black/30 px-1 text-[11px] leading-tight text-[var(--color-parchment-dim)]"
            >
              {badge}
            </span>
          )}
          {/* 数据不完整的角色如实标注，不让无依据的形象看起来言之凿凿 */}
          {!visual.dataComplete && (
            <span className="text-[11px] leading-tight text-[var(--color-ghost)]">
              {dict.unknown.incomplete}
            </span>
          )}
        </div>
      )}
    </Wrapper>
  );
}
