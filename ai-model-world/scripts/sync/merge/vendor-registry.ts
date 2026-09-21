import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

import { VENDOR_REGISTRY_PATH } from '../config';
import { vendorAliasesFor } from '../lib/ids';
import { log } from '../lib/log';
import type { Continent } from '../../../src/lib/types';

/**
 * motif / nameZh / accentColor 由 src/data/vendor-registry.ts 负责，不归本管线。
 * 这里对它的形状刻意宽松：只要导出了 VENDOR_REGISTRY 就用，缺哪个字段就补哪个，
 * 免得两边并行开发时因为多一个少一个字段互相把对方搞崩。
 */
export interface VendorRegistryEntry {
  nameZh?: string;
  motif?: string;
  accentColor?: string;
  country?: string;
  continent?: Continent;
  homepage?: string | null;
}

/** 未知厂商回落到「神秘旅人」，这是数据契约里写死的零维护承诺。 */
export const FALLBACK_MOTIF = 'wanderer';
export const FALLBACK_ACCENT = '#7c8da6';

/**
 * 兜底注册表。它有两个用途：
 *   1. src/data/vendor-registry.ts 整个不存在时顶上；
 *   2. 真注册表存在但漏了某个厂商时，按字段逐个补空（主要是 country）。
 * 这里刻意不写 motif / accentColor——形象设定是人的活，管线编不出来，
 * 缺了就落到 FALLBACK_MOTIF。
 */
const FALLBACK_REGISTRY: Record<string, VendorRegistryEntry> = {
  openai: { nameZh: 'OpenAI', country: 'US' },
  anthropic: { nameZh: 'Anthropic', country: 'US' },
  google: { nameZh: '谷歌', country: 'US' },
  meta: { nameZh: 'Meta', country: 'US' },
  xai: { nameZh: 'xAI', country: 'US' },
  microsoft: { nameZh: '微软', country: 'US' },
  nvidia: { nameZh: '英伟达', country: 'US' },
  amazon: { nameZh: '亚马逊', country: 'US' },
  cohere: { nameZh: 'Cohere', country: 'CA' },
  mistral: { nameZh: 'Mistral', country: 'FR' },
  ibm: { nameZh: 'IBM', country: 'US' },
  perplexity: { nameZh: 'Perplexity', country: 'US' },
  poolside: { nameZh: 'Poolside', country: 'US' },
  'arcee-ai': { nameZh: 'Arcee AI', country: 'US' },
  thinkingmachines: { nameZh: 'Thinking Machines', country: 'US' },
  nousresearch: { nameZh: 'Nous Research', country: 'US' },
  inception: { nameZh: 'Inception Labs', country: 'US' },
  morph: { nameZh: 'Morph', country: 'US' },
  relace: { nameZh: 'Relace', country: 'US' },
  liquid: { nameZh: 'Liquid AI', country: 'US' },
  writer: { nameZh: 'Writer', country: 'US' },
  rekaai: { nameZh: 'Reka AI', country: 'US' },
  allenai: { nameZh: 'Allen AI', country: 'US' },
  ai21: { nameZh: 'AI21 Labs', country: 'IL' },
  tii: { nameZh: 'TII', country: 'AE' },
  'swiss-ai': { nameZh: 'Swiss AI', country: 'CH' },
  trendyol: { nameZh: 'Trendyol', country: 'TR' },
  sdaia: { nameZh: 'SDAIA', country: 'SA' },
  deepseek: { nameZh: '深度求索', country: 'CN' },
  alibaba: { nameZh: '阿里巴巴', country: 'CN' },
  zhipuai: { nameZh: '智谱 AI', country: 'CN' },
  moonshotai: { nameZh: '月之暗面', country: 'CN' },
  minimax: { nameZh: 'MiniMax', country: 'CN' },
  'bytedance-seed': { nameZh: '字节跳动 Seed', country: 'CN' },
  tencent: { nameZh: '腾讯', country: 'CN' },
  baidu: { nameZh: '百度', country: 'CN' },
  xiaomi: { nameZh: '小米', country: 'CN' },
  meituan: { nameZh: '美团', country: 'CN' },
  stepfun: { nameZh: '阶跃星辰', country: 'CN' },
  inclusionai: { nameZh: '蚂蚁百灵', country: 'CN' },
  kwaipilot: { nameZh: '快手', country: 'CN' },
  deepreinforce: { nameZh: 'Deep Reinforce', country: 'CN' },
  '01ai': { nameZh: '零一万物', country: 'CN' },
  iflytek: { nameZh: '科大讯飞', country: 'CN' },
  sensetime: { nameZh: '商汤', country: 'CN' },
  skywork: { nameZh: '昆仑天工', country: 'CN' },
  upstage: { nameZh: 'Upstage', country: 'KR' },
  naver: { nameZh: 'Naver', country: 'KR' },
  sakana: { nameZh: 'Sakana AI', country: 'JP' },
  sarvam: { nameZh: 'Sarvam AI', country: 'IN' },
  aisingapore: { nameZh: 'AI Singapore', country: 'SG' },
};

/**
 * 注册表没提供 continentForCountry 时的兜底划分。
 * `east` 是「国内」：总部在中国（含港澳台）的厂商；其余全部是「国外」。
 * 与 src/data/vendor-registry.ts 的 EAST_COUNTRIES 保持一致。
 */
const EAST_COUNTRIES = new Set(['CN', 'HK', 'MO', 'TW']);

function defaultContinentForCountry(country: string | null): Continent {
  if (!country) return 'west';
  return EAST_COUNTRIES.has(country.toUpperCase()) ? 'east' : 'west';
}

export interface LoadedRegistry {
  entries: Record<string, VendorRegistryEntry>;
  continentForCountry: (country: string | null) => Continent;
  source: 'src/data/vendor-registry.ts' | 'fallback';
  fallbackMotif: string;
}

export async function loadVendorRegistry(): Promise<LoadedRegistry> {
  const fallback: LoadedRegistry = {
    entries: FALLBACK_REGISTRY,
    continentForCountry: defaultContinentForCountry,
    source: 'fallback',
    fallbackMotif: FALLBACK_MOTIF,
  };

  if (!fs.existsSync(VENDOR_REGISTRY_PATH)) {
    log.warn(
      `未找到 src/data/vendor-registry.ts，使用 scripts/sync 内置的最小兜底注册表（motif 全部为 '${FALLBACK_MOTIF}'）`,
    );
    return fallback;
  }
  try {
    // specifier 在运行时拼出来，这样文件不存在时 TypeScript 也不会报模块解析错误。
    const specifier = pathToFileURL(VENDOR_REGISTRY_PATH).href;
    const mod = (await import(specifier)) as {
      VENDOR_REGISTRY?: Record<string, VendorRegistryEntry>;
      FALLBACK_MOTIF?: string;
      continentForCountry?: (country: string | null | undefined) => Continent;
    };
    const registry = mod.VENDOR_REGISTRY;
    if (registry && typeof registry === 'object' && Object.keys(registry).length > 0) {
      log.info(`已加载 src/data/vendor-registry.ts：${Object.keys(registry).length} 个厂商`);
      return {
        entries: registry,
        continentForCountry:
          typeof mod.continentForCountry === 'function'
            ? (c) => mod.continentForCountry!(c)
            : defaultContinentForCountry,
        source: 'src/data/vendor-registry.ts',
        fallbackMotif: mod.FALLBACK_MOTIF ?? FALLBACK_MOTIF,
      };
    }
    log.warn('src/data/vendor-registry.ts 存在但未导出可用的 VENDOR_REGISTRY，回落到内置兜底');
  } catch (err) {
    log.warn(`加载 src/data/vendor-registry.ts 失败，回落到内置兜底：${String(err)}`);
  }
  return fallback;
}

function findByAlias(
  entries: Record<string, VendorRegistryEntry>,
  vendorId: string,
): VendorRegistryEntry | null {
  for (const key of vendorAliasesFor(vendorId)) {
    const hit = entries[key];
    if (hit) return hit;
  }
  return null;
}

/**
 * 这个厂商是否在 `src/data/vendor-registry.ts` 的 VENDOR_REGISTRY 里（按别名回退查）。
 * 只看加载到的注册表本身，不算 FALLBACK_REGISTRY——单源快速晋升的依据是「人工登记过的厂商」，
 * 兜底表是管线自己写的，不该给自己发通行证。
 */
export function isRegisteredVendor(registry: LoadedRegistry, vendorId: string): boolean {
  return registry.source === 'src/data/vendor-registry.ts' && findByAlias(registry.entries, vendorId) !== null;
}

/**
 * 注册表的键名不一定跟管线归一出来的 vendorId 完全一致
 * （实测注册表用 `z-ai`/`bytedance`，而 models.dev 的创作者前缀是 `zhipuai`/`bytedance-seed`），
 * 所以按别名逐个回退查找，而不是硬要求两边键名对齐。
 * 真注册表优先，缺的字段再从兜底表里补，两者都没有才留空。
 */
export function lookupVendorProfile(
  registry: LoadedRegistry,
  vendorId: string,
): VendorRegistryEntry | null {
  const primary = findByAlias(registry.entries, vendorId);
  const fallback = findByAlias(FALLBACK_REGISTRY, vendorId);
  if (!primary && !fallback) return null;
  return {
    nameZh: primary?.nameZh ?? fallback?.nameZh,
    motif: primary?.motif ?? fallback?.motif,
    accentColor: primary?.accentColor ?? fallback?.accentColor,
    country: primary?.country ?? fallback?.country,
    continent: primary?.continent ?? fallback?.continent,
    homepage: primary?.homepage ?? fallback?.homepage ?? null,
  };
}
