// Icon compiler (R16-15): packages/icons/source/<category>/<id>.svg and source/overlays/<id>.svg
// -> packages/icons/src/set/*.ts (generated, committed, deterministic) and docs/icons/geometry-hashes.json.
// Validates every source against the design rules and the catalog (variants, layers, mirroring,
// animations); transforms are flattened; numbers are rounded. `--check` fails when the output is stale.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, EXISTING, OVERLAYS } from './catalog-source.mjs';
import { bounds, fmt, IDENTITY, parsePath, parsePoints, parseTransform, samplePath, serializePath, shapeToPath, strokeOutline, transformPath } from './geometry.mjs';
import { parseSvg } from './svg-parse.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceDir = join(root, 'packages', 'icons', 'source');
const outDir = join(root, 'packages', 'icons', 'src', 'set');
const hashFile = join(root, 'docs', 'icons', 'geometry-hashes.json');
const SVG_NS = 'http://www.w3.org/2000/svg';
const VARIANT_CODES = { outline: 'O', solid: 'S', duotone: 'D', multicolor: 'M' };
const VARIANT_ORDER = ['outline', 'solid', 'duotone', 'multicolor'];
const LAYERS = new Set(['base', 'secondary', 'accent', 'badge', 'detail']);
const ROLES = new Set(['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'info', 'muted']);
const SHAPES = { path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polygon: ['points'], polyline: ['points'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'] };

/** Catalog rows by id, with their category. */
function catalog() {
  const map = new Map();
  for (const c of CATEGORIES) {
    for (const [id, description, , variants, layers, animation, aliases, , rtl] of c.rows) {
      map.set(id, { id, category: c.id, description, aliases: aliases ? aliases.split(',') : [], variants: [...variants].map((v) => Object.keys(VARIANT_CODES).find((k) => VARIANT_CODES[k] === v)), layers: layers ? layers.split(',') : [], animations: animation ? animation.split(';') : [], mirror: rtl === 'mirror' });
    }
  }
  return map;
}

const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const title = (id) => id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ');

/**
 * Compile one source document into a definition object.
 * @param {string} text
 * @param {{ id: string, kind: 'vector' | 'overlay', file: string, entry?: ReturnType<typeof catalog> extends Map<string, infer E> ? E : never }} ctx
 */
export function compileSource(text, ctx) {
  const problems = [];
  const fail = (message, line) => problems.push(`${ctx.file}${line ? `:${String(line)}` : ''}: ${message}`);
  const svg = parseSvg(text);
  const size = ctx.kind === 'overlay' ? 10 : 24;
  const allowedRoot = new Set(['xmlns', 'viewBox', 'data-id', 'data-mirror', 'data-optical', 'data-animations', 'data-morph-icon', 'data-outline-fills', 'data-anchor-bottom-end', 'data-anchor-top-end', 'data-anchor-center']);
  if (svg.name !== 'svg') fail('root element must be <svg>', svg.line);
  for (const a of Object.keys(svg.attributes)) if (!allowedRoot.has(a)) fail(`attribute ${a} is not allowed on <svg>`, svg.line);
  if (svg.attributes.xmlns !== SVG_NS) fail(`xmlns must be ${SVG_NS}`, svg.line);
  if (svg.attributes.viewBox !== `0 0 ${String(size)} ${String(size)}`) fail(`viewBox must be "0 0 ${String(size)} ${String(size)}"`, svg.line);
  if (svg.attributes['data-id'] !== ctx.id) fail(`data-id must be "${ctx.id}" (the file name)`, svg.line);
  const mirror = svg.attributes['data-mirror'] === 'true';
  if (!['true', 'false', undefined].includes(svg.attributes['data-mirror'])) fail('data-mirror must be "true" or "false"', svg.line);
  const optical = svg.attributes['data-optical'] === 'true';
  // Stroke centrelines stay 1 unit inside the canvas (2-unit stroke); optical exceptions may reach the edge.
  const [lo, hi] = optical ? [0, size] : [1, size - 1];

  const variants = {};
  const morphs = [];
  for (const vg of svg.children) {
    const v = vg.attributes['data-variant'];
    if (vg.name !== 'g' || !v || Object.keys(vg.attributes).length !== 1) {
      fail('top level must be <g data-variant="..."> groups with no other attributes', vg.line);
      continue;
    }
    if (!Object.hasOwn(VARIANT_CODES, v) || Object.hasOwn(variants, v)) {
      fail(`unknown or repeated variant ${v}`, vg.line);
      continue;
    }
    const layers = [];
    const names = new Set();
    for (const lg of vg.children) {
      const a = lg.attributes;
      const allowed = new Set(['data-layer', 'data-role', 'data-paint', 'data-opacity', 'data-fill-rule', 'data-compound']);
      if (lg.name !== 'g' || Object.keys(a).some((k) => !allowed.has(k))) {
        fail('variant groups contain only <g data-layer data-role data-paint [data-opacity] [data-fill-rule]>', lg.line);
        continue;
      }
      if (!LAYERS.has(a['data-layer']) || names.has(a['data-layer'])) fail(`unknown or repeated layer ${String(a['data-layer'])}`, lg.line);
      names.add(a['data-layer']);
      if (!ROLES.has(a['data-role'])) fail(`unknown role ${String(a['data-role'])}`, lg.line);
      if (a['data-paint'] !== 'stroke' && a['data-paint'] !== 'fill') fail('data-paint must be "stroke" or "fill"', lg.line);
      if (a['data-fill-rule'] !== undefined && !['nonzero', 'evenodd'].includes(a['data-fill-rule'])) fail('data-fill-rule must be "nonzero" or "evenodd"', lg.line);
      const opacity = a['data-opacity'] === undefined ? undefined : Number(a['data-opacity']);
      if (opacity !== undefined && !(opacity >= 0 && opacity <= 1)) fail('data-opacity must be 0 to 1', lg.line);
      const nodes = [];
      const knockouts = [];
      for (const shape of lg.children) {
        const geometry = SHAPES[shape.name];
        if (!geometry || shape.children.length) {
          fail(`<${shape.name}> is not an allowed shape (path, circle, ellipse, line, polyline, polygon, rect)`, shape.line);
          continue;
        }
        const attrs = shape.attributes;
        const knockoutWidth = attrs['data-knockout'] === undefined ? undefined : Number(attrs['data-knockout']);
        const outlineWidth = knockoutWidth ?? (attrs['data-outline-width'] === undefined ? undefined : Number(attrs['data-outline-width']));
        for (const k of Object.keys(attrs)) if (!geometry.includes(k) && k !== 'transform' && !((k === 'data-outline-width' || k === 'data-knockout') && (shape.name === 'line' || shape.name === 'polyline')) && !(k === 'data-morph-to' && shape.name === 'path')) fail(`attribute ${k} is not allowed on <${shape.name}>`, shape.line);
        if (knockoutWidth !== undefined && !(knockoutWidth >= 1 && knockoutWidth <= 14)) fail('data-knockout must be 1 to 14', shape.line);
        else if (knockoutWidth === undefined && outlineWidth !== undefined && !(outlineWidth >= 0.5 && outlineWidth <= 4)) fail('data-outline-width must be 0.5 to 4', shape.line);
        try {
          const m = attrs.transform ? parseTransform(attrs.transform) : IDENTITY;
          const numeric = {};
          for (const k of geometry) if (k !== 'd' && k !== 'points' && attrs[k] !== undefined) {
            const n = Number(attrs[k]);
            if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
            numeric[k] = n;
          }
          let segs;
          // A stroke drawn as its outline (for knockouts in filled layers).
          if (outlineWidth !== undefined) segs = strokeOutline(shape.name === 'line' ? [[numeric.x1 ?? 0, numeric.y1 ?? 0], [numeric.x2 ?? 0, numeric.y2 ?? 0]] : parsePoints(attrs.points ?? ''), outlineWidth);
          else if (shape.name === 'path') segs = parsePath(attrs.d ?? '');
          else if (shape.name === 'polyline' || shape.name === 'polygon') {
            const pts = parsePoints(attrs.points ?? '');
            segs = pts.map(([x, y], k) => ({ cmd: k === 0 ? 'M' : 'L', args: [x, y] }));
            if (shape.name === 'polygon') segs.push({ cmd: 'Z', args: [] });
          } else segs = shapeToPath(shape.name, numeric);
          const transformed = transformPath(segs, m);
          const b = bounds(samplePath(transformed));
          if (knockoutWidth === undefined && (b[0] < lo - 1e-6 || b[1] < lo - 1e-6 || b[2] > hi + 1e-6 || b[3] > hi + 1e-6)) fail(`<${shape.name}> extends outside ${String(lo)}..${String(hi)} (bounds ${b.map(fmt).join(' ')})`, shape.line);
          if (knockoutWidth !== undefined) {
            knockouts.push(['path', { d: serializePath(transformed) }]);
            continue;
          }
          if (m.every((x, k) => x === IDENTITY[k]) && outlineWidth === undefined) {
            // No transform: keep the shape, numbers rounded.
            const out = {};
            if (attrs['data-morph-to'] !== undefined) {
              // Morph pairs interpolate command by command: write both shapes with the same commands (L, not h or v).
              const from = segs;
              const target = attrs['data-morph-to'] === 'none' ? null : parsePath(attrs['data-morph-to']);
              if (target && from.map((g) => g.cmd).join() !== target.map((g) => g.cmd).join()) fail('data-morph-to needs the same commands as d', shape.line);
              const tb = target ? bounds(samplePath(target)) : [lo, lo, hi, hi];
              if (tb[0] < lo - 1e-6 || tb[1] < lo - 1e-6 || tb[2] > hi + 1e-6 || tb[3] > hi + 1e-6) fail(`data-morph-to extends outside ${String(lo)}..${String(hi)}`, shape.line);
              morphs.push({ layer: a['data-layer'], variant: v, d: serializePath(from), to: target ? serializePath(target) : null });
              nodes.push(['path', { d: serializePath(from) }]);
              continue;
            }
            for (const k of geometry) {
              if (attrs[k] === undefined) continue;
              if (k === 'd') out.d = serializePath(segs);
              else if (k === 'points') out.points = parsePoints(attrs.points).map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' ');
              else out[k] = Number(fmt(numeric[k]));
            }
            nodes.push([shape.name, out]);
          } else {
            nodes.push(['path', { d: serializePath(transformed) }]);
          }
        } catch (error) {
          fail(error instanceof Error ? error.message : String(error), shape.line);
        }
      }
      if (nodes.length === 0) fail('empty layer', lg.line);
      // A compound layer is one path, so an even-odd fill rule cuts holes across its shapes.
      if (a['data-compound'] !== undefined && a['data-compound'] !== 'true') fail('data-compound must be "true"', lg.line);
      if (a['data-compound'] === 'true' && nodes.length > 1) {
        const d = nodes.map(([tag, at]) => {
          if (tag === 'path') return at.d;
          if (tag === 'polyline' || tag === 'polygon') return serializePath(parsePoints(at.points).map(([x, y], k) => ({ cmd: k === 0 ? 'M' : 'L', args: [x, y] })).concat(tag === 'polygon' ? [{ cmd: 'Z', args: [] }] : []));
          return serializePath(shapeToPath(tag, at));
        }).join('');
        nodes.splice(0, nodes.length, ['path', { d }]);
      }
      const paint = a['data-paint'];
      // data-outline-fills="true": a recorded exception where a filled part is the metaphor (circle-half).
      if (ctx.kind === 'vector' && v === 'outline' && paint === 'fill' && svg.attributes['data-outline-fills'] !== 'true' && !nodes.every(([tag, at]) => tag === 'circle' && at.r <= 1.5)) fail('outline layers are strokes (fills only for dots of radius 1.5 or less)', lg.line);
      layers.push({ name: a['data-layer'], role: a['data-role'], paint, ...(opacity === undefined ? {} : { opacity }), ...(a['data-fill-rule'] ? { fillRule: a['data-fill-rule'] } : {}), nodes, ...(knockouts.length ? { knockout: knockouts } : {}) });
    }
    if (layers.length === 0) fail(`variant ${v} has no layers`, vg.line);
    variants[v] = layers;
  }
  if (!variants.outline) fail('an outline variant is required');
  if (ctx.kind === 'overlay' && Object.keys(variants).some((v) => v !== 'outline' && v !== 'solid')) fail('overlays have outline and solid variants only');

  const anchors = {};
  for (const anchor of ['bottom-end', 'top-end', 'center']) {
    const text = svg.attributes[`data-anchor-${anchor}`];
    if (text === undefined) continue;
    const p = text.trim().split(/\s+/).map(Number);
    if (p.length !== 2 || p.some((n) => !(n >= 0 && n <= 24))) fail(`data-anchor-${anchor} must be "x y" within 0..24`);
    else anchors[anchor] = p;
  }
  let morph;
  if (morphs.length) {
    const icon = svg.attributes['data-morph-icon'];
    if (!icon || !/^[a-z][a-z0-9-]*$/.test(icon)) fail('a morph needs data-morph-icon (the icon it becomes)');
    if (morphs.some((m) => m.variant !== 'outline' || m.layer !== morphs[0].layer)) fail('morph paths belong to one outline layer');
    const layer = (variants.outline ?? []).find((l) => l.name === morphs[0].layer);
    if (!layer || layer.nodes.length !== morphs.length) fail('every node of the morph layer needs data-morph-to');
    morph = { to: icon, layer: morphs[0].layer, paths: morphs.map((m) => m.to) };
  } else if (svg.attributes['data-morph-icon'] !== undefined) fail('data-morph-icon without data-morph-to paths');
  const animations = [];
  for (const spec of (svg.attributes['data-animations'] ?? '').split(';').filter(Boolean)) {
    // preset:trigger[:target[:x y]]; the origin is the rotation or scale centre in icon units.
    const [preset, trigger, target, originText] = spec.split(':');
    if (target !== undefined && !Object.values(variants).some((ls) => ls.some((l) => l.name === target))) fail(`animation target ${target} is not a layer`);
    if (preset === 'morph' && morphs.length === 0) fail('the morph animation needs data-morph-to paths');
    const origin = originText === undefined ? undefined : originText.trim().split(/\s+/).map(Number);
    if (origin && (origin.length !== 2 || origin.some((n) => !(n >= 0 && n <= 24)))) fail(`animation origin "${originText}" must be "x y" within 0..24`);
    animations.push({ preset, trigger, ...(target ? { target } : {}), ...(origin ? { origin } : {}) });
  }

  // Catalog agreement (icons only).
  const e = ctx.entry;
  if (ctx.kind === 'vector') {
    if (!e) fail('not in the catalog (scripts/icons/catalog-source.mjs)');
    else {
      const have = VARIANT_ORDER.filter((v) => variants[v]);
      if (have.join() !== e.variants.join()) fail(`variants ${have.join(', ')} differ from the catalog (${e.variants.join(', ')})`);
      if (variants.duotone && !variants.duotone.some((l) => l.name === 'secondary' && l.paint === 'fill')) fail('the duotone variant needs a secondary fill layer');
      if (mirror !== e.mirror) fail(`data-mirror must be ${String(e.mirror)} (catalog)`);
      const allowedLayers = new Set(['base', 'detail', ...e.layers]);
      for (const ls of Object.values(variants)) for (const l of ls) if (!allowedLayers.has(l.name)) fail(`layer ${l.name} is not in the catalog's layers (${[...allowedLayers].join(', ')})`);
      const want = e.animations.slice().sort().join(';');
      const got = animations.map((a) => `${a.preset}:${a.trigger}`).sort().join(';');
      if (want !== got) fail(`animations "${got}" differ from the catalog ("${want}")`);
    }
  }
  if (problems.length) {
    const error = new Error(problems.join('\n'));
    error.problems = problems;
    throw error;
  }
  const ordered = {};
  for (const v of VARIANT_ORDER) if (variants[v]) ordered[v] = variants[v];
  return ctx.kind === 'overlay'
    ? { kind: 'overlay', id: ctx.id, viewBox: '0 0 10 10', ...(mirror ? { mirror } : {}), variants: ordered }
    : { kind: 'vector', id: ctx.id, viewBox: '0 0 24 24', ...(mirror ? { mirror } : {}), ...(Object.keys(anchors).length ? { anchors } : {}), ...(animations.length ? { animations } : {}), ...(morph ? { morph } : {}), variants: ordered };
}

/** Stable JSON (keys in insertion order, which the compiler controls). */
const json = (value) => JSON.stringify(value);
const hash = (def) => createHash('sha256').update(json(def)).digest('hex').slice(0, 16);

function typeOf(def) {
  const variants = Object.keys(def.variants).map((v) => `'${v}'`).join(' | ');
  const layers = [...new Set(Object.values(def.variants).flatMap((ls) => ls.map((l) => l.name)))].map((n) => `'${n}'`).join(' | ');
  return `VectorIcon<${variants}, ${layers}>`;
}

function run() {
  const check = process.argv.includes('--check');
  const entries = catalog();
  const header = (src) => `// Generated by scripts/icons/compile.mjs from ${src}. Do not edit.\n`;
  const files = new Map();
  const icons = [];
  const overlays = [];
  const problems = [];
  if (existsSync(sourceDir)) {
    for (const dir of readdirSync(sourceDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
      for (const name of readdirSync(join(sourceDir, dir)).filter((f) => f.endsWith('.svg')).sort()) {
        const id = name.slice(0, -4);
        const file = relative(root, join(sourceDir, dir, name)).split(sep).join('/');
        const kind = dir === 'overlays' ? 'overlay' : 'vector';
        const entry = entries.get(id);
        if (kind === 'vector' && entry && entry.category !== dir) problems.push(`${file}: belongs in source/${entry.category}/`);
        if (kind === 'overlay' && !OVERLAYS.some(([o]) => o === id)) problems.push(`${file}: not an overlay in the catalog`);
        try {
          const def = compileSource(readFileSync(join(sourceDir, dir, name), 'utf8').replace(/\r\n/g, '\n'), { id, kind, file, entry });
          (kind === 'overlay' ? overlays : icons).push({ def, file, entry });
        } catch (error) {
          problems.push(...(error.problems ?? [`${file}: ${error instanceof Error ? error.message : String(error)}`]));
        }
      }
    }
  }
  if (problems.length) {
    console.error(`icons:compile: ${String(problems.length)} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  icons.sort((a, b) => a.def.id.localeCompare(b.def.id));
  overlays.sort((a, b) => a.def.id.localeCompare(b.def.id));
  for (const { def, file, entry } of icons) {
    files.set(`${def.id}.ts`, `${header(file)}import type { VectorIcon } from '../vector.js';\n\n/** ${title(def.id)}: ${entry.description} */\nexport const ${camel(def.id)}Icon: ${typeOf(def)} = Object.freeze<${typeOf(def)}>(${json(def)});\n`);
  }
  files.set('overlays.ts', `${header('packages/icons/source/overlays/')}${overlays.length ? "import type { IconOverlayDefinition } from '../vector.js';\n" : 'export {};\n'}${overlays.map(({ def }) => `\nexport const ${camel(def.id)}Overlay: IconOverlayDefinition = Object.freeze<IconOverlayDefinition>(${json(def)});\n`).join('')}`);
  files.set('register.ts', `${header('scripts/icons/catalog-source.mjs')}// Registers every icon by id and alias for name-based use (renderIcon('home')). Importing this module bundles the whole set.
import { registerIcons } from '../icons.js';
import type { IconDefinition } from '../icons.js';
${icons.map(({ def }) => `import { ${camel(def.id)}Icon } from './${def.id}.js';\n`).join('')}
const names: Record<string, IconDefinition> = {
${icons.map(({ def, entry }) => [def.id, ...entry.aliases].map((n) => `  '${n}': ${camel(def.id)}Icon,\n`).join('')).join('')}};
registerIcons(names);
`);
  // R16-13: the built-in icons (names components use) are outline-only copies of the set's icons. They carry
  // no RTL mirroring: components choose direction-specific names themselves (chevron-left in RTL, ...).
  const builtIns = icons.filter(({ def }) => EXISTING.has(def.id));
  const missing = [...EXISTING].filter((id) => !builtIns.some(({ def }) => def.id === id));
  if (missing.length) {
    console.error(`icons:compile: built-in icons without a source: ${missing.join(', ')}`);
    process.exit(1);
  }
  // Compact form (the core bundle carries these): one entry per icon, one tuple per layer, each shape as its
  // own path in one string joined by '|'; expanded to vector definitions when the module loads.
  const nodePath = ([tag, attrs]) => (tag === 'path' ? attrs.d : serializePath(shapeToPath(tag, attrs)));
  const builtIn = (def) => {
    if (def.viewBox !== '0 0 24 24') throw new Error(`${def.id}: built-in icons use the 24 grid`);
    const outline = def.variants.outline;
    const layers = new Set(outline.map((l) => l.name));
    const animations = (def.animations ?? []).filter((a) => a.target === undefined || layers.has(a.target));
    const extra = { ...(def.anchors ? { anchors: def.anchors } : {}), ...(animations.length ? { animations } : {}), ...(def.morph && layers.has(def.morph.layer) ? { morph: def.morph } : {}) };
    const tuples = outline.map((l) => {
      const more = { ...(l.opacity !== undefined ? { opacity: l.opacity } : {}), ...(l.fillRule ? { fillRule: l.fillRule } : {}), ...(l.knockout ? { knockout: l.knockout } : {}) };
      return [l.name, l.role, l.paint, l.nodes.map(nodePath).join('|'), ...(Object.keys(more).length ? [more] : [])];
    });
    return `  icon('${def.id}', ${JSON.stringify(tuples)}${Object.keys(extra).length ? `, ${JSON.stringify(extra)}` : ''}),\n`;
  };
  files.set('builtins.ts', `${header('packages/icons/source/ (scripts/icons/catalog-source.mjs EXISTING)')}// The built-in icons: outline variants of the set's icons under the names components use, without RTL mirroring.
import type { SvgNode } from '../nodes.js';
import type { IconColorRole, IconLayerName, VectorIcon, VectorLayer } from '../vector.js';

type Layer = readonly [IconLayerName, IconColorRole, 'stroke' | 'fill', string, Pick<VectorLayer, 'opacity' | 'fillRule' | 'knockout'>?];

const icon = (id: string, layers: readonly Layer[], extra: Pick<VectorIcon, 'anchors' | 'animations' | 'morph'> = {}): readonly [string, VectorIcon] => [
  id,
  {
    kind: 'vector',
    id,
    viewBox: '0 0 24 24',
    ...extra,
    variants: { outline: layers.map(([name, role, paint, d, more]) => ({ name, role, paint, nodes: d.split('|').map((path): SvgNode => ['path', { d: path }]), ...more })) },
  },
];

export const builtInVectorIcons: Readonly<Record<string, VectorIcon>> = Object.freeze(Object.fromEntries([
${builtIns.map(({ def }) => builtIn(def)).join('')}]));
`);
  files.set('index.ts', `${header('packages/icons/source/')}${icons.map(({ def }) => `export { ${camel(def.id)}Icon } from './${def.id}.js';\n`).join('')}export * from './overlays.js';\n`);
  const hashes = `${JSON.stringify(Object.fromEntries([...icons, ...overlays].map(({ def }) => [`${def.kind === 'overlay' ? 'overlay:' : ''}${def.id}`, hash(def)])), null, 2)}\n`;

  if (check) {
    const stale = [];
    for (const [name, text] of files) {
      const path = join(outDir, name);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== text) stale.push(name);
    }
    if (existsSync(outDir)) for (const name of readdirSync(outDir)) if (!files.has(name)) stale.push(`${name} (no source)`);
    if (!existsSync(hashFile) || readFileSync(hashFile, 'utf8') !== hashes) stale.push('docs/icons/geometry-hashes.json');
    if (stale.length) {
      console.error(`icons:compile: stale output (${stale.slice(0, 10).join(', ')}); run node scripts/icons/compile.mjs`);
      process.exit(1);
    }
  } else {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    for (const [name, text] of files) writeFileSync(join(outDir, name), text);
    writeFileSync(hashFile, hashes);
  }
  console.log(`icons:compile: ok (${String(icons.length)} icons, ${String(overlays.length)} overlays)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) run();
