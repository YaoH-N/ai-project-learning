/**
 * 能力条：把模型的关键差异翻译成四条并排的横条。
 *
 * 为什么要有这个文件——一次设计上的退让，值得写清楚。
 *
 * 这个站原本把所有属性都编码进像素画：体型是参数量、衣服华丽度是价格、
 * 书架层数是上下文、桌上电脑档次是编程能力。实测下来十个维度里有六个读不出来：
 * 64 像素的小人身上看不出衣服质地，一排书架在缩略图里长得一模一样，
 * 而「体型 = 参数量」这个映射本身就需要用户先学一遍规则才看得懂。
 *
 * 结论是**不要把数据编码进画里**。宝可梦图鉴不会因为喷火龙血厚就把它画大一圈，
 * 它在旁边画一根条。画负责「这是谁」，条负责「它多强」，两者分工，谁也不挤占谁。
 *
 * 所以这里保留像素角色作为身份与观感，另开四条横条承载比较：
 * 聪明、会写代码、记性、贵不贵。横条是零学习成本的——不用看图例，
 * 谁的条长谁就强，这是所有人都认识的语言。
 *
 * 沿用全站的**自校准分位**：条的长度是「在当前这批模型里排百分之几」，
 * 不是写死的绝对刻度。理由见 docs/HANDOFF.md 第五节。
 */

import type { BenchmarkScore, ModelRecord } from './types';
import { leagueOf } from '@/data/coding-leagues';
import { formatScoreByUnit } from './format';

export type AptitudeId = 'smart' | 'code' | 'memory' | 'cheap';

export interface AptitudeMeta {
  id: AptitudeId;
  /** 条子左边的标签，两个字，扫一眼就懂 */
  label: string;
  /** 悬停时解释这一条到底在量什么 */
  blurb: string;
}

export const APTITUDES: AptitudeMeta[] = [
  { id: 'smart', label: '聪明', blurb: '综合智力。取 Epoch AI 的 Capabilities Index，它把十几项学术评测归并成一个总分。' },
  { id: 'code', label: '编程', blurb: '写代码与做软件工程的本事。取该模型拿得到的最可信的一项编程评测。' },
  { id: 'memory', label: '记性', blurb: '上下文窗口，也就是一次能读进去多少字。窗口越大，越能一口气啃完长文档或整个代码仓库。' },
  { id: 'cheap', label: '便宜', blurb: '输出每百万 token 的价格，条越长越便宜。' },
];

export interface AptitudeValue {
  id: AptitudeId;
  /**
   * 条的填充比例 0~1。**null 表示没有数据**，界面上必须画成空槽加问号，
   * 绝不能画成 0——「没测过」和「得了零分」是两件完全不同的事。
   */
  fill: number | null;
  /** 条右边那个短标，如「世界#1」「1M」「$50」。没数据时为 null。 */
  literal: string | null;
  /** 一个人话结论，如「顶尖」「偏贵」。没数据时为 null。 */
  verdict: string | null;
  /**
   * 改写这一行的标签。
   * 目前只有编程那条用得上：拿 WebDev Arena 兜底时它量的其实是前端，
   * 沿用「编程」会让同一行标签在不同卡片上指不同的事。
   */
  labelOverride?: string;
  /**
   * 这个分数是厂商自己报的、没经过第三方复核。
   * 界面上必须显式标出来——一个厂商自报的 95 和一个第三方实测的 78，
   * 光看数字会得出完全错误的结论。
   */
  selfReported?: boolean;
  /** 悬停全文，含数据出处与「在多少个有成绩的模型里排第几」 */
  title: string;
}

export interface AptitudeRow {
  values: Record<AptitudeId, AptitudeValue>;
  /** 有实测数据的条数，0~4。用来排「资料齐全的排前面」。 */
  known: number;
  /** 编程那一条用的是哪个赛制，详情页要署名 */
  codingScore: BenchmarkScore | null;
}

// ─── 分位工具 ─────────────────────────────────────────────────

/** 升序数组里 value 的分位，0~1。空数组回落到 0.5。 */
function percentile(sorted: number[], value: number): number {
  if (sorted.length === 0) return 0.5;
  if (sorted.length === 1) return 0.5;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / (sorted.length - 1);
}

/** 名次，1 起。用于「世界#3」这类短标。 */
function rankOf(descSorted: number[], value: number): number {
  let n = 1;
  for (const v of descSorted) {
    if (v > value) n++;
    else break;
  }
  return n;
}

const VERDICTS = ['入门', '偏弱', '中等', '很强', '顶尖'];
const PRICE_VERDICTS = ['天价', '偏贵', '适中', '便宜', '极便宜'];

function verdictOf(fill: number, words: string[]): string {
  const i = Math.min(words.length - 1, Math.floor(fill * words.length));
  return words[i];
}

// ─── 编程成绩的挑选 ───────────────────────────────────────────

/**
 * 从模型身上取出一条编程成绩。
 *
 * 优先读管线新产出的 `coding[]`（按赛制分列的全集）；若快照还是旧格式，
 * 就地从 `benchmarks` 的三个历史字段合成一份等价物。
 *
 * 这个兼容层是有意留的：数据管线与前端由不同的人/Agent 分头改，
 * 谁先落地都不该让站点白屏。等快照稳定产出 `coding[]` 之后，
 * 这段回退路径会自然变成死代码，但删它没有收益，留着能防回归。
 */
function codingScoresOf(model: ModelRecord): BenchmarkScore[] {
  if (Array.isArray(model.coding) && model.coding.length > 0) return model.coding;

  const legacy: BenchmarkScore[] = [];
  const push = (
    league: string,
    score: number | null,
    attribution: BenchmarkScore['attribution'],
    source: BenchmarkScore['source'],
  ) => {
    if (score == null) return;
    legacy.push({
      league,
      score,
      unit: league === 'webdev_arena_elo' ? 'elo' : 'pct',
      attribution,
      source,
      sourceUrl: null,
    });
  };
  push('swe_bench_verified', model.benchmarks.swe_bench_verified, 'third-party', 'epoch.ai');
  push('swe_bench_verified', model.benchmarks.swe_bench_vendor, 'vendor-self-reported', 'models.dev');
  push('swe_bench_pro', model.benchmarks.swe_bench_pro, 'vendor-self-reported', 'models.dev');
  push('webdev_arena_elo', model.benchmarks.webdev_arena_elo, 'third-party', 'epoch.ai');
  return legacy;
}

/**
 * 分位池的键。
 *
 * **赛制相同还不够，测量方也必须相同才能放进同一个池子。**
 * 这是全站最容易被无意破坏的一条规则：同样叫 SWE-bench Verified，
 * Epoch AI 用统一脚手架复跑出来的 25 个模型中位数是 75.7，
 * 厂商在自家系统卡里自报的那批中位数明显更高——它们不是同一个分布，
 * 混在一起算分位会让自报的模型系统性地占便宜。
 */
function poolKey(s: BenchmarkScore): string {
  return `${s.league}::${s.attribution}`;
}

/** 分位池小于这个数就分不出档位，只能说「已参赛」 */
const MIN_POOL = 5;

/**
 * 同一个模型有多条成绩时，取一条作为卡片上的代表。
 *
 * 排序有三级，第一级最容易被漏掉：
 *
 * 1. **能不能分出档位**。一个只有三个模型跑过的冷门赛制，即使口径再接近
 *    「通用编程」也给不出有意义的档位。实测踩过：SWE-Marathon 只有 3 条成绩，
 *    却因为优先级数字比 Terminal-Bench（31 条）小而被选中，
 *    结果 Kimi K3 的编程那一行显示「已参赛」——它明明有五项编程成绩。
 * 2. 赛制离「通用编程能力」的远近，见 CODING_LEAGUES.priority 的注释。
 * 3. 同一赛制内部，第三方实测压过厂商自评。
 */
function pickCoding(
  scores: BenchmarkScore[],
  poolSize: (s: BenchmarkScore) => number,
): BenchmarkScore | null {
  if (scores.length === 0) return null;
  return [...scores].sort((a, b) => {
    const ua = poolSize(a) >= MIN_POOL ? 0 : 1;
    const ub = poolSize(b) >= MIN_POOL ? 0 : 1;
    if (ua !== ub) return ua - ub;

    const pa = leagueOf(a.league).priority;
    const pb = leagueOf(b.league).priority;
    if (pa !== pb) return pa - pb;

    const ra = a.attribution === 'third-party' ? 0 : 1;
    const rb = b.attribution === 'third-party' ? 0 : 1;
    return ra - rb;
  })[0];
}

// ─── 标尺 ─────────────────────────────────────────────────────

export interface AptitudeScale {
  rowOf(model: ModelRecord): AptitudeRow;
}

function fmtContext(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${m % 1 === 0 ? m : m.toFixed(1)}M`;
  }
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function fmtPrice(usd: number): string {
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 10) return `$${usd.toFixed(1)}`;
  return `$${Math.round(usd)}`;
}

/**
 * 建立四条能力的标尺。
 *
 * 每一条都在**自己的有效人群**里做分位：智力只跟有智力分的比，
 * 编程只跟同一赛制的比。所以悬停文案里必须写清「在多少个有成绩的模型里排第几」，
 * 否则「排前 10%」会被误读成「在全部 485 个模型里排前 10%」。
 */
export function buildAptitudeScale(models: ModelRecord[]): AptitudeScale {
  const eciAsc = models
    .map((m) => m.benchmarks.eci)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const eciDesc = [...eciAsc].reverse();

  const ctxAsc = models
    .map((m) => m.contextWindow)
    .filter((v): v is number => v != null && v > 0)
    .map((v) => Math.log10(v))
    .sort((a, b) => a - b);

  // 只把输出文本的模型算进价格人群：语音转写、图像生成这类按分钟或按张计费的，
  // 折算成 per-token 会得到接近 0 的假值，混进来会让「最便宜」这个结论出错。
  const priceAsc = models
    .filter((m) => m.modalities.output.includes('text'))
    .map((m) => m.pricing.outputPerMTok)
    .filter((v): v is number => v != null && v > 0)
    .map((v) => Math.log10(v))
    .sort((a, b) => a - b);

  /** 「赛制 + 测量方」各占一个独立分位池，不可比的分数在结构上就不会相遇。 */
  const codingPools = new Map<string, number[]>();
  for (const m of models) {
    for (const s of codingScoresOf(m)) {
      const key = poolKey(s);
      const pool = codingPools.get(key);
      if (pool) pool.push(s.score);
      else codingPools.set(key, [s.score]);
    }
  }
  for (const pool of codingPools.values()) pool.sort((a, b) => a - b);

  const missing = (blurb: string): AptitudeValue => ({
    id: 'smart',
    fill: null,
    literal: null,
    verdict: null,
    title: blurb,
  });

  return {
    rowOf(model) {
      // 聪明
      const eci = model.benchmarks.eci;
      let smart: AptitudeValue;
      if (eci == null) {
        smart = {
          ...missing('还没有公开的综合智力成绩。没测过不等于不聪明。'),
          id: 'smart',
        };
      } else {
        const fill = percentile(eciAsc, eci);
        const rank = rankOf(eciDesc, eci);
        smart = {
          id: 'smart',
          fill,
          literal: `世界#${rank}`,
          verdict: verdictOf(fill, VERDICTS),
          title: `综合智力指数 ${eci.toFixed(1)}，在 ${eciAsc.length} 个有成绩的模型里排第 ${rank}。\n来源：Epoch AI Capabilities Index。`,
        };
      }

      // 编程
      const pick = pickCoding(
        codingScoresOf(model),
        (s) => codingPools.get(poolKey(s))?.length ?? 0,
      );
      let code: AptitudeValue;
      if (!pick) {
        code = {
          ...missing('没有查到任何公开的编程评测成绩。不知道不等于不会写。'),
          id: 'code',
        };
      } else {
        const league = leagueOf(pick.league);
        const pool = codingPools.get(poolKey(pick)) ?? [];
        const fill = percentile(pool, pick.score);
        const rank = rankOf([...pool].reverse(), pick.score);
        const unitText = formatScoreByUnit(pick.score, pick.unit);
        const selfReported = pick.attribution !== 'third-party';
        /*
         * 这一行显示的是**分位档**（顶尖/很强/中等…），既不是原始分数也不是名次。
         * 两次都试错过，值得记下来。
         *
         * **原始分数不行**：编程被切成了二十多个互不兼容的赛制。并排的三张卡片，
         * 一张写 95.0%（转载的 SWE-bench Verified）、一张写 78.7%（Epoch 复跑）、
         * 一张写 41.0%（SWE-Bench Pro，中位数本来就比 Verified 低三十多分）——
         * 读者一定会直接比大小，而它们根本不在一把尺子上。
         *
         * **名次也不行**：分位池按「赛制 + 测量方」分组之后大小差得很远，
         * 实测从 6 个到 85 个都有。「6 个里排第 2」和「25 个里排第 2」
         * 显示出来都是「榜内#2」，同样会误导。
         *
         * 分位档是唯一跨池可比的表达：它回答「在同样被这么测过的模型里
         * 它算什么水平」，池子多大都成立。原始分数、赛制名、测量方、
         * 精确名次全部留在悬停提示和详情页的编程战绩表里。
         */
        const rankable = pool.length >= MIN_POOL;
        code = {
          id: 'code',
          fill,
          literal: rankable ? verdictOf(fill, VERDICTS) : '已参赛',
          verdict: rankable ? verdictOf(fill, VERDICTS) : null,
          labelOverride: league.rowLabel,
          selfReported,
          title:
            `${league.label} ${unitText}\n` +
            (rankable
              ? `在同样被这个榜、由同一类测量方测过的 ${pool.length} 个模型里排第 ${rank}。\n`
              : `同赛制同测量方只有 ${pool.length} 个模型有成绩，样本太少，不给档位。\n`) +
            `${league.blurb}\n` +
            `${selfReported ? '厂商自报，未经独立复核。' : '第三方实测。'}\n` +
            `档位只在本赛制内部计算——换一套评测脚手架，同一个模型能差二三十分，所以这里显示名次而不是分数。`,
        };
      }

      // 记性
      const ctx = model.contextWindow;
      let memory: AptitudeValue;
      if (ctx == null || ctx <= 0) {
        memory = { ...missing('上下文窗口未公开。'), id: 'memory' };
      } else {
        const fill = percentile(ctxAsc, Math.log10(ctx));
        memory = {
          id: 'memory',
          fill,
          literal: fmtContext(ctx),
          verdict: verdictOf(fill, VERDICTS),
          title: `上下文窗口 ${ctx.toLocaleString()} tokens，约合 ${Math.round(ctx * 0.7).toLocaleString()} 个汉字。\n在 ${ctxAsc.length} 个已知窗口大小的模型里处于第 ${Math.round(fill * 100)} 百分位。`,
        };
      }

      // 便宜
      const price = model.pricing.outputPerMTok;
      let cheap: AptitudeValue;
      if (price == null || price <= 0 || !model.modalities.output.includes('text')) {
        cheap = { ...missing('没有公开的文本输出报价。'), id: 'cheap' };
      } else {
        // 价格低 = 条长，所以取反
        const fill = 1 - percentile(priceAsc, Math.log10(price));
        cheap = {
          id: 'cheap',
          fill,
          literal: fmtPrice(price),
          verdict: verdictOf(fill, PRICE_VERDICTS),
          title: `输出每百万 tokens ${price} 美元。\n在 ${priceAsc.length} 个有报价的文本模型里，比其中 ${Math.round(fill * 100)}% 便宜。`,
        };
      }

      const values = { smart, code, memory, cheap };
      return {
        values,
        known: Object.values(values).filter((v) => v.fill != null).length,
        codingScore: pick,
      };
    },
  };
}
