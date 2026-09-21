import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 榜单成绩的归属明细。
 *
 * 数据管线把厂商自报与第三方榜单的成绩分开存放，这份文件记录每一条的具体出处，
 * 用来做两件事：生成精确的悬停署名，以及**按来源分开做分档**。
 *
 * 后者是必须的：`swe_bench_pro` 里混着 Scale AI 官方榜（中位数 41.0）
 * 与厂商系统卡自评（中位数 59.0）两套测法，中间差 18 分。
 * 把它们当成一个分布来分档，被 Scale 测过的模型会被系统性压低一到两档。
 */

export type AttributionType = 'third-party' | 'vendor-self-reported';

export interface AttributionEntry {
  attributionType: AttributionType;
  metric: string;
  rawName: string;
  score: number;
  sourceHost: string;
  sourceUrl: string;
}

/** modelId → benchmarkKey → 归属 */
export type AttributionMap = Record<string, Record<string, AttributionEntry>>;

const PATH = join(process.cwd(), 'data', 'benchmark-attribution.json');

let cached: AttributionMap | null = null;

export function loadAttribution(): AttributionMap {
  if (cached) return cached;
  if (!existsSync(PATH)) {
    // 缺这份文件不该让站点构建失败：它只影响署名精度与分档粒度，
    // 缺失时所有自报成绩退化为「厂商自报」这一档，仍然是诚实的
    cached = {};
    return cached;
  }
  const raw = JSON.parse(readFileSync(PATH, 'utf8')) as { attribution?: AttributionMap };
  cached = raw.attribution ?? {};
  return cached;
}

export function attributionFor(
  map: AttributionMap,
  modelId: string,
  key: string,
): AttributionEntry | null {
  return map[modelId]?.[key] ?? null;
}
