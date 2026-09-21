import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CACHE_DIR, HTTP } from '../config';
import { ensureDir, writeFileAtomic } from './fsx';
import { errorMessage, log } from './log';

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  /** 关掉 ETag 条件请求（例如二进制大文件想强制重取时）。 */
  noCache?: boolean;
  label?: string;
}

export interface FetchResult {
  body: Buffer;
  status: number;
  /** 命中 304、直接复用本地缓存体 */
  notModified: boolean;
  etag: string | null;
}

interface CacheEntry {
  url: string;
  etag: string | null;
  lastModified: string | null;
  bodyBase64: string;
  savedAt: string;
}

function cachePath(url: string): string {
  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
  return path.join(CACHE_DIR, 'http', `${hash}.json`);
}

function readCache(url: string): CacheEntry | null {
  const p = cachePath(url);
  if (!fs.existsSync(p)) return null;
  try {
    const entry = JSON.parse(fs.readFileSync(p, 'utf8')) as CacheEntry;
    return entry.url === url ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(url: string, etag: string | null, lastModified: string | null, body: Buffer) {
  const entry: CacheEntry = {
    url,
    etag,
    lastModified,
    bodyBase64: body.toString('base64'),
    savedAt: new Date().toISOString(),
  };
  ensureDir(path.join(CACHE_DIR, 'http'));
  writeFileAtomic(cachePath(url), JSON.stringify(entry));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 带重试与 ETag 条件请求的抓取。
 * models.dev 的 api.json 有 4.4MB 且带 `etag` + `must-revalidate`，
 * 条件请求命中 304 时零流量，这是官方推荐的高频轮询方式。
 */
export async function fetchWithCache(url: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? HTTP.timeoutMs;
  const retries = opts.retries ?? HTTP.retries;
  const label = opts.label ?? url;
  const cached = opts.noCache ? null : readCache(url);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const headers: Record<string, string> = {
        'user-agent': HTTP.userAgent,
        accept: '*/*',
      };
      if (cached?.etag) headers['if-none-match'] = cached.etag;
      if (cached?.lastModified) headers['if-modified-since'] = cached.lastModified;

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'follow',
      });

      if (res.status === 304 && cached) {
        log.info(`${label} → 304 Not Modified（复用本地缓存 ${cached.bodyBase64.length} B64）`);
        return {
          body: Buffer.from(cached.bodyBase64, 'base64'),
          status: 304,
          notModified: true,
          etag: cached.etag,
        };
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const body = Buffer.from(await res.arrayBuffer());
      const etag = res.headers.get('etag');
      const lastModified = res.headers.get('last-modified');
      if (!opts.noCache) writeCache(url, etag, lastModified, body);
      log.info(`${label} → ${res.status} ${body.byteLength} bytes`);
      return { body, status: res.status, notModified: false, etag };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        log.warn(`${label} 第 ${attempt + 1} 次失败：${errorMessage(err)}，${HTTP.retryDelayMs}ms 后重试`);
        await sleep(HTTP.retryDelayMs);
      }
    }
  }

  // 第一层容错：上游挂掉时优先用上一次成功抓到的正文，让管线继续跑完。
  if (cached) {
    log.warn(`${label} 全部重试失败（${errorMessage(lastErr)}），回落到本地缓存快照`);
    return {
      body: Buffer.from(cached.bodyBase64, 'base64'),
      status: 0,
      notModified: true,
      etag: cached.etag,
    };
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<{
  data: T;
  fromCache: boolean;
}> {
  const res = await fetchWithCache(url, opts);
  return { data: JSON.parse(res.body.toString('utf8')) as T, fromCache: res.notModified };
}
