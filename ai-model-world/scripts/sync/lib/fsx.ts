import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * 第二层容错的「原子替换」：先写同目录临时文件再 rename。
 * 同目录保证 rename 落在同一文件系统上，是原子操作；读者永远看不到半截文件。
 */
export function writeFileAtomic(filePath: string, contents: string | Buffer): void {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

export function readJsonIfExists<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}
