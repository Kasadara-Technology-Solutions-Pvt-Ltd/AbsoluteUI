// Builds the MCP content snapshot (docs/PLAN-R15-MCP.md section 3, R15-6): packages/mcp/dist/content.json,
// from the same sources and loaders as the docs site (apps/site/scripts/lib), so the server answers
// with what the docs publish for this version. Requires built packages (npm run build).
// Usage: node packages/mcp/scripts/build-content.mjs [outFile]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { componentNames, loadComponent, root, stripSpec } from '../../../apps/site/scripts/lib/shared.mjs';
import { ADDONS, ADDON_SUMMARIES, GROUPS, sections } from '../../../apps/site/scripts/lib/components.mjs';
import { HIGHLIGHTS } from '../../../apps/site/scripts/lib/highlights.mjs';
import { SHOWCASES } from '../../../apps/site/scripts/lib/showcases.mjs';
import { ANGULAR_API, ANGULAR_GUIDES, angularEntries } from '../../../apps/site/scripts/lib/angular.mjs';
import { extractApi } from '../../../apps/site/scripts/lib/api-packages.mjs';
import { HELPER_MODULES, SERVICE_MODULES } from '../../../apps/site/scripts/lib/helper-modules.mjs';
import { bundleSizes } from '../../../apps/site/scripts/lib/quality.mjs';
import { howToPages } from '../../../scripts/api-examples.mjs';

/** Published docs (one site, R15-17). */
export const DOCS_URL = 'https://aui.kasadara.com/docs';
/**
 * Authored doc sections the docs site publishes on a component page (apps/site/scripts/lib/components.mjs).
 * The others repeat the metadata (when to use, API, slots, CSS hooks, tokens, keyboard, ARIA: served
 * from component.json, api.json, accessibility.json, tokens.json) or are framework examples that are
 * never published (34-37; Angular comes from its own metadata, React and Vue are not available).
 */
const PUBLISHED_SECTIONS = new Set([1, 2, 11, 12, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33]);
/** Components removed or on hold (R15-20): never part of the content. */
export const EXCLUDED = ['geo-map', 'sankey-chart', 'query-builder', 'rule-builder', 'spreadsheet', 'pdf-viewer'];

const outFile = resolve(process.argv[2] ?? join(root, 'packages', 'mcp', 'dist', 'content.json'));
const started = Date.now();
const problems = [];

for (const dir of ['components', 'theme', 'angular', 'core'].map((p) => join(root, 'packages', p, 'dist'))) {
  if (!existsSync(dir)) {
    console.error(`build-content: build the packages first (npm run build): ${dir} is missing.`);
    process.exit(1);
  }
}

/** Markdown for assistants: no internal specification references, absolute links to the published docs. */
function publish(md) {
  const lines = stripSpec(md.replace(/\r\n/g, '\n')).split('\n');
  let fence = null;
  return lines
    .map((line) => {
      const marker = /^\s*(```+|~~~+)/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (line.trim().startsWith(fence)) fence = null;
        return line;
      }
      if (fence) return line;
      return line
        .replace(/\]\(([a-z0-9-]+)\.md(#[^)]*)?\)/g, (_, name, hash) => `](${DOCS_URL}/components/${name}/${hash ?? ''})`)
        .replace(/\]\(\/docs\//g, `](${DOCS_URL}/`);
    })
    .join('\n')
    .trim();
}

/** Deep copy with every string passed through stripSpec. */
function clean(value) {
  if (typeof value === 'string') return stripSpec(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
}

const omit = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k)));

function frontmatter(md) {
  const text = md.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const fields = {};
  if (match) for (const line of match[1].split('\n')) {
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (m) fields[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  return { fields, body: match ? text.slice(match[0].length) : text };
}

// Components.
const groupOf = new Map(GROUPS.flatMap(([label, list]) => list.map((n) => [n, label])));
const names = componentNames().filter((n) => !EXCLUDED.includes(n));
const showcasesOf = (name) => SHOWCASES.filter((s) => s.components.includes(name)).map((s) => s.id);
const sizes = new Map((await bundleSizes(names)).map((r) => [r.name, r]));
const angularByComponent = new Map();
const angular = angularEntries().map(({ entry, meta }) => {
  const component = meta.declarations.find((d) => d.component)?.component ?? null;
  if (component && !angularByComponent.has(component)) angularByComponent.set(component, entry);
  const api = ANGULAR_API.find(([e]) => e === entry);
  return {
    entry,
    import: entry === 'index' ? '@absoluteui/angular' : `@absoluteui/angular/${entry}`,
    component,
    title: api?.[1] ?? (component ? null : entry),
    summary: api?.[2] ?? null,
    docUrl: component ? `${DOCS_URL}/angular/components/${entry}/` : `${DOCS_URL}/angular/api/${entry === 'index' ? '' : `${entry}/`}`,
    declarations: clean(meta.declarations),
    examples: (meta.example ?? []).map((e) => ({ language: e.language, code: e.code })),
  };
});

const components = names.map((name) => {
  const c = loadComponent(name);
  const { sections: numbered } = sections(c.doc);
  const docSections = [];
  for (const [n, s] of numbered) {
    if (!PUBLISHED_SECTIONS.has(n)) continue;
    const body = publish(n === 27 ? s.body.replace(/^More examples, type-checked in CI:.*$/m, '') : s.body);
    if (!body || /^(none\.?|n\/a\.?|not applicable\.?)$/i.test(body)) continue;
    docSections.push({ number: n, heading: s.heading, body });
  }
  const size = sizes.get(name);
  return {
    name,
    displayName: c.component.displayName,
    category: c.component.category,
    group: groupOf.get(name) ?? c.component.category,
    purpose: stripSpec(c.component.purpose),
    whenToUse: clean(c.component.whenToUse ?? []),
    whenNotToUse: clean(c.component.whenNotToUse ?? []),
    import: c.component.import,
    styleImport: c.component.styleImport,
    docUrl: `${DOCS_URL}/components/${name}/`,
    highlights: HIGHLIGHTS[name] ?? [],
    component: clean(omit(c.component, 'schemaVersion', 'name', 'displayName', 'category', 'purpose', 'whenToUse', 'whenNotToUse', 'import', 'styleImport', 'package')),
    api: clean(omit(c.api, 'schemaVersion', 'component')),
    accessibility: clean(omit(c.accessibility, 'schemaVersion', 'component')),
    tokens: c.tokens.tokens ?? [],
    examples: c.examples.examples.map((e) => ({ id: e.id, title: stripSpec(e.title), language: e.language, code: e.code })),
    sections: docSections,
    importCost: size ? { jsBytes: size.js, jsGzipBytes: size.jsGzip, jsBrotliBytes: size.jsBrotli, cssBrotliBytes: size.cssBrotli } : null,
    showcases: showcasesOf(name),
    angularEntry: angularByComponent.get(name) ?? null,
  };
});
for (const [label, list] of GROUPS) for (const n of list) if (!names.includes(n) && !ADDONS.includes(n)) problems.push(`group ${label} lists unknown ${n}`);

// Add-on entry points (authored docs plus the API from .d.ts).
const componentsDist = join(root, 'packages', 'components', 'dist');
const addons = ADDONS.map((name) => {
  const entry = name.startsWith('data-grid-') ? join('data-grid', name.slice('data-grid-'.length)) : name;
  const doc = readFileSync(join(root, 'packages', 'components', 'docs', `${name}.md`), 'utf8');
  return {
    name,
    import: `@absoluteui/components/${entry.replace(/\\/g, '/')}`,
    summary: ADDON_SUMMARIES[name] ?? '',
    docUrl: `${DOCS_URL}/components/${name}/`,
    markdown: publish(doc.replace(/^> .+$/m, '')),
    api: extractApi(join(componentsDist, entry, 'index.d.ts'), join(componentsDist, entry)).map(apiItem),
  };
});

function apiItem(i) {
  const d = i.doc ?? {};
  const params = (d.params ?? []).length ? `

Parameters: ${d.params.join('; ')}` : '';
  const returns = d.returns ? `

Returns: ${d.returns}` : '';
  return {
    module: i.module,
    kind: i.kind,
    name: i.name,
    signature: i.signature,
    doc: stripSpec(`${d.text ?? ''}${params}${returns}`.trim()),
    deprecated: d.deprecated ?? null,
    examples: [...(d.examples ?? []), ...(i.memberExamples ?? []).map((m) => `// ${m.member}
${m.code}`)],
  };
}

// Showcases (R19): source of each fully featured scenario.
const showcases = SHOWCASES.map((s) => ({ id: s.id, title: s.title, components: s.components.filter((n) => names.includes(n)), code: readFileSync(s.file, 'utf8').replace(/\r\n/g, '\n') }));

// Package APIs.
const howTo = new Map(howToPages().map((p) => [p.slug, p.file]));
const howToText = (slug) => {
  const file = howTo.get(slug);
  return file && existsSync(file) ? publish(readFileSync(file, 'utf8')) : '';
};
const PACKAGE_ROOTS = [
  ['core', '@absoluteui/core', 'packages/core/dist', 'Configuration, dates and time zones, recurrence, internationalization, sanitization, errors, and DOM helpers shared by every component.'],
  ['utilities', '@absoluteui/utilities', 'packages/utilities/dist', 'Accessibility, focus, keyboard, drag, overlay, positioning, scrolling, and motion primitives used by components and available to applications.'],
  ['theme', '@absoluteui/theme', 'packages/theme/dist', 'Theme runtime, built-in themes, tokens, component tokens, contrast evaluation, and web fonts.'],
  ['theme-designer', '@absoluteui/theme/designer', 'packages/theme/dist/designer', 'Theme Designer engine: theme families, seed-to-role derivation, compliance assessment, and exports.'],
  ['icons', '@absoluteui/icons', 'packages/icons/dist', 'Icon registry, the built-in icons, and the AbsoluteUI icon set (@absoluteui/icons/set).'],
];
const api = [];
for (const [slug, subpath, dist, summary] of PACKAGE_ROOTS) {
  const pkg = slug === 'theme-designer' ? 'theme' : slug;
  api.push({ package: pkg, module: slug === 'theme-designer' ? 'designer' : null, import: subpath, summary, preview: false, docUrl: `${DOCS_URL}/api/${slug}/`, howTo: howToText(slug), items: extractApi(join(root, dist, 'index.d.ts'), join(root, dist)).map(apiItem) });
}
for (const [pkg, summaries, preview] of [['helpers', HELPER_MODULES, false], ['services', SERVICE_MODULES, true]]) {
  const exports = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')).exports;
  for (const key of Object.keys(exports).filter((k) => k !== '.' && k !== './package.json').sort()) {
    const mod = key.slice(2);
    const dist = join(root, 'packages', pkg, 'dist', mod);
    api.push({ package: pkg, module: mod, import: `@absoluteui/${pkg}/${mod}`, summary: summaries[mod] ?? '', preview, docUrl: `${DOCS_URL}/api/${pkg}/${mod}/`, howTo: howToText(`${pkg}/${mod}`), items: extractApi(join(dist, 'index.d.ts'), dist).map(apiItem) });
    if (!summaries[mod]) problems.push(`no summary for ${pkg}/${mod}`);
  }
}

// Guides: getting started, guides, Angular guides.
const guides = [];
const addGuide = (slug, file) => {
  const { fields, body } = frontmatter(readFileSync(file, 'utf8'));
  guides.push({ slug, title: fields.title ?? slug, description: fields.description ?? '', docUrl: `${DOCS_URL}/${slug}/`, markdown: publish(body) });
};
for (const dir of ['getting-started', 'guides']) {
  const base = join(root, 'apps', 'site', 'src', 'content', 'docs', dir);
  for (const f of readdirSync(base).filter((x) => x.endsWith('.md')).sort()) addGuide(`${dir}/${f.slice(0, -3)}`, join(base, f));
}
addGuide('angular', join(root, 'apps', 'site', 'angular', 'index.md'));
for (const [slug] of ANGULAR_GUIDES) addGuide(`angular/guides/${slug}`, join(root, 'apps', 'site', 'angular', 'guides', `${slug}.md`));

// Design tokens: global tokens per built-in theme, densities, and component tokens.
const tokensJson = JSON.parse(readFileSync(join(root, 'packages', 'theme', 'dist', 'tokens.json'), 'utf8'));
const { componentTokens } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'component-tokens.js')).href);
const tokens = {
  themes: tokensJson.themes.map((t) => ({ name: t.name, mode: t.mode, tokens: t.tokens })),
  densities: tokensJson.densities,
  components: Object.entries(componentTokens).map(([component, group]) => ({
    component,
    tokens: Object.entries(group.tokens).map(([property, spec]) => ({ name: `${component}-${property}`, cssProperty: `--aui-${component}-${property}`, fallback: spec.fallback, kind: spec.kind, usage: spec.usage })),
  })),
};

// Icon set (R16).
const catalog = JSON.parse(readFileSync(join(root, 'docs', 'icons', 'catalog.draft.json'), 'utf8'));
const camel = (id) => id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const icons = {
  icons: Object.values(catalog.icons).map((i) => ({
    id: i.id,
    displayName: i.displayName,
    category: i.category,
    categoryName: i.categoryName,
    description: i.description,
    aliases: i.aliases ?? [],
    variants: i.variants ?? [],
    animations: i.animations ?? [],
    rtl: i.rtl,
    exportName: `${camel(i.id)}Icon`,
    import: `import { ${camel(i.id)}Icon } from '@absoluteui/icons/set';`,
  })),
  overlays: (catalog.overlays ?? []).map((o) => ({ id: o.id, meaning: o.meaning, exportName: `${camel(o.id)}Overlay` })),
};
for (const i of icons.icons) if (!existsSync(join(root, 'packages', 'icons', 'src', 'set', `${i.id}.ts`))) problems.push(`icon ${i.id} has no compiled module`);

// Dashboard definition schema (R15-15): exactly what the library returns.
const dashboardSchemaModule = await import(pathToFileURL(join(componentsDist, 'dashboard', 'schema', 'index.js')).href);
const schemas = { dashboard: dashboardSchemaModule.definitionSchema() };

// Published text never carries internal release ids (as the docs site's check-output).
const prose = (md) => md.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
const releaseId = /.{0,40}\bR\d+\b.{0,20}/;
for (const c of components) for (const s of c.sections) if (releaseId.test(prose(s.body))) problems.push(`${c.name} section ${s.number}: internal release id (${releaseId.exec(prose(s.body))[0].trim()})`);
for (const g of guides) if (releaseId.test(prose(g.markdown))) problems.push(`guide ${g.slug}: internal release id (${releaseId.exec(prose(g.markdown))[0].trim()})`);

if (problems.length) {
  console.error(`build-content: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const version = JSON.parse(readFileSync(join(root, 'packages', 'mcp', 'package.json'), 'utf8')).version;
const content = { schemaVersion: 1, version, docsUrl: DOCS_URL, components, addons, showcases, angular, api, guides, tokens, icons, schemas, excluded: EXCLUDED };
mkdirSync(dirname(outFile), { recursive: true });
const text = JSON.stringify(content);
writeFileSync(outFile, text);
console.log(`build-content: ${components.length} components, ${addons.length} add-ons, ${showcases.length} showcases, ${angular.length} Angular entries, ${api.length} API modules, ${guides.length} guides, ${icons.icons.length} icons; ${(text.length / 1024 / 1024).toFixed(2)} MB (${Date.now() - started} ms)`);
