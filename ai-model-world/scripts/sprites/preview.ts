/**
 * Eyeballing helper — not part of the build.
 *
 *   npx tsx scripts/sprites/preview.ts                  # attribute matrix
 *   npx tsx scripts/sprites/preview.ts openai/gpt-5.5   # one real model
 *
 * Writes a nearest-neighbour blow-up to `/tmp/sprite-preview.png` and prints the
 * resolved layer stack, which is the fastest way to find out why something did
 * or did not show up.
 */

import fs from 'node:fs';
import path from 'node:path';

import sharp from 'sharp';

import { buildSizeScale } from '../../src/lib/derive.ts';
import type { ModelRecord, Vendor, WorldSnapshot } from '../../src/lib/types.ts';
import { LpcCatalog } from './catalog.ts';
import { CELL, compose } from './compose.ts';


import { deriveSpec } from './spec.ts';

const ROOT = path.resolve(__dirname, '../..');
const ZOOM = Number(process.env.ZOOM ?? 6);

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

const MATRIX: [string, Partial<ModelRecord>, number | null][] = [
  ['base', {}, null],
  ['image-in', { modalities: { input: ['text', 'image'], output: ['text'] } }, null],
  ['audio', { modalities: { input: ['text', 'audio'], output: ['text'] } }, null],
  ...([1, 2, 3] as const).map(
    (n) =>
      [
        `halo${n}`,
        {
          capabilities: { toolCall: false, reasoning: true, structuredOutput: null, promptCaching: null },
          benchmarks: {
            eci: null,
            swe_bench_verified: null,
            swe_bench_vendor: null,
            swe_bench_pro: null,
            aime: [40, 65, 95][n - 1],
            gpqa_diamond: null,
            arc_agi_2: null,
            fiction_live: null,
            webdev_arena_elo: null,
          },
        },
        null,
      ] as [string, Partial<ModelRecord>, number | null],
  ),
  ['fog', { params: { totalB: null, activeB: null, confidence: 'unknown' } }, null],
  ['fresh', { releaseDate: '2026-08-20' }, null],
  ['rank1', {}, 1],
  ['rank3', {}, 3],
  ['rank9', {}, 9],
  ['size1', { params: { totalB: 8, activeB: null, confidence: 'exact' } }, null],
  ['size2', { params: { totalB: 30, activeB: null, confidence: 'exact' } }, null],
  ['size3', { params: { totalB: 100, activeB: null, confidence: 'exact' } }, null],
  ['size4', { params: { totalB: 400, activeB: null, confidence: 'exact' } }, null],
  ['size5', { params: { totalB: 900, activeB: null, confidence: 'exact' } }, null],
  ['price1', { pricing: { inputPerMTok: null, outputPerMTok: 0.3, cachedInputPerMTok: null } }, null],
  ['price2', { pricing: { inputPerMTok: null, outputPerMTok: 1.2, cachedInputPerMTok: null } }, null],
  ['price3', { pricing: { inputPerMTok: null, outputPerMTok: 5, cachedInputPerMTok: null } }, null],
  ['price4', { pricing: { inputPerMTok: null, outputPerMTok: 20, cachedInputPerMTok: null } }, null],
  ['price5', { pricing: { inputPerMTok: null, outputPerMTok: 60, cachedInputPerMTok: null } }, null],
];

async function main() {
  const catalog = LpcCatalog.load();
  const target = process.argv[2];
  const cases: { label: string; model: ModelRecord; vendor: Vendor; rank: number | null }[] = [];
  let now = new Date('2026-08-31T00:00:00Z');

  if (target) {
    const snapshotFile = path.join(ROOT, 'data/models.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')) as WorldSnapshot;
    now = new Date(snapshot.generatedAt);
    const model = snapshot.models.find((m) => m.id === target || m.slug === target);
    if (!model) throw new Error(`no model matches ${target}`);
    const vendor = snapshot.vendors.find((v) => v.id === model.vendorId) ?? REFERENCE_VENDOR;
    const ranked = snapshot.models
      .filter((m) => typeof m.benchmarks.eci === 'number')
      .sort((a, b) => b.benchmarks.eci! - a.benchmarks.eci! || a.id.localeCompare(b.id));
    const rank = ranked.findIndex((m) => m.id === model.id);
    cases.push({ label: model.name, model, vendor, rank: rank < 0 ? null : rank + 1 });
  } else {
    for (const [label, patch, rank] of MATRIX) {
      cases.push({ label, model: referenceModel(patch), vendor: REFERENCE_VENDOR, rank });
    }
  }

  const perRow = Math.min(cases.length, 9);
  const cells: { input: Buffer; left: number; top: number }[] = [];
  for (const [i, c] of cases.entries()) {
    const sizeScale = buildSizeScale([c.model]);
    const spec = deriveSpec({ model: c.model, vendor: c.vendor, rank: c.rank, now, sizeScale }, catalog);
    const result = await compose(spec, catalog);
    const size = `${result.anchors.body.width}x${result.anchors.body.height}`;
    console.log(
      `${c.label.padEnd(12)} ${size.padEnd(6)} ${spec.body.padEnd(6)} S${spec.sizeTier} P${spec.priceTier} ` +
        `${spec.motifFamily.padEnd(6)} ${spec.picks.map((p) => `${p.slot}=${p.itemId.split('/').pop()}${p.variant ? `:${p.variant}` : ''}`).join(' ')}`,
    );
    if (result.dropped.length > 0) console.log(`             dropped: ${result.dropped.join(', ')}`);
    cells.push({
      input: await sharp(result.png)
        .extract({ left: 0, top: 0, width: CELL, height: CELL })
        .resize({ width: CELL * ZOOM, height: CELL * ZOOM, kernel: 'nearest' })
        .toBuffer(),
      left: (i % perRow) * CELL * ZOOM,
      top: Math.floor(i / perRow) * CELL * ZOOM,
    });
  }

  const rows = Math.ceil(cases.length / perRow);
  await sharp({
    create: {
      width: perRow * CELL * ZOOM,
      height: rows * CELL * ZOOM,
      channels: 4,
      background: { r: 36, g: 36, b: 50, alpha: 1 },
    },
  })
    .composite(cells)
    .png()
    .toFile('/tmp/sprite-preview.png');
  console.log('\n-> /tmp/sprite-preview.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
