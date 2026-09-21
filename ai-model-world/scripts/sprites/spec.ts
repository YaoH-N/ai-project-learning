/**
 * `ModelRecord` + `Vendor` → `CharacterSpec`.
 *
 * Three levels of hashing, so a vendor's models read as one family:
 *   1. vendor  → motif (head species), skin/hair/cloth/metal ramps
 *   2. model id → individual details (hairstyle, facial hair, which garment)
 *   3. model attributes → body size, garment richness, crown, accessory layers
 *
 * The function is total: any vendor/model, however sparse, produces a spec.
 */

import { crownOf, lifeStageOf, signsOf, type SizeScale } from '../../src/lib/derive.ts';
import type { ModelRecord, Vendor } from '../../src/lib/types.ts';
import type { LpcCatalog } from './catalog.ts';
import type { BodyType, CatalogItem } from './lpc-schema.ts';
import { chance, hashInt, pick, pickOrNull } from './hash.ts';
import type { Palettes, RampChoice } from './palette.ts';

export type Tier = 1 | 2 | 3 | 4 | 5;
export type CrownKind = 'gold' | 'laurel' | 'silver';

export interface Pick {
  slot: string;
  itemId: string;
  variant: string | null;
  /** Layer alpha, used for the fog cloak of closed-parameter models. */
  alpha: number;
  /** Per-layer palette override, e.g. contrast trim or forced gold. */
  ramps?: RampChoice;
}

export interface CharacterFlags {
  fresh: boolean;
  retired: boolean;
  opaqueParams: boolean;
  imageIn: boolean;
  audio: boolean;
  imageOut: boolean;
  toolCall: boolean;
  reasoning: boolean;
  /** Thinking-halo ring count, 0–3. Mirrors `signsOf().halo`. */
  haloLayers: number;
  openWeights: boolean;
}

export interface CharacterSpec {
  slug: string;
  modelId: string;
  vendorId: string;
  motifFamily: string;
  body: BodyType;
  sizeTier: Tier;
  priceTier: Tier;
  rank: number | null;
  crown: CrownKind | null;
  flags: CharacterFlags;
  ramps: RampChoice;
  picks: Pick[];
}

export interface SpriteInput {
  model: ModelRecord;
  vendor: Vendor;
  /** 1-based ECI rank across the snapshot, or null when unranked. */
  rank: number | null;
  /** Reference instant for the "released in the last 30 days" test. */
  now: Date;
  /**
   * Built once per snapshot via `buildSizeScale`. Only its `estimated` flag is
   * used here — that is the site's canonical "parameter count undisclosed" test,
   * and the sprite has to agree with the tooltip the page shows next to it.
   */
  sizeScale: SizeScale;
}

/** Motif keyword → LPC head species. Anything unmatched falls back to a hash. */
const MOTIF_FAMILY: [RegExp, string][] = [
  [/whale|dolphin|shark|fish|ocean|sea|aqua|wave|deep|tide/, 'lizard'],
  [/dragon|serpent|snake|lizard|reptile|drake|wyrm|scale/, 'lizard'],
  [/mouse|rat|rodent|mole|hamster|squirrel/, 'rat'],
  [/rabbit|hare|bunny|moon|lunar/, 'rabbit'],
  [/cat|fox|wolf|dog|tiger|lion|bear|panda|beast|fur|paw/, 'mouse'],
  [/robot|machine|android|cyborg|circuit|star|cosmic|nebula|galaxy|space|alien|nova|comet/, 'alien'],
  [/orc|titan|giant|forge|hammer|iron|warrior|berserk|anvil/, 'orc'],
  [/goblin|imp|gremlin|sprite|tinker|gadget|cog/, 'goblin'],
  [/ghost|spectre|specter|vampire|night|shadow|dusk|raven|crow|bat/, 'vampire'],
  [/golem|construct|stitch|frankenstein|patchwork|assembl/, 'frankenstein'],
  [/bull|ox|minotaur|horn|buffalo|yak|bison/, 'wartotaur'],
  [/human|scholar|sage|monk|scribe|wanderer|travel|pilgrim|oracle|seer|mage|knight/, 'human'],
];

/** Weighted so the world stays mostly humanoid. */
const FALLBACK_FAMILIES = ['human', 'human', 'human', 'human', 'mouse', 'rabbit', 'rat', 'lizard', 'goblin', 'orc', 'alien'];

const SKIN_POOLS: Record<string, string[]> = {
  human: ['light', 'amber', 'olive', 'taupe', 'bronze', 'brown'],
  mouse: ['fur_grey', 'fur_tan', 'fur_white', 'fur_brown', 'fur_copper'],
  rabbit: ['fur_white', 'fur_tan', 'fur_grey', 'fur_gold'],
  rat: ['fur_grey', 'fur_black', 'fur_brown', 'fur_copper'],
  lizard: ['green', 'bright_green', 'pale_green', 'dark_green', 'blue'],
  goblin: ['green', 'olive', 'dark_green', 'bright_green'],
  orc: ['green', 'dark_green', 'olive', 'taupe'],
  alien: ['lavender', 'pale_green', 'blue', 'bright_green'],
  vampire: ['light', 'pale_green', 'lavender'],
  frankenstein: ['zombie_green', 'zombie', 'pale_green'],
  wartotaur: ['taupe', 'brown', 'bronze', 'fur_brown'],
  skeleton: ['light'],
};

/** Hairstyles that hug the skull, versus ones that add height or volume. */
const COMPACT_HAIR = /balding|buzz|^bob|short|page|plain|cowlick|messy|flat top|twists|cornrow|parted|swoop|^single|natural/i;
/** Only volume *above* the skull counts; long hair hangs down and adds nothing. */
const TALL_HAIR = /afro|jewfro|large curls|topknot|idol|princess|updo/i;

const DRAB_CLOTH = ['brown', 'walnut', 'tan', 'gray', 'charcoal', 'slate', 'leather'];

/** Hair shades a vendor's models may wear, and how far apart houses are pushed. */
const HAIR_CANDIDATES = 8;
const HAIR_PER_HOUSE = 3;
const SKIN_PER_HOUSE = 2;
const CLOTH_CANDIDATES = 2;

/**
 * Pick an anchor ramp out of `candidates` by hash, then return it with its
 * closest same-hue neighbours.
 *
 * Only ramps that can actually field a full family are eligible to anchor. The
 * hair set has exactly one green, for instance; anchoring on it would leave the
 * house wearing green, raven and strawberry, which is not a family.
 */
function anchoredFamily(
  pal: Palettes,
  material: 'hair' | 'body',
  candidates: readonly string[],
  count: number,
  seed: string,
  salt: string,
  allowed?: readonly string[],
): string[] {
  const viable = candidates.filter((name) => pal.family(material, name, count, allowed).length >= count);
  const pool = viable.length > 0 ? viable : [...candidates];
  const anchor = pool[hashInt(seed, salt, pool.length)];
  const chosen = pal.family(material, anchor, count, allowed);
  // Only reachable when no ramp in the material has enough neighbours at all.
  return chosen.length >= count ? chosen : [...new Set([...chosen, ...candidates])].slice(0, count);
}

export interface HousePalette {
  /** Hue-adjacent hair shades; the model id picks one. Same hue, different value. */
  hairs: string[];
  /** Skin or fur shades, constrained by the vendor's species. */
  skins: string[];
  /** The brand colour itself, worn from price tier 2 upwards. */
  cloth: string;
  /** The muted member of the cloth ramp nearest the brand, worn at price tier 1. */
  clothDrab: string;
  eye: string;
}

/**
 * A vendor's house colours.
 *
 * Snapping every vendor independently to its nearest ramp collapses the cast:
 * measured on the real snapshot it produced only 12 distinct hair ramps for 42
 * vendors, with `blue` alone covering 10 of them. So the brand colour is used to
 * *rank* candidate ramps rather than to choose one, and a hash of the vendor id
 * then takes a disjoint window of that ranking. Two blue-branded vendors stay
 * blue-ish but land on different windows, while a vendor's own window is fixed —
 * which is what makes its models read as one family.
 */
export function housePalette(vendor: Vendor, family: string, pal: Palettes): HousePalette {
  const seed = `vendor:${vendor.id}`;

  // Two steps, and the order matters. First the brand colour narrows the field
  // and a hash of the vendor id picks one anchor shade out of it — that is what
  // separates two blue-branded houses. Then the anchor's own *neighbours* fill
  // the rest of the palette, so the shades a house wears are visually adjacent.
  // Taking three consecutive entries straight off the brand ranking looked
  // reasonable but is not: rank order is not visual order, and it handed one
  // vendor pink, blue and raven.
  const ranked = pal.rampsByAffinity('hair', vendor.accentColor).slice(0, HAIR_CANDIDATES);
  const hairs = anchoredFamily(pal, 'hair', ranked, HAIR_PER_HOUSE, seed, 'hair-anchor');

  const pool = SKIN_POOLS[family] ?? SKIN_POOLS.human;
  const skinCount = Math.min(SKIN_PER_HOUSE, pool.length);
  const skins = anchoredFamily(pal, 'body', pool, skinCount, seed, 'skin-anchor', pool);

  // Cloth is the largest block of colour on the character, so it carries the
  // brand — but six of the 42 vendors have a blue logo and snapping each to its
  // single nearest ramp gave all six the same outfit. Picking from the four
  // closest ramps instead keeps a blue brand blue while separating the houses.
  const clothRanked = pal.rampsByAffinity('cloth', vendor.accentColor).slice(0, CLOTH_CANDIDATES);
  const cloth = clothRanked[hashInt(seed, 'cloth', clothRanked.length)];
  // The linen companion is matched to the house's own cloth, not to the brand
  // colour, so tier 1 stays in the family even when the two differ.
  const clothShade = pal.representative('cloth', cloth) ?? vendor.accentColor;

  return {
    hairs: hairs.length > 0 ? hairs : [ranked[0]],
    skins,
    cloth,
    clothDrab: pal.nearestRamp('cloth', clothShade, DRAB_CLOTH),
    eye: pal.nearestRamp('eye', vendor.accentColor),
  };
}
const METAL_BY_TIER: Record<Tier, string[]> = {
  1: ['iron'],
  2: ['iron', 'steel'],
  3: ['steel', 'bronze'],
  4: ['silver', 'bronze', 'copper', 'brass'],
  5: ['gold'],
};

/** Garment ladder: coarse cloth → refined cloth. Index 0 is price tier 1. */
const CLOTHES_LADDER: RegExp[] = [
  /sleeveless|tanktop|^scoop/i,
  /^t-?shirt|^shortsleeve/i,
  /longsleeve|cardigan/i,
  /polo|blouse|tunic|cardigan/i,
  /blouse|tunic|polo/i,
];
const LEGS_LADDER: RegExp[] = [
  /shorts|^hose/i,
  /^pants|long pants|leggings/i,
  /cuffed pants|formal pants|plain skirt|straight skirt/i,
  /formal pants|belle skirt|straight skirt/i,
  /formal pants|belle skirt|legion skirt|slit skirt/i,
];
const SHOES_LADDER: RegExp[] = [
  /sandals|basic shoes/i,
  /basic boots|revised shoes/i,
  /revised boots|rimmed boots/i,
  /folded rim boots|rimmed boots/i,
  /folded rim boots|sara shoes/i,
];

function bucket(value: number | null, edges: number[]): Tier | null {
  if (value === null || !Number.isFinite(value)) return null;
  for (let i = 0; i < edges.length; i++) if (value < edges[i]) return (i + 1) as Tier;
  return 5;
}

export function sizeTier(model: ModelRecord, seed: string): Tier {
  const params = model.params.totalB ?? model.params.activeB;
  const byParams = bucket(params, [12, 45, 200, 600]);
  if (byParams) return byParams;
  // Closed models publish no parameter count; output price is the best public proxy.
  const byPrice = bucket(model.pricing.outputPerMTok, [1, 5, 15, 45]);
  if (byPrice) return byPrice;
  const byContext = bucket(model.contextWindow, [16_000, 100_000, 400_000, 1_000_000]);
  return byContext ?? ((hashInt(seed, 'size', 3) + 2) as Tier);
}

export function priceTier(model: ModelRecord, seed: string): Tier {
  const byOutput = bucket(model.pricing.outputPerMTok, [0.6, 2.5, 10, 40]);
  if (byOutput) return byOutput;
  const byInput = bucket(model.pricing.inputPerMTok, [0.15, 0.6, 2.5, 10]);
  if (byInput) return byInput;
  if (model.openWeights) return 1;
  return (hashInt(seed, 'price', 3) + 2) as Tier;
}

/** Re-exported from `derive.ts` so the two never drift apart. */
export const crownFor = crownOf;

const BODY_BY_SIZE: Record<Tier, BodyType> = { 1: 'child', 2: 'teen', 3: 'female', 4: 'male', 5: 'male' };

function familyOf(name: string): string {
  return name.toLowerCase().split(' ')[0];
}

function motifFamily(vendor: Vendor, vendorSeed: string): string {
  const motif = `${vendor.motif} ${vendor.id} ${vendor.name}`.toLowerCase();
  for (const [re, family] of MOTIF_FAMILY) if (re.test(motif)) return family;
  return pick(FALLBACK_FAMILIES, vendorSeed, 'family');
}

/** First non-empty pool: the tier's own ladder, then wider fallbacks, then anything. */
function ladderPool(all: CatalogItem[], ladder: RegExp[], tier: Tier): CatalogItem[] {
  const order = [tier - 1, tier, tier - 2, tier + 1, tier - 3, tier + 2];
  for (const i of order) {
    if (i < 0 || i >= ladder.length) continue;
    const pool = all.filter((it) => ladder[i].test(it.name));
    if (pool.length > 0) return pool;
  }
  return all;
}

function variantFor(item: CatalogItem, seed: string, salt: string, preferred: readonly string[]): string | null {
  if (!item.variants || item.variants.length === 0) return null;
  const liked = preferred.filter((v) => item.variants!.includes(v));
  return pick(liked.length > 0 ? liked : item.variants, seed, salt);
}

export function deriveSpec(input: SpriteInput, catalog: LpcCatalog): CharacterSpec {
  const { model, vendor, rank, now } = input;
  const seed = `model:${model.id}`;
  const vendorSeed = `vendor:${vendor.id}`;
  const pal = catalog.palettes;

  const family = motifFamily(vendor, vendorSeed);
  const size = sizeTier(model, seed);
  const price = priceTier(model, seed);
  const body = BODY_BY_SIZE[size];

  // Capability symbols, life stage and crown all come from `src/lib/derive.ts`,
  // the site's executable spec. Re-deriving them here would let the sprite and
  // the page it sits on disagree — which it already did for 119 models, whose
  // parameter count is `estimated` rather than absent and so got no fog cloak.
  const signs = signsOf(model);
  const stage = lifeStageOf(model, now);
  const flags: CharacterFlags = {
    fresh: stage === 'newborn',
    retired: stage === 'ghost',
    // Strictly narrower than derive's `estimated`, and deliberately so. That flag
    // is true whenever `params.confidence !== 'exact'`, and the current snapshot
    // contains no `exact` value at all — 334 `estimated` plus 151 `unknown` — so
    // using it directly puts the cloak on every character and the signal carries
    // nothing. Fog therefore means "no parameter count to show at all", which is
    // what a viewer reads it as, and which can never contradict the tooltip.
    opaqueParams: input.sizeScale.sizeOf(model).estimated && model.params.totalB === null,
    imageIn: signs.eyewear === 'glasses',
    audio: signs.headphones,
    imageOut: signs.paintbrush,
    toolCall: signs.toolBelt,
    reasoning: signs.halo > 0,
    haloLayers: signs.halo,
    openWeights: signs.key,
  };

  // Colour is the vendor's; the model id only chooses within the house palette.
  // Both cloth ramps are vendor-locked too — letting price tier 1 pick its own
  // drab shade per model was what broke the family read (nvidia spanned eight
  // cloth ramps across its 21 models).
  const house = housePalette(vendor, family, pal);
  const ramps: RampChoice = {
    body: pick(house.skins, seed, 'skin'),
    hair: pick(house.hairs, seed, 'hair-shade'),
    cloth: price === 1 ? house.clothDrab : house.cloth,
    metal: pick(METAL_BY_TIER[price], vendorSeed, 'metal'),
    eye: house.eye,
  };
  // Pre-coloured items cannot be palette-swapped, so steer them towards the family colour.
  const clothVariants = [ramps.cloth!, 'white', 'black'];
  const metalVariants = [ramps.metal!, 'silver', 'gold'];

  // Trim reads as trim only if it contrasts with the garment underneath.
  const clothShades = pal.ramp('cloth', ramps.cloth!) ?? ['#888888'];
  const mid = clothShades[Math.min(clothShades.length - 1, 4)].replace('#', '');
  const lum =
    0.299 * parseInt(mid.slice(0, 2), 16) +
    0.587 * parseInt(mid.slice(2, 4), 16) +
    0.114 * parseInt(mid.slice(4, 6), 16);
  const trimRamp = lum < 140 ? 'white' : 'charcoal';

  const picks: Pick[] = [];
  const add = (
    slot: string,
    item: CatalogItem | null,
    variant: string | null = null,
    alpha = 1,
    rampOverride?: RampChoice,
  ) => {
    if (item) picks.push({ slot, itemId: item.id, variant, alpha, ramps: rampOverride });
  };
  const one = (type: string, salt: string, filter?: (i: CatalogItem) => boolean): CatalogItem | null => {
    const pool = catalog.options(type, body).filter((i) => (filter ? filter(i) : true));
    return pickOrNull(pool, seed, salt);
  };

  add('shadow', catalog.get('body/shadow'));
  add('body', catalog.get('body/body'));

  // Head: species from the vendor, exact face from the model id. Small heads go to
  // the small tiers — LPC's clean bodies differ by ~2 px, so head choice is one of
  // the few remaining levers on apparent stature.
  const heads = catalog.options('head', body);
  const inFamily = heads.filter((h) => familyOf(h.name) === family);
  const familyPool = inFamily.length > 0 ? inFamily : heads.filter((h) => familyOf(h.name) === 'human');
  const basePool = familyPool.length > 0 ? familyPool : heads;
  const wantSmall = size <= 2;
  const sized = basePool.filter((h) => /\bsmall\b/i.test(h.name) === wantSmall);
  add('head', pickOrNull(sized.length > 0 ? sized : basePool, seed, 'head'));

  // Hair, not the skull, sets the top of the silhouette, so the hair pool is
  // biased by size tier — it is the only lever that changes apparent height at all.
  const hairAll = catalog.options('hair', body);
  const hairPool =
    size <= 2
      ? hairAll.filter((h) => COMPACT_HAIR.test(h.name))
      : size >= 4
        ? hairAll.filter((h) => TALL_HAIR.test(h.name))
        : hairAll;
  add('hair', pickOrNull(hairPool.length > 0 ? hairPool : hairAll, seed, 'hair'));
  if (body !== 'child' && chance(seed, 'beard', 22)) add('beard', one('beard', 'beard-pick'));
  if (body !== 'child' && chance(seed, 'mustache', 14)) add('mustache', one('mustache', 'mustache-pick'));

  const legs = one('legs', 'legs', (i) => ladderPool(catalog.options('legs', body), LEGS_LADDER, price).includes(i));
  add('legs', legs, legs ? variantFor(legs, seed, 'legs-v', clothVariants) : null);

  const shirtPool = ladderPool(catalog.options('clothes', body), CLOTHES_LADDER, price);
  const shirt = pickOrNull(shirtPool, seed, 'clothes');
  add('clothes', shirt, shirt ? variantFor(shirt, seed, 'clothes-v', clothVariants) : null);

  const shoePool = ladderPool(catalog.options('shoes', body), SHOES_LADDER, price);
  const shoes = pickOrNull(shoePool, seed, 'shoes');
  add('shoes', shoes, shoes ? variantFor(shoes, seed, 'shoes-v', clothVariants) : null);

  // Price ladder: each tier stacks another visible ornament on the previous one,
  // so richness is legible as layer count even before colour is considered.
  if (price >= 3) {
    add('neck', one('neck', 'neck'), null, 1, { cloth: trimRamp });
    add('sleeves', one('sleeves', 'sleeves'), null, 1, { cloth: trimRamp });
  }
  if (price >= 4) {
    const jacket = one('jacket', 'jacket');
    add('jacket', jacket, jacket ? variantFor(jacket, seed, 'jacket-v', clothVariants) : null);
    const sash = one('sash', 'sash');
    add('sash', sash, sash ? variantFor(sash, seed, 'sash-v', metalVariants) : null, 1, { cloth: ramps.metal });
    const necklace = one('necklace', 'necklace');
    add('necklace', necklace, necklace ? variantFor(necklace, seed, 'necklace-v', metalVariants) : null);
  }
  if (price >= 5) {
    const charm = one('charm', 'charm');
    add('charm', charm, charm ? variantFor(charm, seed, 'charm-v', metalVariants) : null);
    const earrings = one('earrings', 'earrings');
    add('earrings', earrings, earrings ? variantFor(earrings, seed, 'earrings-v', metalVariants) : null);
  }

  // LPC's licence-clean bodies stop at `male` and span only ~2 px between adult
  // types, so the two largest tiers buy their bulk from shoulder and arm pieces.
  // These layers belong to the size ladder alone; the price ladder never uses
  // them, so the two axes stay readable independently.
  if (size >= 4) add('shoulders', one('shoulders', 'shoulders'), null, 1, { cloth: ramps.cloth });
  if (size === 5) {
    add('armour', one('armour', 'armour'), null, 1, { metal: 'steel', cloth: ramps.cloth });
    add('arms', catalog.get('arms/arms_armour'), null, 1, { metal: 'steel' });
    add('bauldron', catalog.get('arms/bauldron'), null, 1, { cloth: ramps.cloth });
    add('bracers', catalog.get('arms/wrists/arms_bracers'), null, 1, { metal: 'steel' });
  }

  if (flags.toolCall) {
    const belt = one('belt', 'belt');
    add('belt', belt, belt ? variantFor(belt, seed, 'belt-v', clothVariants) : null);
  }
  const eyewear = catalog
    .options('facial_eyes', body)
    .filter((i) => (flags.imageIn ? /glasses/i.test(i.name) : /eyepatch/i.test(i.name)));
  const eyeItem = pickOrNull(eyewear, seed, 'eyewear');
  add('facial_eyes', eyeItem, eyeItem ? variantFor(eyeItem, seed, 'eyewear-v', metalVariants) : null);

  // No cape: the fog cloak is state, and the site now draws it. `opaqueParams`
  // survives in the flags as metadata for whatever the site renders instead.

  return {
    slug: model.slug,
    modelId: model.id,
    vendorId: vendor.id,
    motifFamily: family,
    body,
    sizeTier: size,
    priceTier: price,
    rank,
    crown: crownFor(rank),
    flags,
    ramps,
    picks,
  };
}
