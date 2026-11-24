// Generates the draft catalog manifest (docs/icons/catalog.draft.json) and the review document
// (docs/icons/catalog-review.md) from scripts/icons/catalog-source.mjs, and fails on duplicate ids,
// alias collisions, or a built-in icon missing from the catalog. `--check` compares instead of writing.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, CONTAINERS, EXISTING, OVERLAYS } from './catalog-source.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outJson = join(root, 'docs', 'icons', 'catalog.draft.json');
const outMd = join(root, 'docs', 'icons', 'catalog-review.md');
// Categories in catalog order for the docs site's icon set gallery (grouped by category).
const outCategories = join(root, 'apps', 'site', 'src', 'examples', 'icon-categories.ts');
const check = process.argv.includes('--check');
// Status from the build: compiled sources are 'validated'; human review is recorded in approvals.json
// against the geometry hash, so any later change to an icon drops its review (R16-16).
const readJsonFile = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
const hashes = readJsonFile(join(root, 'docs', 'icons', 'geometry-hashes.json'));
const approvals = readJsonFile(join(root, 'scripts', 'icons', 'approvals.json'));
const REVIEW = new Set(['visually-reviewed', 'released']);
const statusOf = (id) => {
  const hash = hashes[id];
  if (hash === undefined) return { status: 'approved' };
  const review = approvals[id];
  if (review && REVIEW.has(review.status) && review.hash === hash) return { status: review.status, hash, reviewed: review.date };
  return { status: 'validated', hash, ...(review ? { reviewOutdated: true } : {}) };
};

const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const VARIANT_NAMES = { O: 'outline', S: 'solid', D: 'duotone', M: 'multicolor' };
const PRESETS = new Set(['spin', 'pulse', 'bounce', 'wiggle', 'shake', 'draw', 'morph', 'reveal', 'fade']);
const TRIGGERS = new Set(['idle', 'hover', 'focus', 'press', 'on-change', 'loading', 'success', 'error', 'manual']);
const LAYERS = new Set(['base', 'secondary', 'accent', 'badge', 'detail']);
const SPECIAL_NAMES = { 'mfa': 'Multi-factor authentication', 'qr-code': 'QR code', 'cpu': 'CPU', 'rss': 'RSS feed', 'id-badge': 'ID badge', 'x-circle': 'X circle', 'at-sign': 'At sign', 'git-pull-request': 'Git pull request' };

const problems = [];
const titleCase = (id) => SPECIAL_NAMES[id] ?? id.split('-').map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const list = (text) => (text ? text.split(',').map((s) => s.trim()).filter(Boolean) : []);

const icons = [];
for (const category of CATEGORIES) {
  for (const [id, description, metaphor, variants, layers, animation, aliases, notes, rtl] of category.rows) {
    if (!ID_RE.test(id)) problems.push(`${id}: id is not kebab-case`);
    const v = [...variants].map((c) => VARIANT_NAMES[c]);
    if (v.some((x) => x === undefined) || !v.includes('outline')) problems.push(`${id}: variants must include outline and use O, S, D, M`);
    const layerList = list(layers);
    for (const l of layerList) if (!LAYERS.has(l)) problems.push(`${id}: unknown layer ${l}`);
    if ((v.includes('duotone') || v.includes('multicolor')) && layerList.length < 2) problems.push(`${id}: duotone or multicolor needs at least two named layers`);
    if (v.includes('duotone') && !layerList.includes('secondary')) problems.push(`${id}: duotone needs a secondary layer`);
    const animations = animation ? animation.split(';').map((a) => {
      const [preset, trigger] = a.split(':');
      if (!PRESETS.has(preset) || !TRIGGERS.has(trigger)) problems.push(`${id}: animation ${a}`);
      return { preset, trigger, reducedMotion: preset === 'spin' || preset === 'pulse' ? 'static frame; the host announces the state in text' : 'end state shown without motion' };
    }) : [];
    icons.push({
      id,
      displayName: titleCase(id),
      category: category.id,
      categoryName: category.name,
      phase: category.phase,
      description,
      metaphor,
      variants: v,
      layers: layerList,
      compositions: 'base for overlays at the bottom-end anchor unless noted',
      animations,
      aliases: list(aliases),
      rtl: rtl === 'mirror' ? 'mirror' : 'none',
      notes,
      existing: EXISTING.has(id),
      ...statusOf(id),
    });
  }
}

// Uniqueness: ids, then aliases against ids and other aliases.
const owner = new Map();
for (const icon of icons) {
  if (owner.has(icon.id)) problems.push(`duplicate id ${icon.id}`);
  owner.set(icon.id, icon.id);
}
for (const icon of icons) {
  for (const alias of icon.aliases) {
    if (!ID_RE.test(alias)) problems.push(`${icon.id}: alias ${alias} is not kebab-case`);
    const taken = owner.get(alias);
    if (taken !== undefined) problems.push(`alias ${alias} of ${icon.id} collides with ${taken === alias ? 'the icon' : `an alias of ${taken}`} ${taken}`);
    owner.set(alias, icon.id);
  }
}
for (const id of EXISTING) if (!icons.some((i) => i.id === id)) problems.push(`built-in icon ${id} is missing from the catalog`);
for (const [id, review] of Object.entries(approvals)) {
  if (!id.startsWith('overlay:') && !icons.some((i) => i.id === id)) problems.push(`approvals.json: unknown icon ${id}`);
  if (!REVIEW.has(review.status) || typeof review.hash !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(review.date ?? '')) problems.push(`approvals.json: ${id} needs status (visually-reviewed or released), hash, and date`);
}
if (problems.length) {
  console.error(`build-catalog: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const manifest = {
  schemaVersion: 1,
  status: 'approved at gate G1 (2026-10-26, R16-8): semantic scope only; no artwork exists yet',
  generatedFrom: 'scripts/icons/catalog-source.mjs',
  statuses: ['proposed', 'approved', 'designed', 'validated', 'visually-reviewed', 'released'],
  total: icons.length,
  overlays: OVERLAYS.map(([id, meaning]) => ({ id, meaning })),
  containers: CONTAINERS,
  icons,
};

// Review document.
const count = (f) => icons.filter(f).length;
const md = [];
md.push('# Icon catalog review (draft)', '');
md.push('Generated by `node scripts/icons/build-catalog.mjs` from `scripts/icons/catalog-source.mjs`; edit the source, not this file. Machine-readable manifest: [catalog.draft.json](catalog.draft.json). Every entry is **approved** in scope (gate G1, 2026-10-26, R16-8); artwork, variants, and visual review follow the gates in docs/PLAN-R16-ICONS.md.', '');
md.push('## Summary', '');
md.push(`**Exact total: ${icons.length} semantic icons** (target 450). Aliases, rotations, mirrored forms, sizes, palettes, overlays (${OVERLAYS.length}), and containers (${CONTAINERS.length}) are not counted. ${count((i) => i.existing)} entries are today's built-in icons, redrawn to the new specification under the same id (components depend on these names).`, '');
md.push('| # | Category | Phase | Icons | vs 25 | Built-in today | Solid | Duotone | Multicolor | Animated | RTL mirror |', '|---|---|---|---|---|---|---|---|---|---|---|');
CATEGORIES.forEach((c, n) => {
  const rows = icons.filter((i) => i.category === c.id);
  const has = (v) => rows.filter((i) => i.variants.includes(v)).length;
  md.push(`| ${n + 1} | ${c.name} | ${c.phase} | ${rows.length} | ${rows.length - 25 >= 0 ? '+' : ''}${rows.length - 25} | ${rows.filter((i) => i.existing).length} | ${has('solid')} | ${has('duotone')} | ${has('multicolor')} | ${rows.filter((i) => i.animations.length).length} | ${rows.filter((i) => i.rtl === 'mirror').length} |`);
});
for (const phase of [1, 2, 3]) md.push('', `Phase ${phase}: ${count((i) => i.phase === phase)} icons.`);
md.push('', `Status: ${['approved', 'validated', 'visually-reviewed', 'released'].map((s) => `${s} ${String(count((i) => i.status === s))}`).join(', ')}${count((i) => i.reviewOutdated) ? `; review outdated ${String(count((i) => i.reviewOutdated))}` : ''}.`);
md.push('', `Variants: outline ${icons.length}, solid ${count((i) => i.variants.includes('solid'))}, duotone ${count((i) => i.variants.includes('duotone'))}, multicolor ${count((i) => i.variants.includes('multicolor'))}. Animated: ${count((i) => i.animations.length > 0)}. Mirrored in RTL: ${count((i) => i.rtl === 'mirror')}.`, '');

md.push('## Why the total is below 450', '');
md.push('The catalog was not padded to 25 per category. Synonyms became aliases, slash and badge states became compositions, and rotations became render options. Categories under 25 (Users, Files, Time, Security, Enterprise, Development, Cloud, Finance, Maps, Media, Communication) are listed with candidates in the plan (section 4.3); adding them is a user decision (R16-8), not a quota to fill.', '');

md.push('## Consolidated (merged into one canonical icon)', '');
for (const icon of icons.filter((i) => /merged/i.test(i.notes))) md.push(`- \`${icon.id}\`: ${icon.notes}`);
md.push('');
md.push('## Flagged for review (ambiguity, script or culture dependence, trademarks, legibility)', '');
for (const icon of icons.filter((i) => /flag|review|trademark|Latin|culture|vendor|platform|locale/i.test(i.notes) && !/merged/i.test(i.notes))) md.push(`- \`${icon.id}\`: ${icon.notes}`);
md.push('');
md.push('## Not catalog entries', '');
md.push(`- Overlays (composition marks, bottom-end anchor): ${OVERLAYS.map(([id, m]) => `\`${id}\` (${m})`).join(', ')}.`);
md.push(`- Containers: ${CONTAINERS.map((c) => `\`${c}\``).join(', ')} (e.g. \`folder\` in the circle container; \`user-circle\` and \`plus-circle\` are drawn as their own icons, R16-8).`);
md.push('- Rotations and flips: rotate-ccw, horizontal chart bars, end and bottom panels, horizontal grip.');
md.push('- Excluded marks: Bluetooth, USB, contactless, payment networks, platform share and face-ID symbols, file-format letters (PDF, XLS): trademarks or vendor marks.', '');

for (const c of CATEGORIES) {
  const rows = icons.filter((i) => i.category === c.id);
  md.push(`## ${c.name} (phase ${c.phase}, ${rows.length})`, '');
  md.push('| Id | Description | Metaphor | Variants | Layers | Animation | Aliases | RTL | Notes |', '|---|---|---|---|---|---|---|---|---|');
  for (const i of rows) {
    const anim = i.animations.map((a) => `${a.preset} (${a.trigger})`).join(', ');
    md.push(`| \`${i.id}\`${i.existing ? ' *' : ''} | ${i.description} | ${i.metaphor} | ${i.variants.map((v) => v[0].toUpperCase()).join('')} | ${i.layers.join(', ')} | ${anim} | ${i.aliases.join(', ')} | ${i.rtl === 'mirror' ? 'mirror' : ''} | ${i.notes.replace(/\|/g, '/')} |`);
  }
  md.push('');
}
md.push('`*` built-in icon today. Variants: O outline, S solid, D duotone, M multicolor.', '');

const json = `${JSON.stringify(manifest, null, 2)}\n`;
const text = md.join('\n');
const categories = [
  '// Generated by scripts/icons/build-catalog.mjs from scripts/icons/catalog-source.mjs. Do not edit.',
  '/** The icon set categories in catalog order, with the ids of their icons (docs icon set gallery). */',
  'export const ICON_CATEGORIES: readonly { readonly id: string; readonly name: string; readonly icons: readonly string[] }[] = [',
  ...CATEGORIES.map((c) => `  ${JSON.stringify({ id: c.id, name: c.name, icons: icons.filter((i) => i.category === c.id).map((i) => i.id) })},`),
  '];',
  '',
].join('\n');
if (check) {
  const same = (file, body) => { try { return readFileSync(file, 'utf8') === body; } catch { return false; } };
  if (!same(outJson, json) || !same(outMd, text) || !same(outCategories, categories)) {
    console.error('build-catalog: docs/icons or apps/site/src/examples/icon-categories.ts is stale; run node scripts/icons/build-catalog.mjs');
    process.exit(1);
  }
} else {
  mkdirSync(dirname(outJson), { recursive: true });
  writeFileSync(outJson, json);
  writeFileSync(outMd, text);
  writeFileSync(outCategories, categories);
}
console.log(`build-catalog: ok (${icons.length} icons, ${OVERLAYS.length} overlays)`);
