import type { CharacterVisual } from '@/lib/derive';
import { FRAME_SIZE, type SpriteAnchors } from '@/lib/sprite-manifest';

/**
 * 角色的状态叠加层。
 *
 * 这些东西**不烘焙进精灵图**，而是每次渲染时按当下的数据现画：
 * 皇冠、思考光环、新生闪光、雾化斗篷、幽灵态。
 *
 * 理由是它们随时间和排名变化，而精灵图只该记录「这个模型是什么」。
 * 分开之后，某个模型掉出前十，下一次构建它头上的冠冕当场就没了，
 * 不需要重新合成任何一张 PNG。素材因此是真正可自由组合的。
 *
 * 位置全部来自合成管线实测的 `anchors`，不是拍脑袋的百分比——
 * 头顶高度会随体型、发型体积、有没有戴耳机而变，实测 Qwen3.8 Max 的颅骨顶
 * 比 Claude Fable 5 低 3 像素，硬编码一定会有角色把皇冠戴歪。
 */

/** 把 64 像素画布内的坐标换算成相对显示盒的百分比 */
const pct = (v: number) => `${(v / FRAME_SIZE) * 100}%`;

function Crown({
  kind,
  skull,
}: {
  kind: NonNullable<CharacterVisual['crown']>;
  skull: SpriteAnchors['skull'];
}) {
  const palette = {
    gold: { base: '#f5d76e', lit: '#fff3b8', dark: '#a8801f', gem: '#ef476f' },
    laurel: { base: '#a9dc76', lit: '#d8f5bb', dark: '#5c8a3c', gem: '#f5d76e' },
    silver: { base: '#d8dde8', lit: '#ffffff', dark: '#8a93a6', gem: '#68c7f0' },
  }[kind];

  // 榜首的冠冕更高、多两颗宝石，让第一名一眼可辨
  const tall = kind === 'gold';
  // 略宽于颅骨，像真的扣在头上而不是悬着
  const width = skull.width * 1.18;
  const height = width * 0.6;

  return (
    <svg
      viewBox="0 0 20 12"
      shapeRendering="crispEdges"
      className="pointer-events-none absolute"
      style={{
        left: pct(skull.x + skull.width / 2 - width / 2),
        // 冠带压在颅骨顶端往下一点，避免看起来是飘着的
        top: pct(skull.y - height + 2),
        width: pct(width),
      }}
      aria-hidden
    >
      <rect x="1" y={tall ? 3 : 5} width="3" height={tall ? 5 : 3} fill={palette.base} />
      <rect x="8" y={tall ? 0 : 3} width="4" height={tall ? 8 : 5} fill={palette.base} />
      <rect x="16" y={tall ? 3 : 5} width="3" height={tall ? 5 : 3} fill={palette.base} />
      <rect x="1" y={tall ? 3 : 5} width="3" height="1" fill={palette.lit} />
      <rect x="8" y={tall ? 0 : 3} width="4" height="1" fill={palette.lit} />
      <rect x="16" y={tall ? 3 : 5} width="3" height="1" fill={palette.lit} />
      <rect x="1" y="8" width="18" height="3" fill={palette.base} />
      <rect x="1" y="8" width="18" height="1" fill={palette.lit} />
      <rect x="1" y="11" width="18" height="1" fill={palette.dark} />
      <rect x="9" y="9" width="2" height="2" fill={palette.gem} />
      {tall && (
        <>
          <rect x="4" y="9" width="2" height="2" fill={palette.gem} opacity="0.7" />
          <rect x="14" y="9" width="2" height="2" fill={palette.gem} opacity="0.7" />
        </>
      )}
    </svg>
  );
}

/** 思考光环，层数就是推理档位。悬在头发顶端之上，同心环向外扩散。 */
function Halo({ layers, head }: { layers: 1 | 2 | 3; head: SpriteAnchors['head'] }) {
  const rings = Array.from({ length: layers }, (_, i) => i);
  const width = head.width * 1.25;
  const height = 3 + layers * 2.6;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: pct(head.x + head.width / 2 - width / 2),
        top: pct(head.y - height - 1),
        width: pct(width),
      }}
      aria-hidden
    >
      <svg viewBox="0 0 28 10" shapeRendering="crispEdges" className="anim-halo w-full">
        {rings.map((i) => {
          const inset = i * 4;
          const y = 8 - i * 2.6;
          return (
            <g key={i} opacity={0.9 - i * 0.2}>
              <rect x={4 + inset} y={y} width={20 - inset * 2} height="1" fill="#9fd8f5" />
              <rect x={2 + inset} y={y} width="2" height="1" fill="#9fd8f5" opacity="0.5" />
              <rect x={24 - inset} y={y} width="2" height="1" fill="#9fd8f5" opacity="0.5" />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** 新生闪光：竖臂长的四芒星，绕着人身错开相位地眨 */
function Sparkles({ body }: { body: SpriteAnchors['body'] }) {
  const stars = [
    { x: body.x - 5, y: body.y + body.height * 0.18, size: 7, delay: '0s' },
    { x: body.x + body.width + 1, y: body.y + body.height * 0.34, size: 6, delay: '0.9s' },
    { x: body.x + body.width - 3, y: body.y - 2, size: 5, delay: '1.7s' },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <svg
          key={i}
          viewBox="0 0 7 9"
          shapeRendering="crispEdges"
          className="anim-twinkle pointer-events-none absolute"
          style={{
            left: pct(s.x),
            top: pct(s.y),
            width: pct(s.size),
            animationDelay: s.delay,
          }}
          aria-hidden
        >
          <rect x="3" y="0" width="1" height="9" fill="#b9f6c6" />
          <rect x="1" y="4" width="5" height="1" fill="#b9f6c6" />
          <rect x="2" y="3" width="3" height="3" fill="#ffffff" />
        </svg>
      ))}
    </>
  );
}

/** 参数量完全未公开时从脚下升起的雾。这是诚实标注，不是装饰。 */
function Fog({ body }: { body: SpriteAnchors['body'] }) {
  const bottom = body.y + body.height;
  const height = body.height * 0.55;
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: pct(body.x - 3),
        width: pct(body.width + 6),
        top: pct(bottom - height),
        height: pct(height),
        background:
          'linear-gradient(to top, rgb(196 206 230 / 0.5), rgb(196 206 230 / 0.16) 45%, transparent 85%)',
        maskImage: 'linear-gradient(to top, #000 30%, rgb(0 0 0 / 0.5) 70%, transparent)',
        WebkitMaskImage: 'linear-gradient(to top, #000 30%, rgb(0 0 0 / 0.5) 70%, transparent)',
      }}
      aria-hidden
    />
  );
}

/**
 * 叠加层总成。只在精灵图未烘焙状态层时渲染，
 * 由 manifest 的 `overlaysBaked` 决定，避免画出双份皇冠。
 */
export function StateOverlays({
  visual,
  anchors,
  hideFog = false,
}: {
  visual: CharacterVisual;
  anchors: SpriteAnchors;
  /**
   * 广场上七成以上的角色都披着雾时，这层雾就不再是标注而是默认皮肤了。
   * 由 buildVisualPruning 自校准判定，详情页不受影响。
   */
  hideFog?: boolean;
}) {
  const halo = visual.signs.halo;
  return (
    <>
      {visual.size.opaque && !hideFog && <Fog body={anchors.body} />}
      {halo > 0 && <Halo layers={halo as 1 | 2 | 3} head={anchors.head} />}
      {visual.crown && <Crown kind={visual.crown} skull={anchors.skull} />}
      {visual.stage === 'newborn' && <Sparkles body={anchors.body} />}
    </>
  );
}
