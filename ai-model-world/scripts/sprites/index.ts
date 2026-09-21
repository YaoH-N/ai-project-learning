/**
 * Sprite build entry point.
 *
 *   npx tsx scripts/sprites/index.ts
 *
 * Reads `data/models.json` (falling back to a built-in mock snapshot while the
 * data pipeline is still being written), composes one sheet per model into
 * `public/sprites/`, writes `manifest.json`, and renders the QA contact sheet.
 *
 * Offline, free, and deterministic: identical input always yields identical bytes.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildSizeScale } from '../../src/lib/derive.ts';
import type { ModelRecord, Vendor, WorldSnapshot } from '../../src/lib/types.ts';
import type { SpriteEntry, SpriteManifest } from '../../src/lib/sprite/types.ts';
import { LpcCatalog } from './catalog.ts';
import { CELL, COLUMNS, compose, OUT_H, OUT_ROW, OUT_W } from './compose.ts';
import { type Card, decode, renderContactSheet, type Section } from './contact-sheet.ts';
import { hashInt } from './hash.ts';
import { mockSnapshot } from './mock-models.ts';
import { deriveSpec, type CharacterSpec } from './spec.ts';
import type { Raster } from './raster.ts';

/** Bump when a composer change should invalidate cached sheets. */
const PIPELINE_VERSION = '1.0.0';

const ROOT = path.resolve(__dirname, '../..');
const SNAPSHOT_FILE = path.join(ROOT, 'data/models.json');
const OUT_DIR = path.join(ROOT, 'public/sprites');
const SAMPLES_DIR = path.join(ROOT, 'docs/samples');

function loadSnapshot(): { snapshot: WorldSnapshot; source: string } {
  if (process.argv.includes('--mock')) {
    return { snapshot: mockSnapshot(), source: 'built-in mock snapshot (--mock)' };
  }
  if (fs.existsSync(SNAPSHOT_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8')) as WorldSnapshot;
      if (Array.isArray(parsed.models) && parsed.models.length > 0) {
        return { snapshot: parsed, source: path.relative(ROOT, SNAPSHOT_FILE) };
      }
    } catch (err) {
      console.warn(`[warn] ${SNAPSHOT_FILE} unreadable (${(err as Error).message}); using mock snapshot`);
    }
  }
  return { snapshot: mockSnapshot(), source: 'built-in mock snapshot (data/models.json absent)' };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Fallback rung 2: a vendor we have never seen still gets a stable look, with no
 * table entry, no network call, and no chance of failure.
 */
function fallbackVendor(id: string): Vendor {
  const [r, g, b] = hslToRgb(hashInt(`vendor-color:${id}`, 'hue', 360) / 360, 0.52, 0.48);
  return {
    id,
    name: id,
    nameZh: id,
    country: 'ZZ',
    continent: 'west',
    motif: 'wanderer',
    accentColor: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    homepage: null,
  };
}

/** 1-based ranking on ECI; ties break on model id so the order is stable. */
function rankByEci(models: ModelRecord[]): Map<string, number> {
  return new Map(
    models
      .filter((m) => typeof m.benchmarks.eci === 'number')
      .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id))
      .map((m, i) => [m.id, i + 1]),
  );
}

function safeSlug(model: ModelRecord): string {
  const raw = model.slug || model.id;
  return raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function flagMarks(spec: CharacterSpec): string {
  const f = spec.flags;
  return [
    f.reasoning ? 'HALO' : '',
    f.audio ? 'PHONES' : '',
    f.imageIn ? 'GLASS' : 'PATCH',
    f.imageOut ? 'BRUSH' : '',
    f.toolCall ? 'BELT' : '',
    f.openWeights ? 'KEY' : '',
    f.opaqueParams ? 'FOG' : '',
    f.fresh ? 'NEW' : '',
    f.retired ? 'GHOST' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function cardSubtitle(spec: CharacterSpec): string {
  const rank = spec.rank ? `#${spec.rank}` : '#-';
  return `S${spec.sizeTier} P${spec.priceTier} ${rank} ${spec.body} ${spec.motifFamily} ${flagMarks(spec)}`;
}

// --- reference characters ------------------------------------------------
// Every reference uses the same model id, so the hash seed is identical and any
// visible difference is caused solely by the attribute under test.

const REFERENCE_VENDOR: Vendor = {
  id: 'reference',
  name: 'Reference',
  nameZh: '参照',
  country: 'ZZ',
  continent: 'west',
  motif: 'scholar',
  accentColor: '#4D6BFE',
  homepage: null,
};

function referenceModel(patch: Partial<ModelRecord> = {}): ModelRecord {
  return {
    id: 'reference/ladder',
    slug: 'reference-ladder',
    name: 'Reference',
    vendorId: 'reference',
    releaseDate: '2025-01-01',
    releaseDatePrecision: 'day',
    knowledgeCutoff: null,
    retiredAt: null,
    contextWindow: 128_000,
    maxOutput: null,
    pricing: { inputPerMTok: null, outputPerMTok: 5, cachedInputPerMTok: null },
    modalities: { input: ['text'], output: ['text'] },
    capabilities: { toolCall: false, reasoning: false, structuredOutput: null, promptCaching: null },
    openWeights: false,
    license: null,
    params: { totalB: 100, activeB: null, confidence: 'exact' },
    benchmarks: {
      eci: null,
      swe_bench_verified: null,
swe_bench_vendor: null,
swe_bench_pro: null,
      aime: null,
      gpqa_diamond: null,
      arc_agi_2: null,
      fiction_live: null,
      webdev_arena_elo: null,
    },
    coding: [],
    provenance: {},
    firstSeenAt: '2025-01-01',
    ...patch,
  };
}

async function referenceCard(
  catalog: LpcCatalog,
  now: Date,
  title: string,
  patch: Partial<ModelRecord>,
  rank: number | null = null,
): Promise<Card> {
  const model = referenceModel(patch);
  // A one-model scale is enough: only `estimated` is read, and that depends on
  // the model's own parameter confidence, not on the snapshot's quantiles.
  const sizeScale = buildSizeScale([model]);
  const spec = deriveSpec({ model, vendor: REFERENCE_VENDOR, rank, now, sizeScale }, catalog);
  const { png } = await compose(spec, catalog);
  return { sheet: await decode(png), title, subtitle: cardSubtitle(spec) };
}

async function main() {
  const started = Date.now();
  const { snapshot, source } = loadSnapshot();
  const catalog = LpcCatalog.load();
  const now = new Date(snapshot.generatedAt || Date.now());
  const ranks = rankByEci(snapshot.models);
  const sizeScale = buildSizeScale(snapshot.models);
  const vendors = new Map(snapshot.vendors.map((v) => [v.id, v]));

  console.log(`[input] ${source}: ${snapshot.models.length} models, ${snapshot.vendors.length} vendors`);
  console.log(`[input] catalog ${catalog.data.items.length} items @ ${catalog.data.upstream.commit.slice(0, 10)}`);

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sprites: Record<string, SpriteEntry> = {};
  const built: { model: ModelRecord; spec: CharacterSpec; sheet: Raster }[] = [];
  const timings: number[] = [];
  const dropped: string[] = [];
  let synthesizedVendors = 0;

  for (const model of [...snapshot.models].sort((a, b) => a.id.localeCompare(b.id))) {
    let vendor = vendors.get(model.vendorId);
    if (!vendor) {
      vendor = fallbackVendor(model.vendorId);
      vendors.set(vendor.id, vendor);
      synthesizedVendors++;
    }
    const spec = deriveSpec({ model, vendor, rank: ranks.get(model.id) ?? null, now, sizeScale }, catalog);

    const t0 = Date.now();
    const result = await compose(spec, catalog);
    timings.push(Date.now() - t0);
    for (const d of result.dropped) dropped.push(`${spec.slug}: ${d}`);

    const slug = safeSlug(model);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.png`), result.png);
    built.push({ model, spec, sheet: await decode(result.png) });

    sprites[slug] = {
      slug,
      modelId: model.id,
      vendorId: vendor.id,
      file: `/sprites/${slug}.png`,
      width: OUT_W,
      height: OUT_H,
      bytes: result.png.length,
      sha256: createHash('sha256').update(result.png).digest('hex'),
      anchors: result.anchors,
      appearance: {
        motifFamily: spec.motifFamily,
        body: spec.body,
        sizeTier: spec.sizeTier,
        priceTier: spec.priceTier,
        rank: spec.rank,
        crown: spec.crown,
        flags: spec.flags,
        ramps: spec.ramps as Record<string, string>,
      },
      layers: spec.picks.map((p) => p.itemId),
    };
  }

  const manifest: SpriteManifest = {
    generatedAt: snapshot.generatedAt,
    pipeline: PIPELINE_VERSION,
    overlaysBaked: false,
    catalogCommit: catalog.data.upstream.commit,
    frame: { size: CELL, columns: COLUMNS, rows: 5 },
    rows: OUT_ROW,
    walkFrames: COLUMNS,
    sprites: Object.fromEntries(Object.entries(sprites).sort(([a], [b]) => a.localeCompare(b))),
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);

  // ---- QA contact sheet -------------------------------------------------
  const byVendorThenRank = [...built].sort(
    (a, b) =>
      a.model.vendorId.localeCompare(b.model.vendorId) ||
      (a.spec.rank ?? 1e9) - (b.spec.rank ?? 1e9) ||
      a.model.id.localeCompare(b.model.id),
  );

  // A spread of the cast: the leaderboard first, then one per head species and
  // per size tier, then whatever fills the remaining slots with new vendors.
  const highlights: typeof built = [];
  const seen = new Set<string>();
  const take = (entry: (typeof built)[number] | undefined) => {
    if (entry && !seen.has(entry.model.id)) {
      seen.add(entry.model.id);
      highlights.push(entry);
    }
  };
  for (const e of [...built].sort((a, b) => (a.spec.rank ?? 1e9) - (b.spec.rank ?? 1e9)).slice(0, 8)) take(e);
  for (const family of [...new Set(built.map((b) => b.spec.motifFamily))].sort()) {
    take(built.find((b) => b.spec.motifFamily === family));
  }
  for (const tier of [1, 2, 3, 4, 5]) take(built.find((b) => b.spec.sizeTier === tier));
  for (const flag of ['fresh', 'retired', 'imageOut', 'audio', 'openWeights'] as const) {
    take(built.find((b) => b.spec.flags[flag]));
  }
  const highlightCards: Card[] = highlights.slice(0, 24).map(({ model, spec, sheet }) => ({
    sheet,
    title: model.name.slice(0, 23),
    subtitle: cardSubtitle(spec),
  }));

  const sizeLadder: Card[] = [];
  for (const totalB of [8, 30, 100, 400, 900]) {
    sizeLadder.push(await referenceCard(catalog, now, `SIZE ${totalB}B`, { params: { totalB, activeB: null, confidence: 'exact' } }));
  }
  const priceLadder: Card[] = [];
  for (const out of [0.3, 1.2, 5, 20, 60]) {
    priceLadder.push(
      await referenceCard(catalog, now, `PRICE $${out}`, {
        pricing: { inputPerMTok: null, outputPerMTok: out, cachedInputPerMTok: null },
      }),
    );
  }

  // Identity signs only. Crown, halo, sparkle, fog and ghost are no longer baked,
  // so cards for them would be indistinguishable from BASE and would imply the
  // sprite carries state that it does not.
  const states: Card[] = [
    await referenceCard(catalog, now, 'BASE', {}),
    await referenceCard(catalog, now, 'IMAGE IN', { modalities: { input: ['text', 'image'], output: ['text'] } }),
    await referenceCard(catalog, now, 'AUDIO', { modalities: { input: ['text', 'audio'], output: ['text'] } }),
    await referenceCard(catalog, now, 'TOOL CALL', {
      capabilities: { toolCall: true, reasoning: false, structuredOutput: null, promptCaching: null },
    }),
    await referenceCard(catalog, now, 'IMAGE OUT', { modalities: { input: ['text'], output: ['text', 'image'] } }),
    await referenceCard(catalog, now, 'OPEN WEIGHTS', { openWeights: true }),
    await referenceCard(catalog, now, 'ALL SIGNS', {
      openWeights: true,
      modalities: { input: ['text', 'image', 'audio'], output: ['text', 'image'] },
      capabilities: { toolCall: true, reasoning: true, structuredOutput: null, promptCaching: null },
    }),
  ];

  const champion = built.find((b) => b.spec.rank === 1) ?? built[0];
  const sections: Section[] = [
    {
      kind: 'tiles',
      heading: `ALL ${built.length} CHARACTERS AT 1X, GROUPED BY VENDOR - HOUSE COLOUR SHOULD BLOCK UP PER VENDOR`,
      tiles: byVendorThenRank.map((b) => b.sheet),
    },
    { kind: 'cards', heading: 'SIZE LADDER - ONLY PARAMETER COUNT VARIES (SAME SEED, SAME VENDOR)', cards: sizeLadder },
    { kind: 'cards', heading: 'PRICE LADDER - ONLY OUTPUT PRICE VARIES (SAME SEED, SAME VENDOR)', cards: priceLadder },
    { kind: 'cards', heading: 'BAKED IDENTITY SIGNS - ONE FLAG AT A TIME (SAME SEED, SAME VENDOR)', cards: states },
    { kind: 'cards', heading: 'HIGHLIGHTS - LEADERBOARD, EACH HEAD SPECIES, EACH SIZE TIER', cards: highlightCards },
    { kind: 'strip', heading: `WALK CYCLE - ${champion.model.name.toUpperCase()}`, sheet: champion.sheet, rows: ['down', 'right', 'up', 'left'] },
  ];

  const contact = await renderContactSheet(sections, [
    `${built.length} characters  |  lpc ${catalog.data.upstream.commit.slice(0, 8)}  |  pipeline ${PIPELINE_VERSION}  |  snapshot ${snapshot.generatedAt.slice(0, 10)}`,
    'S=size tier 1-5  P=price tier 1-5  #=eci rank  |  baked signs: glass/patch=image in, phones=audio, brush=image out, belt=tools, key=open weights',
    'NOT baked (overlaysBaked=false): crown, thinking halo, newborn sparkle, fog cloak, retired ghost - the site draws those over the sprite using manifest anchors',
  ]);
  fs.mkdirSync(SAMPLES_DIR, { recursive: true });
  fs.writeFileSync(path.join(SAMPLES_DIR, 'sprite-contact-sheet.png'), contact);

  // ---- report -----------------------------------------------------------
  const totalBytes = Object.values(sprites).reduce((a, s) => a + s.bytes, 0);
  const avg = timings.reduce((a, b) => a + b, 0) / Math.max(1, timings.length);
  console.log(`\n[out] ${built.length} sprites -> public/sprites/ (${(totalBytes / 1048576).toFixed(2)} MB, avg ${(totalBytes / built.length / 1024).toFixed(1)} KB)`);
  console.log(`[out] compose ${avg.toFixed(1)} ms/character (min ${Math.min(...timings)} ms, max ${Math.max(...timings)} ms)`);
  console.log(`[out] contact sheet docs/samples/sprite-contact-sheet.png (${(contact.length / 1048576).toFixed(2)} MB)`);
  if (synthesizedVendors > 0) console.log(`[out] ${synthesizedVendors} unknown vendors got a hash-derived look`);
  if (dropped.length > 0) {
    console.log(`[warn] ${dropped.length} layer picks had no art for the chosen body type (silently skipped):`);
    for (const d of dropped.slice(0, 10)) console.log(`       ${d}`);
  }
  console.log(`[out] total ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
