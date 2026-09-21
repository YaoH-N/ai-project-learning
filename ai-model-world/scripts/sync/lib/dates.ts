import type { DatePrecision } from '../../../src/lib/types';

export interface LooseDate {
  /** 一律补齐成 YYYY-MM-DD，方便排序与 Date.parse；真实粒度看 precision。 */
  iso: string;
  precision: DatePrecision;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;
const YEAR = /^(\d{4})$/;
const SLASHED = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * 宽松日期解析。models.dev 有 9 条 release_date 只精确到 YYYY-MM，
 * 严格 ISO 解析器会静默给出错误值（调研里就因此得到过 lag=-190d 的假结果）。
 */
export function parseLooseDate(input: unknown): LooseDate | null {
  if (input === null || input === undefined) return null;

  // OpenRouter created / Vercel released 是 Unix 秒。
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) return null;
    const ms = input > 1e12 ? input : input * 1000;
    const dt = new Date(ms);
    if (Number.isNaN(dt.getTime())) return null;
    return {
      iso: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
      precision: 'day',
    };
  }

  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // 带时间的 ISO 串（Epoch 的 Started at、HF 的 createdAt）只取日期部分。
  const isoHead = raw.includes('T') ? raw.slice(0, raw.indexOf('T')) : raw;

  let m = DAY.exec(isoHead) ?? SLASHED.exec(isoHead);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!valid(y, mo, d)) return null;
    return { iso: `${m[1]}-${pad(mo)}-${pad(d)}`, precision: 'day' };
  }
  m = MONTH.exec(isoHead);
  if (m) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { iso: `${m[1]}-${pad(mo)}-01`, precision: 'month' };
  }
  m = YEAR.exec(isoHead);
  if (m) {
    return { iso: `${m[1]}-01-01`, precision: 'year' };
  }
  return null;
}

export function toEpochDay(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);
}

/** 只精确到月/年的日期不该被当成精确日来比较，这里给出可比的中点。 */
export function comparableDay(value: LooseDate): number {
  return toEpochDay(value.iso);
}

export function todayIso(now: Date): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}
