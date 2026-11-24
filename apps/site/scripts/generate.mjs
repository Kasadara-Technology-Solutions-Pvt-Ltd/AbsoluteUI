// Generates the documentation content of apps/site from the packages (R4 phase A):
// component pages, live examples, package API reference, quality pages, and the
// sidebar. Requires built packages (`npm run build` at the repository root).
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ADDONS, ADDON_SUMMARIES, GROUPS, addonPage, componentPage, writeComponentPage } from './lib/components.mjs';
import { buildExamples } from './lib/examples.mjs';
import { KIT, SHOWCASES, checkShowcaseAnnotations } from './lib/showcases.mjs';
import { angularContentDir, angularEnabled, angularEntries, generateAngular } from './lib/angular.mjs';
import { buildAngularFrames } from './lib/angular-frames.mjs';
import { apiMarkdown, extractApi } from './lib/api-packages.mjs';
import { accessibilityPage, bundleSizes, performancePage } from './lib/quality.mjs';
import { playgrounds } from './lib/playground.mjs';
import { HIGHLIGHTS } from './lib/highlights.mjs';
import { browserSupportPage } from './lib/browsers.mjs';
import { HELPER_MODULES, SERVICE_MODULES } from './lib/helper-modules.mjs';
import { howToPages } from '../../../scripts/api-examples.mjs';
import { loadLegal, pagePaths } from '../../../scripts/legal.mjs';
import { cell, clean, componentNames, contentDir, docsSrcDir, firstSentence, generatedDir, loadComponent, root, siteDir, stripSpec, write, yaml } from './lib/shared.mjs';

const started = Date.now();
if (!existsSync(join(root, 'packages', 'components', 'dist'))) {
  console.error('generate: build the packages first (npm run build at the repository root).');
  process.exit(1);
}

for (const dir of ['components', 'api', 'quality']) clean(join(contentDir, dir));
// Angular pages are regenerated on every run (skipped with --no-angular).
clean(angularContentDir);

// Components and add-ons.
const names = componentNames();
const components = new Map(names.map((n) => [n, loadComponent(n)]));
const addons = ADDONS;
const grouped = GROUPS.flatMap(([, list]) => list);
const missing = [...names, ...addons].filter((n) => !grouped.includes(n));
const unknown = grouped.filter((n) => !names.includes(n) && !addons.includes(n));
if (missing.length || unknown.length) {
  console.error(`generate: sidebar groups out of date. Missing: ${missing.join(', ') || 'none'}. Unknown: ${unknown.join(', ') || 'none'}.`);
  process.exit(1);
}

const docs = new Map([...components].map(([n, c]) => [n, c.doc]));
const siteExamples = [
  { name: 'icons', id: 'gallery', title: 'Built-in icons', file: join(root, 'apps', 'site', 'src', 'examples', 'icon-gallery.ts') },
  { name: 'icons-set', id: 'gallery', title: 'AbsoluteUI icon set', file: join(root, 'apps', 'site', 'src', 'examples', 'icon-set-gallery.ts') },
];
const unknownShowcase = SHOWCASES.flatMap((sc) => sc.components).filter((n) => !names.includes(n));
if (unknownShowcase.length) {
  console.error(`generate: showcases list unknown components: ${unknownShowcase.join(', ')}`);
  process.exit(1);
}
const annotationProblems = checkShowcaseAnnotations((file) => readFileSync(file, 'utf8'));
if (annotationProblems.length) {
  console.error(`generate: showcase focus annotations (R20-26) out of date:\n  ${annotationProblems.join('\n  ')}`);
  process.exit(1);
}
const { blocks, showcaseBlocks, playgroundBlocks, count } = await buildExamples(new Map([...components].map(([n, c]) => [n, { displayName: c.component.displayName, examples: c.examples.examples }])), docs, siteExamples, SHOWCASES, KIT, playgrounds(components));
const sizes = new Map((await bundleSizes(names)).map((r) => [r.name, r]));
for (const [name, c] of components) {
  writeComponentPage(name, componentPage(c, { live: blocks.get(name) ?? [], showcase: showcaseBlocks.get(name) ?? [], playground: playgroundBlocks.get(name) ?? [], highlights: HIGHLIGHTS[name] ?? [], size: sizes.get(name), angular: angularEnabled }));
}

const componentsDist = join(root, 'packages', 'components', 'dist');
for (const name of addons) {
  const entry = name.startsWith('data-grid-') ? join('data-grid', name.slice('data-grid-'.length)) : name;
  const items = extractApi(join(componentsDist, entry, 'index.d.ts'), join(componentsDist, entry));
  writeComponentPage(name, addonPage(name, readFileSync(join(docsSrcDir, `${name}.md`), 'utf8'), apiMarkdown(items, 3)));
}

// "How to use" sections (docs/PLAN-R7.md D1, D2): hand-written, required on every API page.
const howToFiles = new Map(howToPages().map((p) => [p.slug, p.file]));
const howToProblems = [];
const howToSection = (slug) => {
  const file = howToFiles.get(slug);
  if (file === undefined || !existsSync(file)) {
    howToProblems.push(`${slug}: add ${file === undefined ? 'a how-to file' : relative(root, file)}`);
    return [];
  }
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  if (/^#{1,2} /m.test(text)) howToProblems.push(`${relative(root, file)}: use ### headings (the page supplies # and ##)`);
  return ['## How to use', '', text, ''];
};

// Package API reference.
const PACKAGES = [
  ['core', '@absoluteui/core', 'packages/core/dist', 'index.d.ts', 'Configuration, dates and time zones, recurrence, internationalization, sanitization, errors, and DOM helpers shared by every component.'],
  ['utilities', '@absoluteui/utilities', 'packages/utilities/dist', 'index.d.ts', 'Accessibility, focus, keyboard, drag, overlay, positioning, scrolling, and motion primitives used by components and available to applications.'],
  ['theme', '@absoluteui/theme', 'packages/theme/dist', 'index.d.ts', 'Theme runtime, built-in themes, tokens, component tokens, contrast evaluation, and web fonts.'],
  ['theme-designer', '@absoluteui/theme/designer', 'packages/theme/dist/designer', 'index.d.ts', 'Theme Designer engine: theme families, seed-to-role derivation, compliance assessment, and exports.'],
  ['icons', '@absoluteui/icons', 'packages/icons/dist', 'index.d.ts', 'Icon registry, the built-in icons, and the AbsoluteUI icon set (@absoluteui/icons/set).'],
];
const apiSidebar = [];
for (const [slug, pkg, dist, entry, description] of PACKAGES) {
  const items = extractApi(join(root, dist, entry), join(root, dist));
  write(
    join(contentDir, 'api', `${slug}.md`),
    ['---', `title: ${yaml(pkg)}`, `description: ${yaml(description)}`, '---', '', description, '', '```ts', `import { ... } from '${pkg}';`, '```', '', ...howToSection(slug), ...(slug === 'icons' ? ['## Built-in icons', '', ...(blocks.get('icons') ?? []), '## AbsoluteUI icon set', '', 'Every icon of `@absoluteui/icons/set`, grouped by category, in each variant it provides, with the animations it lists. Use the category links or the search field to find an icon. Import an icon by its camel-cased name plus `Icon` (`alarm-clock` is `alarmClockIcon`) and an overlay plus `Overlay` (`lockOverlay`); see [the icon set](/docs/guides/icons/#the-absoluteui-icon-set) in the Icons guide.', '', ...(blocks.get('icons-set') ?? [])] : []), '## API reference', '', apiMarkdown(items, 3)].join('\n'),
  );
  apiSidebar.push({ label: pkg, link: `/docs/api/${slug}/` });
}

// Helpers and services: an overview and one API page per module (R5).
let modulePages = 0;
for (const [pkgDir, pkgName, summaries, intro] of [
  ['helpers', '@absoluteui/helpers', HELPER_MODULES, 'Pure, zero-dependency helpers that run in browsers, Node, workers, and during server rendering. Import each module from its own subpath.'],
  ['services', '@absoluteui/services', SERVICE_MODULES, 'Browser services for storage, network, files, downloads, and the environment. Every module is safe to import during server rendering.'],
]) {
  const pkgJson = JSON.parse(readFileSync(join(root, 'packages', pkgDir, 'package.json'), 'utf8'));
  const modules = Object.keys(pkgJson.exports).filter((k) => k !== '.' && k !== './package.json').map((k) => k.slice(2)).sort();
  const undocumented = modules.filter((m) => !summaries[m]);
  if (undocumented.length) {
    console.error(`generate: add summaries for ${pkgName} modules: ${undocumented.join(', ')} (scripts/lib/helper-modules.mjs).`);
    process.exit(1);
  }
  const items = [];
  for (const mod of modules) {
    const dist = join(root, 'packages', pkgDir, 'dist', mod);
    const subpath = `${pkgName}/${mod}`;
    const api = extractApi(join(dist, 'index.d.ts'), dist);
    write(
      join(contentDir, 'api', pkgDir, `${mod}.md`),
      ['---', `title: ${yaml(subpath)}`, `description: ${yaml(summaries[mod])}`, '---', '', summaries[mod], '', '```ts', `import { ... } from '${subpath}';`, '```', '', ...howToSection(`${pkgDir}/${mod}`), '## API reference', '', apiMarkdown(api, 3)].join('\n'),
    );
    items.push({ label: mod, link: `/docs/api/${pkgDir}/${mod}/` });
    modulePages++;
  }
  const overview = ['---', `title: ${yaml(pkgName)}`, `description: ${yaml(intro)}`, '---', '', intro, '', '| Module | What it does |', '|---|---|'];
  for (const m of modules) overview.push(`| [\`${pkgName}/${m}\`](/docs/api/${pkgDir}/${m}/) | ${cell(summaries[m])} |`);
  write(join(contentDir, 'api', pkgDir, 'index.md'), `${overview.join('\n')}\n`);
  apiSidebar.push({ label: pkgName, collapsed: true, items: [{ label: 'Overview', link: `/docs/api/${pkgDir}/` }, ...items] });
}

if (howToProblems.length) {
  console.error(`generate: every API page needs a "How to use" section (docs/PLAN-R7.md):\n  ${howToProblems.join('\n  ')}`);
  process.exit(1);
}

// Quality pages.
await performancePage(components);
await accessibilityPage(components);
browserSupportPage();

const displayName = (n) => components.get(n)?.component.displayName ?? /^# (.+)$/m.exec(readFileSync(join(docsSrcDir, `${n}.md`), 'utf8'))?.[1] ?? n;

// Components overview, grouped as in the sidebar.
{
  const lines = ['---', 'title: Components', `description: ${yaml(`All ${names.length} AbsoluteUI components and ${addons.length} add-on entry points, grouped by purpose.`)}`, '---', '', 'Every component is its own subpath of `@absoluteui/components` with its own stylesheet. Import only what you use.', ''];
  for (const [label, list] of GROUPS) {
    lines.push(`## ${label}`, '', '| Component | What it does |', '|---|---|');
    for (const n of list) {
      const c = components.get(n);
      const purpose = c ? c.component.purpose : (ADDON_SUMMARIES[n] ?? '');
      lines.push(`| [${displayName(n)}](/docs/components/${n}/) | ${cell(stripSpec(firstSentence(purpose.replace(/\n/g, ' '))))} |`);
    }
    lines.push('');
  }
  write(join(contentDir, 'components', 'index.md'), lines.join('\n'));
}

// Angular documentation.
// Live Angular frames (R12) are built after buildExamples, which cleans public/examples.
const angularFrames = angularEnabled ? buildAngularFrames(angularEntries()) : new Map();
const angularSidebar = angularEnabled ? generateAngular(angularFrames) : null;
const angularFrameCount = [...angularFrames.values()].reduce((n, m) => n + m.size, 0);

// Sidebar.
const sidebar = {
  components: [{ label: 'Overview', link: '/docs/components/' }, ...GROUPS.map(([label, list]) => ({ label, collapsed: true, items: list.map((n) => ({ label: displayName(n), link: `/docs/components/${n}/` })) }))],
  api: apiSidebar,
  ...(angularSidebar ? { angular: angularSidebar } : {}),
};
write(join(generatedDir, 'sidebar.json'), `${JSON.stringify(sidebar, null, 2)}\n`);
write(join(generatedDir, 'stats.json'), `${JSON.stringify({ components: names.length, addons: addons.length, liveExamples: count, angularFrames: angularFrameCount, packages: PACKAGES.length, angular: angularEnabled }, null, 2)}\n`);

// Legal details for the footer. One website (docs/PLAN-ONE-SITE.md OS-11): the legal pages and
// security.txt live once at the site root, so the footer links them by path and the docs no longer
// write their own security.txt (a copy left by an older build is removed).
const legal = loadLegal();
write(join(generatedDir, 'legal.json'), `${JSON.stringify({ company: legal.company, copyrightYear: legal.copyrightYear, repository: legal.repository, pages: pagePaths(legal) }, null, 2)}\n`);
rmSync(join(siteDir, 'public', '.well-known'), { recursive: true, force: true });

console.log(`generate: ${names.length} components, ${addons.length} add-ons, ${count} live examples, ${PACKAGES.length} API pages, ${modulePages} module pages${angularEnabled ? ', Angular pages' : ''} (${Date.now() - started} ms)`);
