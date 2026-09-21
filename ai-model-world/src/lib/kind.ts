/**
 * 模型类型：文本 / 视觉 / 全模态 / 图像生成 / 视频生成 / 语音。
 *
 * 为什么需要这一层：读者问「这是个什么模型」时，想要的是一个词，
 * 不是「输入 文本、图片、PDF → 输出 文本」这样一串模态列表。
 * 同时它也是排行榜与总表的筛选维度——把 Whisper、Veo、GPT-Image 和对话模型
 * 混在一张价格表里没有意义，读者需要能一键只看某一类。
 *
 * 分类**只由 `modalities` 推导**，不看名字、不看厂商说法，每个模型恰好落进一类。
 * 判定顺序从「特殊」到「一般」——先看它能不能生成图 / 视频 / 声音，
 * 再看它能听、能看、还是只能读字。规则本身很短，读者在筛选条的悬停提示里就能看完。
 *
 * 已知边界：上游偶有把「深度研究」类产品的输出标成含图（报告里带图表），
 * 它们会被归到「图像生成」。这是上游数据的说法，不在这里手工修正——
 * 本站的原则是只呈现数据、不替数据源改口。
 *
 * 纯函数、确定性。
 */

import type { ModelRecord } from './types';

export type ModelKind = 'text' | 'vision' | 'omni' | 'image-gen' | 'video-gen' | 'speech';

/** 展示顺序：从最常见到最特殊 */
export const KINDS: readonly ModelKind[] = ['text', 'vision', 'omni', 'image-gen', 'video-gen', 'speech'];

export function isModelKind(s: string | null | undefined): s is ModelKind {
  return (KINDS as readonly string[]).includes(s ?? '');
}

/**
 * 从模态推出类型。`modalities` 两边都为空的模型返回 null——
 * 那是「上游没说」，不是「纯文本」，界面上要写「未知」而不是默认成文本模型。
 */
export function kindOf(m: Pick<ModelRecord, 'modalities'>): ModelKind | null {
  const input = new Set(m.modalities.input);
  const output = new Set(m.modalities.output);
  if (input.size === 0 && output.size === 0) return null;

  if (output.has('image')) return 'image-gen';
  if (output.has('video')) return 'video-gen';
  // 既能听又能看的才叫全模态；输出有没有声音不影响这个判断（Qwen-Omni、GPT-Realtime 都在这）
  if (input.has('audio') && (input.has('image') || input.has('video'))) return 'omni';
  // 剩下带声音的：语音识别（Whisper）、语音合成（TTS）、只听不看的语音对话
  if (input.has('audio') || output.has('audio')) return 'speech';
  if (input.has('image') || input.has('video')) return 'vision';
  return 'text';
}

/** 统计一批模型各类型的数量，筛选条上要显示 */
export function countKinds(models: Pick<ModelRecord, 'modalities'>[]): Record<ModelKind, number> {
  const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<ModelKind, number>;
  for (const m of models) {
    const k = kindOf(m);
    if (k) out[k] += 1;
  }
  return out;
}

export interface KindGroup {
  kind: ModelKind;
  /** 在役模型数 */
  count: number;
  /** 代表模型，最多 REPRESENTATIVES 个：有综合智力分的按分数，没有的按发布日期 */
  representatives: ModelRecord[];
}

const REPRESENTATIVES = 3;

/**
 * 首页「按类型看」用：每一类的数量与几个代表模型。
 *
 * 广场上住的都是各家的当家门面，而门面必然是对话模型（见 roster.ts 的 couldBeFlagship），
 * 所以图像生成、视频生成、语音这三类模型在广场上**一个都不会出现**。
 * 这一组卡片是它们在首页唯一的露脸机会，也是读者按类型钻进总表的入口。
 *
 * 代表模型怎么挑：
 * - 只在形象注册表里有的正规厂商中挑，否则会被社区微调版刷屏；
 * - 有综合智力分（ECI）的按分数降序——文本 / 视觉 / 全模态三类都能这样挑；
 * - 没有 ECI 的（生成类、语音类几乎全部）按发布日期降序，最新的最有代表性；
 * - 同名去重：`Nano Banana Pro` 正式版与预览版是两条记录，卡片上只该出现一次。
 */
export function buildKindGroups(
  models: ModelRecord[],
  now: Date,
  registryHas: (vendorId: string) => boolean,
): KindGroup[] {
  const alive = models.filter((m) => !m.retiredAt);
  const counts = countKinds(alive);
  const nowMs = now.getTime();
  const releaseMs = (m: ModelRecord) => (m.releaseDate ? Date.parse(m.releaseDate) : Number.NaN);

  return KINDS.filter((k) => counts[k] > 0).map((kind) => {
    const pool = alive
      .filter((m) => kindOf(m) === kind && registryHas(m.vendorId))
      .filter((m) => {
        const t = releaseMs(m);
        return Number.isNaN(t) || t <= nowMs;
      })
      .sort((a, b) => {
        const ea = a.benchmarks.eci;
        const eb = b.benchmarks.eci;
        if (ea != null || eb != null) {
          if (ea == null) return 1;
          if (eb == null) return -1;
          if (ea !== eb) return eb - ea;
        }
        const ta = releaseMs(a);
        const tb = releaseMs(b);
        if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
        if (ta !== tb) return tb - ta;
        return a.id.localeCompare(b.id);
      });

    const seen = new Set<string>();
    const representatives: ModelRecord[] = [];
    for (const m of pool) {
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      representatives.push(m);
      if (representatives.length >= REPRESENTATIVES) break;
    }
    return { kind, count: counts[kind], representatives };
  });
}
