/**
 * One-off vendoring step: pull a licence-filtered slice of the Universal LPC
 * Spritesheet Character Generator into `assets/lpc/`.
 *
 *   npx tsx scripts/sprites/fetch-lpc.ts
 *
 * Everything downstream (`scripts/sprites/index.ts`) reads only the vendored
 * output, so the build never touches the network.
 *
 * Upstream is pinned to a commit. Re-running with the same pin is idempotent.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type {
  BodyType,
  Catalog,
  CatalogCredit,
  CatalogItem,
  CatalogLayer,
  Material,
  PaletteBook,
} from './lpc-schema.ts';
import { BODY_TYPES } from './lpc-schema.ts';

const REPO = 'LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator';
const COMMIT = '6a437fcecefbc7b82b401ca319046f80d67cdd2b'; // master @ 2026-08-29
const RAW = `https://raw.githubusercontent.com/${REPO}/${COMMIT}`;
const API = `https://api.github.com/repos/${REPO}/git/trees/${COMMIT}`;

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'assets/lpc');
const SHEETS = path.join(OUT, 'sheets');

/** Only these animations are vendored. `walk` frame 0 doubles as the standing pose. */
const ANIMATIONS = ['walk'];

/**
 * A credit entry qualifies when it offers CC0 or OGA-BY. Everything that is
 * only CC-BY-SA / GPL is dropped so no ShareAlike obligation can attach.
 */
const PERMISSIVE = /^(CC0|OGA[-_ ]?BY)/i;
const LICENSE_FILTER = 'credits[].licenses must offer CC0 or OGA-BY';

/** Categories the composer can actually place. Anything else is dead weight. */
const USED_TYPES = new Set([
  'shadow',
  'body',
  'head',
  'hair',
  'clothes',
  'legs',
  'shoes',
  'dress',
  'neck',
  'necklace',
  'charm',
  'sash',
  'cape',
  'apron',
  'jacket',
  'vest',
  'sleeves',
  'socks',
  'belt',
  'facial_eyes',
  'shoulders',
  'bracers',
  'arms',
  'armour',
  'bauldron',
  'beard',
  'mustache',
  'earrings',
  'ears',
  'tail',
]);

/**
 * Pre-coloured items ship up to 48 colour folders each. Keeping all of them would
 * balloon the vendored set for no visual gain, so each item keeps at most
 * `VARIANT_CAP` colours, picked in this fixed priority order.
 */
const VARIANT_PRIORITY = [
  'white', 'black', 'gray', 'charcoal', 'slate', 'brown', 'walnut', 'tan', 'leather',
  'red', 'maroon', 'rose', 'pink', 'orange', 'yellow', 'gold', 'forest', 'green',
  'teal', 'sky', 'blue', 'navy', 'bluegray', 'lavender', 'purple', 'silver', 'steel',
  'iron', 'bronze', 'copper', 'brass', 'ceramic',
];
const VARIANT_CAP = 12;

const MATERIALS: Material[] = ['body', 'cloth', 'eye', 'hair', 'metal', 'wood'];

type Json = Record<string, unknown>;

interface RawCredit {
  file?: string;
  authors?: string[];
  licenses?: string[];
  urls?: string[];
}

async function get(url: string, tries = 5): Promise<Buffer | null> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      await sleep(400 * (i + 1));
    }
  }
  throw lastErr;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Longest `credits[].file` prefix wins, mirroring how upstream scopes attribution. */
function creditFor(credits: RawCredit[], dir: string): RawCredit | null {
  const target = dir.replace(/\/+$/, '');
  let best: RawCredit | null = null;
  let bestLen = -1;
  for (const c of credits) {
    const file = String(c.file ?? '').replace(/^\/+|\/+$/g, '');
    if (!file) continue;
    if (target === file || target.startsWith(`${file}/`)) {
      if (file.length > bestLen) {
        best = c;
        bestLen = file.length;
      }
    }
  }
  return best;
}

function permissiveOption(licenses: string[] | undefined): string | null {
  for (const l of licenses ?? []) {
    if (PERMISSIVE.test(l.trim())) return l.trim();
  }
  return null;
}

/** PNG IHDR is always the first chunk, so width/height sit at a fixed offset. */
function pngSize(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function fetchTree(subPath: string): Promise<string[]> {
  const buf = await get(`${API}:${subPath}?recursive=1`);
  if (!buf) throw new Error(`missing tree ${subPath}`);
  const tree = JSON.parse(buf.toString('utf8')) as {
    truncated: boolean;
    tree: { path: string; type: string }[];
  };
  if (tree.truncated) throw new Error(`tree ${subPath} truncated`);
  return tree.tree.filter((e) => e.type === 'blob' && e.path.endsWith('.json')).map((e) => e.path);
}

async function main() {
  const t0 = Date.now();
  console.log(`[fetch] ${REPO}@${COMMIT.slice(0, 10)}`);

  const defPaths = await fetchTree('sheet_definitions');
  const palPaths = await fetchTree('palette_definitions');
  console.log(`[fetch] ${defPaths.length} sheet definitions, ${palPaths.length} palette definitions`);

  const defs = await pool(defPaths, 24, async (p) => {
    const buf = await get(`${RAW}/sheet_definitions/${p}`);
    if (!buf) throw new Error(`missing ${p}`);
    return { id: p.replace(/\.json$/, ''), json: JSON.parse(buf.toString('utf8')) as Json };
  });

  const palRaw = await pool(palPaths, 12, async (p) => {
    const buf = await get(`${RAW}/palette_definitions/${p}`);
    if (!buf) throw new Error(`missing palette ${p}`);
    return { p, json: JSON.parse(buf.toString('utf8')) as Json };
  });

  const palettes: PaletteBook = { ramps: {}, base: {} };
  for (const m of MATERIALS) {
    const ramp = palRaw.find((x) => x.p === `${m}/${m}_ulpc.json`);
    const meta = palRaw.find((x) => x.p === `${m}/meta_${m}.json`);
    if (!ramp || !meta) throw new Error(`palette material ${m} incomplete`);
    palettes.ramps[m] = ramp.json as Record<string, string[]>;
    palettes.base[m] = String((meta.json as { base: string }).base);
  }

  // Pass 1 — turn every definition into candidate layers, dropping anything whose
  // attribution is ShareAlike-only or whose path is templated (face expressions).
  interface Candidate {
    item: CatalogItem;
    /** sheet path relative to `assets/lpc/sheets/` → upstream path */
    files: string[];
  }
  const candidates: Candidate[] = [];
  const stats = { defs: defs.length, typeSkipped: 0, licenseDropped: 0, templated: 0 };

  for (const { id, json } of defs) {
    const type = json.type_name as string | undefined;
    if (!type) continue;
    if (!USED_TYPES.has(type)) {
      stats.typeSkipped++;
      continue;
    }
    const credits = (json.credits as RawCredit[] | undefined) ?? [];

    const layers: CatalogLayer[] = [];
    const usedCredits = new Map<string, CatalogCredit>();
    let templated = false;
    let dropped = false;

    for (const key of Object.keys(json).sort()) {
      if (!/^layer_\d+$/.test(key)) continue;
      const layer = json[key] as Record<string, unknown>;
      if (layer.is_mask) continue;
      const dirs: Partial<Record<BodyType, string>> = {};
      for (const body of BODY_TYPES) {
        const dir = layer[body];
        if (typeof dir !== 'string') continue;
        if (dir.includes('${')) {
          templated = true;
          continue;
        }
        const credit = creditFor(credits, dir);
        const chosen = credit ? permissiveOption(credit.licenses) : null;
        if (!credit || !chosen) {
          dropped = true;
          continue;
        }
        dirs[body] = dir.replace(/\/+$/, '');
        const file = String(credit.file).replace(/^\/+|\/+$/g, '');
        if (!usedCredits.has(file)) {
          usedCredits.set(file, {
            file,
            authors: credit.authors ?? [],
            licenses: credit.licenses ?? [],
            chosen,
            urls: credit.urls ?? [],
          });
        }
      }
      if (Object.keys(dirs).length > 0) {
        layers.push({ zPos: Number(layer.zPos ?? 0), dirs });
      }
    }
    if (templated) stats.templated++;
    if (layers.length === 0) {
      if (dropped) stats.licenseDropped++;
      continue;
    }

    const rawVariants = (json.variants as string[] | undefined) ?? null;
    let variants: string[] | null = null;
    if (rawVariants && rawVariants.length > 0) {
      const ordered = VARIANT_PRIORITY.filter((v) => rawVariants.includes(v));
      const rest = rawVariants.filter((v) => !VARIANT_PRIORITY.includes(v)).sort();
      variants = [...ordered, ...rest].slice(0, VARIANT_CAP);
    }

    let recolor: Material[] | null = null;
    const rc = json.recolors as Json | undefined;
    if (rc) {
      const mats: Material[] = [];
      if (typeof rc.material === 'string') mats.push(rc.material as Material);
      for (const slot of Object.keys(rc).sort()) {
        if (!/^color_\d+$/.test(slot)) continue;
        const m = (rc[slot] as Json).material;
        if (typeof m === 'string') mats.push(m as Material);
      }
      const usable = mats.filter((m) => MATERIALS.includes(m));
      if (usable.length > 0) recolor = usable;
    }

    const files: string[] = [];
    for (const layer of layers) {
      for (const dir of Object.values(layer.dirs)) {
        for (const anim of ANIMATIONS) {
          if (variants) for (const v of variants) files.push(`${dir}/${anim}/${v}.png`);
          else files.push(`${dir}/${anim}.png`);
        }
      }
    }

    candidates.push({
      item: {
        id,
        name: String(json.name ?? id),
        type,
        layers,
        variants,
        recolor,
        credits: [...usedCredits.values()].sort((a, b) => a.file.localeCompare(b.file)),
      },
      files: [...new Set(files)].sort(),
    });
  }

  const wanted = [...new Set(candidates.flatMap((c) => c.files))].sort();
  console.log(
    `[filter] ${candidates.length} items kept of ${stats.defs} definitions ` +
      `(${stats.typeSkipped} unused category, ${stats.licenseDropped} ShareAlike-only, ${stats.templated} templated)`,
  );
  console.log(`[fetch] downloading ${wanted.length} sheets…`);

  fs.rmSync(SHEETS, { recursive: true, force: true });
  const missing = new Set<string>();
  const oddSize = new Set<string>();
  let bytes = 0;
  let done = 0;
  await pool(wanted, 24, async (rel) => {
    const buf = await get(`${RAW}/spritesheets/${rel}`);
    if (!buf) {
      missing.add(rel);
    } else {
      const { width, height } = pngSize(buf);
      if (width % 64 !== 0 || height !== 256) {
        oddSize.add(`${rel} (${width}x${height})`);
        missing.add(rel);
      } else {
        const dest = path.join(SHEETS, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        bytes += buf.length;
      }
    }
    if (++done % 200 === 0) console.log(`  ${done}/${wanted.length}`);
  });

  // Pass 2 — prune anything whose sheets turned out not to exist upstream.
  const items: CatalogItem[] = [];
  for (const { item } of candidates) {
    const layers: CatalogLayer[] = [];
    for (const layer of item.layers) {
      const dirs: Partial<Record<BodyType, string>> = {};
      for (const [body, dir] of Object.entries(layer.dirs) as [BodyType, string][]) {
        const need = item.variants
          ? item.variants.map((v) => `${dir}/walk/${v}.png`)
          : [`${dir}/walk.png`];
        if (need.some((f) => !missing.has(f))) dirs[body] = dir;
      }
      if (Object.keys(dirs).length > 0) layers.push({ ...layer, dirs });
    }
    if (layers.length === 0) continue;
    const variants = item.variants
      ? item.variants.filter((v) =>
          layers.some((l) => Object.values(l.dirs).some((d) => !missing.has(`${d}/walk/${v}.png`))),
        )
      : null;
    if (variants && variants.length === 0) continue;
    items.push({ ...item, layers, variants });
  }
  items.sort((a, b) => a.id.localeCompare(b.id));

  const catalog: Catalog = {
    upstream: { repo: REPO, commit: COMMIT, fetchedAt: new Date().toISOString().slice(0, 10) },
    animations: ANIMATIONS,
    frame: { size: 64, columns: 9, rows: 4 },
    licenseFilter: LICENSE_FILTER,
    items,
    palettes,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'catalog.json'), `${JSON.stringify(catalog, null, 1)}\n`);
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), renderCredits(items));

  const byType = new Map<string, number>();
  for (const it of items) byType.set(it.type, (byType.get(it.type) ?? 0) + 1);

  const fileCount = wanted.length - missing.size;
  console.log(
    `\n[done] ${fileCount} sheets, ${(bytes / 1048576).toFixed(2)} MB, ` +
      `${items.length} catalog items, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  console.log(`[done] ${missing.size} paths absent upstream, ${oddSize.size} wrong-sized`);
  if (oddSize.size > 0) console.log(`       e.g. ${[...oddSize].slice(0, 5).join(', ')}`);
  console.log(
    `[done] categories: ${[...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}=${n}`)
      .join(' ')}`,
  );
  const digest = createHash('sha256').update(fs.readFileSync(path.join(OUT, 'catalog.json'))).digest('hex');
  console.log(`[done] catalog.json sha256 ${digest.slice(0, 16)}`);
}

function renderCredits(items: CatalogItem[]): string {
  const byFile = new Map<string, CatalogCredit & { items: string[] }>();
  for (const item of items) {
    for (const c of item.credits) {
      const existing = byFile.get(c.file);
      if (existing) existing.items.push(item.name);
      else byFile.set(c.file, { ...c, items: [item.name] });
    }
  }
  const rows = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
  const authors = new Set<string>();
  for (const r of rows) for (const a of r.authors) authors.add(a);

  const lines: string[] = [];
  lines.push('# LPC 素材署名');
  lines.push('');
  lines.push(
    '本目录的 PNG 与元数据来自 [Universal LPC Spritesheet Character Generator]' +
      `(https://github.com/${REPO})，锁定在 commit \`${COMMIT}\`。`,
  );
  lines.push('');
  lines.push(
    '上游生成器的**代码**是 GPL-3.0，本项目未使用其任何代码——合成器为自研，' +
      '只消费 `sheet_definitions/` 的 JSON 元数据与 `spritesheets/` 的 PNG。',
  );
  lines.push('');
  lines.push(
    '上游多数资产是多重许可（任选其一遵守）。**本目录只保留提供 `CC0` 或 `OGA-BY` 选项的资产**，' +
      '纯 `CC-BY-SA` / `GPL` 的资产在 vendoring 阶段即被丢弃，因此本项目不承担任何 ShareAlike 传染义务，' +
      '只承担署名义务。下表的「采用许可」列即我们实际遵守的那一项。',
  );
  lines.push('');
  lines.push(`共 ${rows.length} 个资产目录，${authors.size} 位作者。`);
  lines.push('');
  lines.push('## 作者名单');
  lines.push('');
  lines.push([...authors].sort((a, b) => a.localeCompare(b)).join('、'));
  lines.push('');
  lines.push('## 逐资产明细');
  lines.push('');
  lines.push('| 资产目录 | 作者 | 采用许可 | 上游许可选项 | 来源 |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of rows) {
    const urls = r.urls.map((u, i) => `[${i + 1}](${u})`).join(' ');
    lines.push(
      `| \`${r.file}\` | ${r.authors.join('、') || '—'} | ${r.chosen} | ${r.licenses.join(' \\| ')} | ${urls || '—'} |`,
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
