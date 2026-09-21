/**
 * 中文像素字体子集化。
 *
 * Fusion Pixel Font 的 zh_hans 完整字重是 660 KB，直接上首屏不可接受。
 * 本站的中文文案全部来自源码里的字符串模板（上游数据只提供 ASCII 的模型名与厂商 id），
 * 所以用到的汉字集合在构建期就完全确定，可以精确子集化。
 *
 * 产物 public/fonts/pixel-zh.woff2 会提交进仓库，因此构建环境不需要 Python。
 * 只有改动了中文文案时才需要重跑本脚本。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const SRC_FONT = join(ROOT, 'assets/fonts/fusion-pixel-12px-proportional-zh_hans.otf.woff2');
const OUT_FONT = join(ROOT, 'public/fonts/pixel-zh.woff2');

/** 无论源码里有没有出现都必须保留的字符：ASCII、常用标点、箭头、货币与单位符号。 */
const ALWAYS_INCLUDE = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  ...'·—…、。，；：？！“”‘’（）《》〈〉【】「」〖〗～',
  ...'←↑→↓↔⇄★☆♦●○◆■□▲▼✓✕',
  ...'￥€£¥°％‰±×÷≈≠≤≥∞',
].join('');

const SCAN_DIRS = ['src', 'scripts'];
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.css', '.md']);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(extname(entry))) out.push(full);
  }
  return out;
}

function collectChars(): string {
  const chars = new Set(ALWAYS_INCLUDE);
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      for (const ch of readFileSync(file, 'utf8')) {
        // 只补收非 ASCII 字符；ASCII 已经全量包含在 ALWAYS_INCLUDE 里
        if (ch.codePointAt(0)! > 127) chars.add(ch);
      }
    }
  }
  return Array.from(chars).sort().join('');
}

function main() {
  if (!existsSync(SRC_FONT)) {
    throw new Error(`字体源文件缺失：${SRC_FONT}`);
  }
  mkdirSync(join(ROOT, 'public/fonts'), { recursive: true });

  const text = collectChars();
  const cjkCount = Array.from(text).filter((c) => c.codePointAt(0)! > 127).length;

  execFileSync(
    'pyftsubset',
    [
      SRC_FONT,
      `--text=${text}`,
      '--output-file=' + OUT_FONT,
      '--flavor=woff2',
      '--layout-features=',
      '--no-hinting',
      '--desubroutinize',
      '--drop-tables+=DSIG',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );

  const srcKB = statSync(SRC_FONT).size / 1024;
  const outKB = statSync(OUT_FONT).size / 1024;
  console.log(
    `子集化完成：${Array.from(text).length} 个字符（其中非 ASCII ${cjkCount} 个）\n` +
      `  ${srcKB.toFixed(0)} KB → ${outKB.toFixed(1)} KB （${((outKB / srcKB) * 100).toFixed(1)}%）`,
  );
}

main();
