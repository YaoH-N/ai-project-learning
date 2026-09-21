/**
 * 定价单位归一化。
 *
 * 上游有四种写法：
 *   models.dev      美元/百万 token，number      → 5
 *   OpenRouter      美元/token，字符串           → "0.000005"
 *   Vercel Gateway  美元/token，字符串           → "0.00000012"
 *   LiteLLM         美元/token，number 或 5E-7   → 0.000005 / 5e-7
 *
 * 直接 float 相乘会得到 0.000005 * 1e6 = 5.000000000000001 这类脏值，
 * 所以这里用「十进制字符串 + 指数」表示，缩放只改指数，最后一次性转成 number。
 */
interface Decimal {
  neg: boolean;
  /** 无前导零的有效数字串，值 = digits * 10^exp */
  digits: string;
  exp: number;
}

const NUMERIC = /^([+-])?(\d+)?(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

export function parseDecimal(input: unknown): Decimal | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    // 用 toString 拿到 JS 的最短往返表示，再走同一条字符串解析路径，
    // 这样 5e-7 与 "0.0000005" 得到完全相同的结果。
    return parseDecimal(input.toString());
  }
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const m = NUMERIC.exec(raw);
  if (!m) return null;
  const [, sign, intPart, fracPart, expPart] = m;
  if (intPart === undefined && fracPart === undefined) return null;

  const int = intPart ?? '';
  const frac = fracPart ?? '';
  let digits = `${int}${frac}`.replace(/^0+/, '');
  let exp = -frac.length + (expPart ? Number.parseInt(expPart, 10) : 0);
  if (digits === '') {
    digits = '0';
    exp = 0;
  }
  // 去掉尾部的零，把它折进指数，保证同一数值只有一种表示。
  while (digits.length > 1 && digits.endsWith('0')) {
    digits = digits.slice(0, -1);
    exp += 1;
  }
  return { neg: sign === '-' && digits !== '0', digits, exp };
}

function scale(d: Decimal, powerOfTen: number): Decimal {
  return { ...d, exp: d.exp + powerOfTen };
}

function toPlainString(d: Decimal): string {
  const sign = d.neg ? '-' : '';
  if (d.digits === '0') return '0';
  if (d.exp >= 0) return `${sign}${d.digits}${'0'.repeat(d.exp)}`;
  const k = -d.exp;
  if (d.digits.length > k) {
    return `${sign}${d.digits.slice(0, d.digits.length - k)}.${d.digits.slice(d.digits.length - k)}`;
  }
  return `${sign}0.${'0'.repeat(k - d.digits.length)}${d.digits}`;
}

function toNumber(d: Decimal): number {
  return Number(toPlainString(d));
}

/** 美元/token → 美元/百万 token。 */
export function perTokenToPerMTok(input: unknown): number | null {
  const d = parseDecimal(input);
  if (!d) return null;
  return toNumber(scale(d, 6));
}

/** models.dev 已经是美元/百万 token，只做解析与清洗。 */
export function perMTokAsIs(input: unknown): number | null {
  const d = parseDecimal(input);
  if (!d) return null;
  return toNumber(d);
}

/**
 * 定价合理性：负数一定是解析错误；0 在上游普遍表示「免费/未知」，
 * 两者都归一成 null，避免把 0 当成真实价格写进快照（合理性校验闸门也会查这一条）。
 */
export function sanitizePrice(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return value;
}
