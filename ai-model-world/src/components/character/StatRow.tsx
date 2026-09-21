import type { ModelRecord } from '@/lib/types';

/**
 * 屋子名牌下面那一行硬指标。
 *
 * 为什么需要它：像素小人身上能承载的差异有限，而且真正高覆盖率的字段
 * （上下文 74%、价格 62%、感官 74%）用形象表达要么看不清、要么会撞车。
 * 一行「1M · $15 · 眼耳」比十个视觉隐喻更快回答「这俩到底差在哪」。
 *
 * 图标是 8×8 的像素 SVG，与全站的像素语言一致，但数字用可读的无衬线字体。
 */

const ICON = 11;

function Icon({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <svg
      viewBox="0 0 8 8"
      width={ICON}
      height={ICON}
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      className="shrink-0"
    >
      <title>{title}</title>
      {children}
    </svg>
  );
}

const EyeIcon = (c: string) => (
  <Icon title="能看图">
    <rect x="1" y="3" width="6" height="2" fill={c} />
    <rect x="2" y="2" width="4" height="1" fill={c} />
    <rect x="2" y="5" width="4" height="1" fill={c} />
    <rect x="3" y="3" width="2" height="2" fill="#10101c" />
  </Icon>
);

const EarIcon = (c: string) => (
  <Icon title="能听声">
    <rect x="1" y="2" width="2" height="4" fill={c} />
    <rect x="5" y="2" width="2" height="4" fill={c} />
    <rect x="3" y="1" width="2" height="1" fill={c} />
  </Icon>
);

const BrushIcon = (c: string) => (
  <Icon title="能画图">
    <rect x="5" y="1" width="2" height="2" fill={c} />
    <rect x="3" y="3" width="2" height="2" fill={c} />
    <rect x="1" y="5" width="2" height="2" fill={c} />
  </Icon>
);

const ToolIcon = (c: string) => (
  <Icon title="会用工具">
    <rect x="1" y="1" width="2" height="2" fill={c} />
    <rect x="3" y="3" width="2" height="2" fill={c} />
    <rect x="5" y="5" width="2" height="2" fill={c} />
    <rect x="1" y="5" width="2" height="2" fill={c} />
  </Icon>
);

const ThinkIcon = (c: string) => (
  <Icon title="会深思">
    <rect x="2" y="1" width="4" height="4" fill={c} />
    <rect x="3" y="5" width="2" height="1" fill={c} />
    <rect x="3" y="6" width="2" height="1" fill={c} />
    <rect x="3" y="2" width="2" height="2" fill="#10101c" />
  </Icon>
);

const KeyIcon = (c: string) => (
  <Icon title="开源权重">
    <rect x="1" y="2" width="3" height="3" fill={c} />
    <rect x="2" y="3" width="1" height="1" fill="#10101c" />
    <rect x="4" y="3" width="3" height="1" fill={c} />
    <rect x="6" y="4" width="1" height="1" fill={c} />
  </Icon>
);

function shortContext(tokens: number | null): string | null {
  if (tokens == null) return null;
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

function shortPrice(usd: number | null): string | null {
  if (usd == null || usd <= 0) return null;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 10) return `$${usd.toFixed(1)}`;
  return `$${Math.round(usd)}`;
}

export interface StatRowProps {
  model: ModelRecord;
  accent: string;
  /**
   * 是否显示上下文与价格的数字。
   *
   * 广场卡片上关掉：这两个数已经由能力条里的「记性」和「便宜」承载，
   * 而且条子还额外给出了「在同代模型里算大还是算小」这层信息，比裸数字有用。
   * 再印一遍只会挤占本就不宽裕的卡片宽度。详情页仍然全都显示。
   */
  numbers?: boolean;
  /**
   * 广场上出现率过高、已经失去区分价值的图标。
   * 实测「会用工具」74%、「会深思」69%——满屏都有等于没有。
   * 由 buildVisualPruning 自校准判定，详情页传空对象即可全部显示。
   */
  prune?: { toolIcon?: boolean; thinkIcon?: boolean };
}

export function StatRow({ model, accent, numbers = true, prune }: StatRowProps) {
  const ctx = shortContext(model.contextWindow);
  const price = shortPrice(model.pricing.outputPerMTok);
  const input = new Set(model.modalities.input);
  const output = new Set(model.modalities.output);

  const icons = [
    input.has('image') && EyeIcon(accent),
    (input.has('audio') || output.has('audio')) && EarIcon(accent),
    output.has('image') && BrushIcon(accent),
    model.capabilities.reasoning === true && !prune?.thinkIcon && ThinkIcon(accent),
    model.capabilities.toolCall === true && !prune?.toolIcon && ToolIcon(accent),
    model.openWeights === true && KeyIcon(accent),
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2 text-[13px] leading-tight">
      {numbers && (
        <>
          <span
            className="tabular-nums text-[var(--color-parchment)]"
            title={ctx ? `上下文窗口 ${model.contextWindow!.toLocaleString()} tokens` : '上下文窗口未知'}
          >
            {ctx ?? '—'}
          </span>
          <span
            className="tabular-nums text-[var(--color-gold)]"
            title={price ? `输出 ${model.pricing.outputPerMTok} 美元每百万 tokens` : '无公开报价'}
          >
            {price ?? '—'}
          </span>
        </>
      )}
      <span className={`flex items-center gap-1 ${numbers ? 'ml-auto' : ''}`}>
        {icons.map((icon, i) => (
          <span key={i}>{icon}</span>
        ))}
      </span>
    </div>
  );
}
