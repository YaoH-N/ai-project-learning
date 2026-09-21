/**
 * 许可证归一化到 SPDX 标识。
 *
 * models.dev 的 license 覆盖率只有 9%，而且值完全没归一化：
 * "MIT" 与 "MIT License" 并存、"Apache 2.0" 与 "Apache-2.0" 并存，
 * 还混进过 "qwen3.8-max" 这种明显串位的脏值。
 * 无法确定时返回 null 而不是猜测值（数据契约的明确要求）。
 */
const EXACT: Record<string, string> = {
  mit: 'MIT',
  'mit license': 'MIT',
  'the mit license': 'MIT',
  'apache 2.0': 'Apache-2.0',
  'apache-2.0': 'Apache-2.0',
  apache2: 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0',
  'apache 2': 'Apache-2.0',
  bsd: 'BSD-3-Clause',
  'bsd-3-clause': 'BSD-3-Clause',
  'bsd 3-clause': 'BSD-3-Clause',
  'bsd-2-clause': 'BSD-2-Clause',
  'cc-by-4.0': 'CC-BY-4.0',
  'cc by 4.0': 'CC-BY-4.0',
  'cc-by-sa-4.0': 'CC-BY-SA-4.0',
  'cc-by-nc-4.0': 'CC-BY-NC-4.0',
  'cc by nc 4.0': 'CC-BY-NC-4.0',
  'cc-by-nc-sa-4.0': 'CC-BY-NC-SA-4.0',
  'cc0-1.0': 'CC0-1.0',
  agpl: 'AGPL-3.0',
  'agpl-3.0': 'AGPL-3.0',
  'gpl-3.0': 'GPL-3.0',
  'lgpl-3.0': 'LGPL-3.0',
  'mpl-2.0': 'MPL-2.0',
  unlicense: 'Unlicense',
  'openmdw-1.1': 'OpenMDW-1.1',
  'openmdw-1.0': 'OpenMDW-1.0',
  openrail: 'OpenRAIL',
  'openrail++': 'OpenRAIL++',
  'bigscience-openrail-m': 'BigScience-OpenRAIL-M',
  'bigcode-openrail-m': 'BigCode-OpenRAIL-M',
};

/**
 * 厂商自定义许可不在 SPDX 列表里，但它们是稳定、可识别的具名许可，
 * 统一成 `LicenseRef-*` 形式（SPDX 官方为自定义许可保留的前缀），既不算猜测也不丢信息。
 */
const CUSTOM: Array<[RegExp, string]> = [
  [/^deepseek/, 'LicenseRef-DeepSeek-Model'],
  [/^llama[ -]?4/, 'LicenseRef-Llama-4-Community'],
  [/^llama[ -]?3\.3/, 'LicenseRef-Llama-3.3-Community'],
  [/^llama[ -]?3\.2/, 'LicenseRef-Llama-3.2-Community'],
  [/^llama[ -]?3\.1/, 'LicenseRef-Llama-3.1-Community'],
  [/^llama[ -]?3/, 'LicenseRef-Llama-3-Community'],
  [/^llama/, 'LicenseRef-Llama-Community'],
  [/^gemma/, 'LicenseRef-Gemma'],
  [/^qwen[- ]?community/, 'LicenseRef-Qwen-Community'],
  [/^qwen/, 'LicenseRef-Qwen'],
  [/^tongyi/, 'LicenseRef-Tongyi-Qianwen'],
  [/^mistral ai non-?production/, 'LicenseRef-Mistral-AI-Non-Production'],
  [/^mistral research/, 'LicenseRef-Mistral-Research'],
  [/^mistral/, 'LicenseRef-Mistral'],
  [/^nvidia open model/, 'LicenseRef-NVIDIA-Open-Model'],
  [/^nvidia/, 'LicenseRef-NVIDIA'],
  [/^falcon/, 'LicenseRef-Falcon'],
  [/^glm/, 'LicenseRef-GLM'],
  [/^modified mit/, 'LicenseRef-Modified-MIT'],
  [/^kimi/, 'LicenseRef-Kimi'],
  [/^seed/, 'LicenseRef-Seed'],
  [/^hunyuan|^tencent/, 'LicenseRef-Tencent-Hunyuan'],
  [/^intel research/, 'LicenseRef-Intel-Research'],
  [/^ai2 impact/, 'LicenseRef-AI2-ImpACT'],
];

/** 值里出现这些形态说明它压根不是许可证（例如把模型 id 写进了 license 字段）。 */
function looksBogus(value: string): boolean {
  if (value.length < 2 || value.length > 80) return true;
  if (/^https?:\/\//.test(value)) return false;
  // 形如 "qwen3.8-max"：有数字点版本号且完全不含 license/apache/mit 之类的许可词根。
  const hasLicenseWord =
    /(licen[cs]e|mit|apache|bsd|gpl|cc|openrail|proprietary|research|community|non-?commercial|mdw|rail|unlicense|public domain)/.test(
      value,
    );
  const looksLikeModelId = /^[a-z0-9]+[.-]\d/.test(value) || /\b(mini|max|pro|flash|nano|turbo)\b/.test(value);
  return looksLikeModelId && !hasLicenseWord;
}

export function normalizeLicense(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  const key = value.toLowerCase().replace(/\s+/g, ' ');

  if (EXACT[key]) return EXACT[key];
  if (looksBogus(key)) return null;

  // "apache-2.0" 之类写法的通用兜底
  const spdxish = /^([a-z0-9]+)(?:[-_ ]?([0-9]+(?:\.[0-9]+)?))?$/.exec(key);
  if (spdxish) {
    const [, family, version] = spdxish;
    if (family === 'apache' && version) return `Apache-${version.includes('.') ? version : `${version}.0`}`;
    if (family === 'mit') return 'MIT';
  }

  for (const [re, spdx] of CUSTOM) {
    if (re.test(key)) return spdx;
  }
  if (/proprietary|closed|commercial only/.test(key)) return 'LicenseRef-Proprietary';
  return null;
}
