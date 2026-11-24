// Angular documentation (docs/PLAN-R10-DOCS.md). Public since the user declared the Angular
// integration done (2026-10-13, R10-12); `--no-angular` builds the site without it.
// Component pages come from packages/angular/metadata (R10-6); behavior, accessibility,
// tokens, and limitations stay on the framework-neutral component pages (linked, not copied).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiMarkdown, extractApi } from './api-packages.mjs';
import { GROUPS } from './components.mjs';
import { HIGHLIGHTS } from './highlights.mjs';
import { cell, code, contentDir, firstSentence, readJson, root, siteDir, stripSpec, write, yaml } from './shared.mjs';

/** Whether this run generates the Angular documentation. */
export const angularEnabled = !process.argv.includes('--no-angular');

/** Hand-written Angular pages (outside the content collection; copied in by the generator). */
export const angularSourceDir = join(siteDir, 'angular');
export const angularContentDir = join(contentDir, 'angular');
const metadataDir = join(root, 'packages', 'angular', 'metadata');
const NOT_ENTRIES = new Set(['schema.json', 'server-rendering.json']);

/** Guides in sidebar order: [slug, label]. Each has a file in apps/site/angular/guides/. */
export const ANGULAR_GUIDES = [
  ['getting-started', 'Getting started'],
  ['configuration', 'Configuration'],
  ['component-api', 'Component API'],
  ['forms', 'Forms'],
  ['templates', 'Templates and content'],
  ['overlays', 'Overlays'],
  ['icons', 'Icons'],
  ['data-tables', 'Data tables'],
  ['dates', 'Dates, time zones, and business calendars'],
  ['router', 'Router'],
  ['server-rendering', 'Server rendering'],
  ['accessibility', 'Accessibility'],
  ['testing', 'Testing'],
  ['diagnostics', 'Development diagnostics'],
  ['performance', 'Performance'],
  ['versioning', 'Versions and API stability'],
];

/** Every Angular entry point: `{ entry, meta }` (entry `index` is the package root). */
export function angularEntries() {
  return readdirSync(metadataDir)
    .filter((f) => f.endsWith('.json') && !NOT_ENTRIES.has(f))
    .sort()
    .map((f) => ({ entry: f.slice(0, -'.json'.length), meta: readJson(join(metadataDir, f)) }));
}

/** The neutral component an entry wraps (every declaration of an entry wraps the same one), or null. */
const neutralOf = (meta) => meta.declarations.find((d) => d.component)?.component ?? null;

/** The page an entry is documented on: its neutral component, or null for an API page. */
const pageComponentOf = (entry, meta) => neutralOf(meta) ?? (entry === 'toast' ? 'toast' : null);

/** Display title of an entry's page (component name, or the API page title). */
export function angularTitle(entry, meta) {
  const neutral = pageComponentOf(entry, meta);
  if (neutral) return readJson(join(root, 'packages', 'components', 'metadata', neutral, 'component.json')).displayName;
  return ANGULAR_API.find(([e]) => e === entry)?.[1] ?? entry;
}

/** Example code blocks, each followed by its live frame when it has one (R12-3). */
function exampleMarkdown(meta, frames) {
  const lines = ['## Live example', ''];
  for (const block of meta.example) {
    lines.push(`\`\`\`${block.language}`, block.code, '```', '');
    const frame = frames?.get(block.code);
    if (frame) lines.push(frame, '');
  }
  return lines;
}

/** Entry points documented on another component's page: companion -> host page. */
const COMPANIONS = { 'pivot-field-list': 'pivot-grid' };

const SERVER = {
  server: 'Renders on the server; the browser re-creates it after hydration.',
  browser: 'Renders in the browser only; on the server the element stays empty.',
};

/** Harnesses by the class they test (`AuiSelectHarness` tests `AuiSelect`). */
function harnessIndex(entries) {
  const testing = entries.find((e) => e.entry === 'testing');
  const out = new Map();
  for (const d of testing?.meta.declarations ?? []) if (d.kind === 'harness') out.set(d.name.replace(/Harness$/, ''), d);
  return out;
}

function table(headers, rows) {
  if (!rows.length) return [];
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`), ''];
}

/** Markdown for one component, directive, service, or class declaration. */
export function declarationMarkdown(d, { harnesses, level = 2 } = {}) {
  const h = '#'.repeat(level);
  const out = [`${h} ${d.selector ? code(/^[a-z][a-z0-9-]*$/.test(d.selector) ? `<${d.selector}>` : d.selector) : code(d.name)}`, ''];
  const facts = [];
  if (d.selector) facts.push(`Class ${code(d.name)}`);
  else facts.push(d.kind === 'service' ? 'Injectable service' : d.kind === 'class' ? 'Class' : d.kind);
  if (d.exportAs?.length) facts.push(`template reference ${d.exportAs.map((e) => code(`#ref="${e}"`)).join(', ')}`);
  out.push(`${facts.join('; ')}.`, '');
  // Generated components describe themselves through the sections below; their summary comment repeats them.
  if (d.description && d.source !== 'generated') out.push(publicText(d.description), '');
  if (d.serverRendering) out.push(`**Server rendering:** ${SERVER[d.serverRendering]}`, '');
  if (d.forms) {
    out.push(
      `**Angular forms:** ${d.forms.validator ? 'implements `ControlValueAccessor` and `Validator`' : 'implements `ControlValueAccessor`'}; the form value is ${code(d.forms.valueType)}. Bind ${code('[formControl]')}, ${code('formControlName')}, or ${code('[(ngModel)]')}; validation messages of the component report through the ${code('aui')} error key. See [Forms](/docs/angular/guides/forms/).`,
      '',
    );
  }
  if (d.inputs?.length) {
    out.push(`${h}# Inputs`, '');
    out.push(...table(['Input', 'Type', 'Default', 'Description'], d.inputs.map((i) => [code(i.name), code(typeText(i.type)), i.default === undefined ? '' : code(defaultText(i.default)), cell([i.required ? '**Required.**' : '', i.description ? publicText(i.description) : ''].filter(Boolean).join(' '))])));
  }
  if (d.models?.length) {
    out.push(`${h}# Two-way bindings`, '');
    out.push(...table(['Model', 'Type', 'Change output', 'Description'], d.models.map((m) => [code(`[(${m.name})]`), code(m.type), code(`(${m.change})`), cell(publicText(m.description ?? ''))])));
  }
  if (d.outputs?.length) {
    out.push(`${h}# Outputs`, '');
    out.push(...table(['Output', 'Payload', 'Description'], d.outputs.map((o) => [code(`(${o.name})`), code(o.payload === 'unknown' && o.detail ? o.detail : o.payload), cell([publicText(o.description ?? ''), o.event ? `Re-emits ${code(o.event)}.` : ''].filter(Boolean).join(' '))])));
  }
  const signals = (d.properties ?? []).filter((p) => p.name !== 'formState');
  if (signals.length) {
    out.push(`${h}# Read-only state`, '');
    out.push(...table(['Property', 'Type', 'Description'], signals.map((p) => [code(p.name), code(p.type), cell(publicText((p.description ?? '').replace(/^Read-only: /, '')))])));
  }
  const methods = (d.methods ?? []).filter((m) => !m.static || d.kind === 'harness');
  if (methods.length) {
    out.push(`${h}# Methods`, '');
    if (d.selector) out.push(`Call them through a ${code('viewChild')} query or a template reference.`, '');
    out.push(...table(['Method', 'Description'], methods.map((m) => [code(m.signature), cell(publicText(m.description ?? ''))])));
  }
  if (d.templates?.length) {
    out.push(`${h}# Templates`, '', `Customize rendering with ${d.templates.map((t) => code(t)).join(', ')} from [${code('@absoluteui/angular/templates')}](/docs/angular/api/templates/).`, '');
  }
  // The host component lists its parts; the part components themselves do not repeat the table.
  if (d.projection?.parts && !Object.values(d.projection.parts).includes(d.name)) {
    out.push(`${h}# Content parts`, '', ...table(['Part', 'Element'], Object.entries(d.projection.parts).map(([part, cls]) => [code(part), code(cls)])));
  }
  const harness = harnesses?.get(d.name);
  if (harness) {
    out.push(`${h}# Test harness`, '', `${code(harness.name)} from [${code('@absoluteui/angular/testing')}](/docs/angular/api/testing/). ${publicText(harness.description ?? '')}`, '');
  }
  return out;
}

/** Function types print wrapped in parentheses (from optional unions); show them bare. */
const typeText = (type) => (/^((.*) => .*)$/.test(type) ? type.slice(1, -1) : type);

/** Defaults are recorded as source text without quotes for strings. */
const defaultText = (value) => (/^(true|false|null|undefined|-?d+(.d+)?|[.*]|{.*}|'.*'|".*")$/.test(value) ? value : `'${value}'`);

/**
 * Text from metadata descriptions, for Markdown. Descriptions are checked free of repository
 * paths and internal ids by the metadata generator; `<` outside code is escaped.
 */
function publicText(text) {
  return stripSpec(String(text))
    .replace(/\r?\n/g, ' ')
    .split(/(`+[^`]*`+)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/</g, '&lt;')))
    .join('')
    .trim();
}

function componentPage(entry, meta, neutral, harnesses, companions, frames) {
  const component = readJson(join(root, 'packages', 'components', 'metadata', neutral, 'component.json'));
  const name = component.displayName;
  const main = meta.declarations.find((d) => d.selector && d.kind === 'component') ?? meta.declarations[0];
  const exports = meta.declarations.filter((d) => d.selector || d.kind === 'service').map((d) => d.name);
  const lines = [
    '---',
    `title: ${yaml(`${name} for Angular`)}`,
    `description: ${yaml(`${main.selector ? `<${main.selector}>` : main.name}: ${stripSpec(firstSentence(component.purpose.replace(/\n/g, ' ')))}`)}`,
    '---',
    '',
    `<div class="aui-doc-meta aui-cpage"><span>Angular</span><span>${component.category}</span></div>`,
    '',
    // Page template (R20-14): the component page sections, with the AOT frames as the live example.
    '## Introduction',
    '',
    publicText(component.purpose),
    '',
  ];
  const highlights = HIGHLIGHTS[neutral] ?? [];
  if (highlights.length) {
    lines.push('<ul class="aui-highlights">');
    for (const h of highlights) lines.push(`<li><strong>${publicText(h.title)}</strong><span>${publicText(h.text)}</span></li>`);
    lines.push('</ul>', '');
  }
  lines.push(`Behavior, design tokens, and limitations are described on the [${name}](/docs/components/${neutral}/) page; this page covers the Angular API.`, '');
  if (meta.example?.length) lines.push(...exampleMarkdown(meta, frames));
  lines.push(
    '## Install and start',
    '',
    '```sh',
    'npm install @absoluteui/angular @absoluteui/components @absoluteui/core @absoluteui/theme',
    '```',
    '',
    'Setup with `provideAbsoluteUI()` is covered in [Getting started](/docs/angular/guides/getting-started/). Styles are included with the component.',
    '',
    '```ts',
    `import { ${exports.join(', ')} } from '@absoluteui/angular/${entry}';`,
    '```',
    '',
  );
  if (main.configKey) lines.push(`Defaults for every instance: ${code(`provideAbsoluteUIConfig({ components: { ${main.configKey}: { ... } } })`)} (see [Configuration](/docs/angular/guides/configuration/)).`, '');
  lines.push('## API reference', '');
  for (const d of meta.declarations) lines.push(...declarationMarkdown(d, { harnesses, level: 3 }));
  for (const f of meta.functions ?? []) lines.push(`### ${code(f.name)}`, '', '```ts', f.signature, '```', '', ...(f.description ? [publicText(f.description), ''] : []));
  for (const c of companions) {
    lines.push('```ts', `import { ${c.meta.declarations.map((d) => d.name).join(', ')} } from '@absoluteui/angular/${c.entry}';`, '```', '');
    for (const d of c.meta.declarations) lines.push(...declarationMarkdown(d, { harnesses, level: 3 }));
  }
  const a11y = readJson(join(root, 'packages', 'components', 'metadata', neutral, 'accessibility.json'));
  lines.push(
    '## Accessibility and performance',
    '',
    `**Pattern:** ${publicText(a11y.pattern ?? '')}`,
    '',
    `The Angular component renders the framework-neutral component, so its keyboard support, roles, WCAG 2.2 criteria, budgets, and import cost apply unchanged: see [${name}: Accessibility and performance](/docs/components/${neutral}/#accessibility-and-performance).`,
    '',
  );
  return { title: name, text: lines.join('\n') };
}

/** Entry points that are not a component: [entry, title, summary] in sidebar order (R10-8). */
export const ANGULAR_API = [
  ['index', '@absoluteui/angular', 'Application setup: provideAbsoluteUI and provideAbsoluteUIConfig, and the services for configuration, theme, locale, direction, icons, platform, and ids.'],
  ['forms', '@absoluteui/angular/forms', 'Angular forms support shared by every form control: control state, validation message mapping, and error keys.'],
  ['templates', '@absoluteui/angular/templates', 'Structural directives that render Angular templates inside components: items, selected items, cells, row details, headers, group headers, empty states, and editors.'],
  ['overlay', '@absoluteui/angular/overlay', 'Open dialogs and drawers from components or templates, pass data, and read results.'],
  ['a11y', '@absoluteui/angular/a11y', 'Accessibility building blocks for application code: live announcements, focus trapping and restoring, roving tabindex, and keyboard shortcuts.'],
  ['icon', '@absoluteui/angular/icon', 'Render registered icons with <aui-icon>.'],
  ['router', '@absoluteui/angular/router', 'Connect navigation components (sidebar, breadcrumb, tabs, stepper, menus) to the Angular router.'],
  ['testing', '@absoluteui/angular/testing', 'Component harnesses for @angular/cdk/testing: test through the rendered DOM as a user does.'],
  ['chart-export', '@absoluteui/angular/chart-export', 'Export charts as SVG or PNG files.'],
];

function apiPage(entry, title, summary, meta, harnesses, frames) {
  const declared = new Set(meta.declarations.map((d) => d.name));
  const dist = join(root, 'packages', 'angular', 'dist');
  const file = join(dist, entry === 'index' ? 'index.d.ts' : join(entry, 'index.d.ts'));
  // Classes are documented from the metadata (inputs, outputs, methods) instead of their compiled declarations.
  const items = extractApi(file, dist).filter((i) => !(i.kind === 'Classes' && declared.has(i.name)));
  const lines = ['---', `title: ${yaml(title)}`, `description: ${yaml(summary)}`, '---', '', publicText(summary), ''];
  const names = [...declared, ...items.filter((i) => i.kind === 'Functions' || i.kind === 'Constants').map((i) => i.name)];
  if (names.length) lines.push('```ts', `import { ${names.join(', ')} } from '${title}';`, '```', '');
  if (meta.example?.length) lines.push(...exampleMarkdown(meta, frames));
  for (const d of meta.declarations) lines.push(...declarationMarkdown(d, { harnesses }));
  if (items.length) lines.push('## Functions, constants, and types', '', apiMarkdown(items, 3));
  return lines.join('\n');
}

/**
 * Generate the Angular pages; returns the sidebar items.
 * @param {Map<string, Map<string, string>>} frames Live frame markup per entry, by example code (angular-frames.mjs).
 */
export function generateAngular(frames = new Map()) {
  const copy = (from, to) => write(join(angularContentDir, to), readFileSync(join(angularSourceDir, from), 'utf8'));
  copy('index.md', 'index.md');
  const guides = [];
  for (const [slug, label] of ANGULAR_GUIDES) {
    copy(join('guides', `${slug}.md`), join('guides', `${slug}.md`));
    guides.push({ label, link: `/docs/angular/guides/${slug}/` });
  }
  const unlisted = existsSync(join(angularSourceDir, 'guides'))
    ? readdirSync(join(angularSourceDir, 'guides')).filter((f) => f.endsWith('.md') && !ANGULAR_GUIDES.some(([s]) => `${s}.md` === f))
    : [];
  if (unlisted.length) throw new Error(`generate: list these Angular guides in ANGULAR_GUIDES: ${unlisted.join(', ')}`);

  const entries = angularEntries();
  const harnesses = harnessIndex(entries);
  const titles = new Map();
  for (const { entry, meta } of entries) {
    const neutral = pageComponentOf(entry, meta);
    if (!neutral) continue;
    const companions = entries.filter((e) => COMPANIONS[e.entry] === entry);
    const page = componentPage(entry, meta, neutral, harnesses, companions, frames.get(entry));
    write(join(angularContentDir, 'components', `${entry}.md`), `${page.text}\n`);
    titles.set(entry, page.title);
  }
  const components = GROUPS.map(([label, list]) => ({ label, collapsed: true, items: list.filter((n) => titles.has(n)).map((n) => ({ label: titles.get(n), link: `/docs/angular/components/${n}/` })) })).filter((g) => g.items.length);
  const grouped = new Set(components.flatMap((g) => g.items.map((i) => i.link)));
  const ungrouped = [...titles.keys()].filter((n) => !grouped.has(`/docs/angular/components/${n}/`));
  if (ungrouped.length) throw new Error(`generate: Angular component pages without a sidebar group: ${ungrouped.join(', ')}`);

  const api = [];
  const byEntry = new Map(entries.map((e) => [e.entry, e.meta]));
  for (const [entry, title, summary] of ANGULAR_API) {
    const meta = byEntry.get(entry);
    if (!meta) throw new Error(`generate: no Angular metadata for ${entry}`);
    write(join(angularContentDir, 'api', `${entry}.md`), `${apiPage(entry, title, summary, meta, harnesses, frames.get(entry))}\n`);
    api.push({ label: title, link: entry === 'index' ? '/docs/angular/api/' : `/docs/angular/api/${entry}/` });
  }
  const covered = new Set([...titles.keys(), ...ANGULAR_API.map(([e]) => e), ...Object.keys(COMPANIONS)]);
  const orphans = entries.map((e) => e.entry).filter((e) => !covered.has(e));
  if (orphans.length) throw new Error(`generate: Angular entry points without a page: ${orphans.join(', ')} (add them to ANGULAR_API)`);

  return [
    { label: 'Overview', link: '/docs/angular/' },
    ...(guides.length ? [{ label: 'Guides', collapsed: true, items: guides }] : []),
    { label: 'Components', collapsed: true, items: components },
    { label: 'API reference', collapsed: true, items: api },
  ];
}
