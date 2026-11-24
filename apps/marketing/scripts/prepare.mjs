// Prepare generated inputs for the marketing site (R4 phase C): gallery data (checked
// against component metadata), evidence figures, the license and security texts, the
// live frames, and a warning for every remaining link placeholder.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadLegal, notices, securityTxt } from '../../../scripts/legal.mjs';
import { buildFrames } from './lib/frames.mjs';
import { collectStats } from './lib/stats.mjs';
import { appDir, clean, componentNames, dataDir, generatedDir, loadLinks, metaDir, placeholders, publicDir, readJson, root, write } from './lib/shared.mjs';

const errors = [];
clean(generatedDir);

// Gallery: every component has exactly one entry with a known tab and a blurb.
const gallery = readJson(join(dataDir, 'components.json'));
const tabIds = new Set(gallery.tabs.map((t) => t.id));
const names = componentNames();
for (const name of names) if (!gallery.components[name]) errors.push(`data/components.json: no entry for ${name}`);
const components = [];
for (const [name, entry] of Object.entries(gallery.components)) {
  if (!names.includes(name)) {
    errors.push(`data/components.json: unknown component ${name}`);
    continue;
  }
  if (!tabIds.has(entry.tab)) errors.push(`data/components.json: ${name} has unknown tab ${entry.tab}`);
  if (!entry.blurb || entry.blurb.length > 90) errors.push(`data/components.json: ${name} blurb missing or longer than 90 characters`);
  const meta = readJson(join(metaDir, name, 'component.json'));
  const preview = `media/components/${name}.jpg`;
  components.push({
    name,
    displayName: meta.displayName.replace(/ \(.*\)$/, ''),
    tab: entry.tab,
    featured: entry.featured === true,
    blurb: entry.blurb,
    docsPath: `/docs/components/${name}/`,
    preview: existsSync(join(publicDir, preview)) ? `/${preview}` : null,
  });
}
components.sort((a, b) => a.displayName.localeCompare(b.displayName));
write(join(generatedDir, 'components.json'), JSON.stringify({ tabs: gallery.tabs, components }, null, 2));
const missingPreviews = components.filter((c) => !c.preview).map((c) => c.name);

// Demos: ids are slugs, screenshots exist, URLs are https.
const demos = readJson(join(dataDir, 'demos.json')).demos;
for (const d of demos) {
  if (!/^[a-z0-9-]+$/.test(d.id)) errors.push(`data/demos.json: bad id ${d.id}`);
  if (d.url && !/^https:\/\//.test(d.url)) errors.push(`data/demos.json: ${d.id} url must be https`);
  d.screens = d.screens.map((s) => ({ ...s, src: existsSync(join(publicDir, 'media', 'demos', d.id, s.file)) ? `/media/demos/${d.id}/${s.file}` : null }));
  d.recordingSrc = d.recording && existsSync(join(publicDir, 'media', 'demos', d.id, d.recording)) ? `/media/demos/${d.id}/${d.recording}` : null;
}
write(join(generatedDir, 'demos.json'), JSON.stringify(demos, null, 2));

// Theme Designer screenshots.
const designerShots = ['designer-colors.png', 'designer-compliance.png', 'designer-export.png'].map((f) => (existsSync(join(publicDir, 'media', 'designer', f)) ? `/media/designer/${f}` : null));
write(join(generatedDir, 'designer.json'), JSON.stringify({ screens: designerShots }, null, 2));

// Theme showcase accents (MR-3): the frame runtime's accent list, with the role tokens the Theme
// Designer engine derives for each (shown beside the live frame).
{
  const runtimeSrc = readFileSync(join(appDir, 'frames', 'runtime.ts'), 'utf8');
  const accents = [...runtimeSrc.matchAll(/\{ id: '([a-z]+)', label: '([^']+)', primary: '(#[0-9A-Fa-f]{6})', accent: '(#[0-9A-Fa-f]{6})' \}/g)].map((m) => ({ id: m[1], label: m[2], primary: m[3], accent: m[4] }));
  if (accents.length < 2) errors.push('frames/runtime.ts: accent list not found');
  const theme = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);
  const designerEngine = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'designer', 'index.js')).href);
  const shown = ['color-primary', 'color-primary-hover', 'color-focus-ring'];
  const out = accents.map((a) => {
    const tokens = designerEngine.deriveMode({ ...theme.absoluteDefault.seeds, primary: a.primary, accent: a.accent }, 'light');
    return { ...a, tokens: Object.fromEntries(shown.map((k) => [k, String(tokens[k]).toLowerCase()])) };
  });
  write(join(generatedDir, 'accents.json'), JSON.stringify(out, null, 2));
}

// Evidence figures and reports availability.
const stats = await collectStats();
stats.reports = {
  accessibility: existsSync(join(publicDir, 'reports', 'accessibility-report.pdf')) ? '/reports/accessibility-report.pdf' : null,
  performance: existsSync(join(publicDir, 'reports', 'performance-report.pdf')) ? '/reports/performance-report.pdf' : null,
};
write(join(generatedDir, 'stats.json'), JSON.stringify(stats, null, 2));
if (!stats.evidence) console.warn('prepare: no evidence.json (run npm run test:e2e, then npm run site:evidence); evidence sections show a notice');

// License and security texts, rendered on /license and /security.
// The page hero carries the title: drop each document's own top-level heading (one h1 per page).
const dropTitle = (md) => md.replace(/^# [^\n]*\n+/, '');
const LICENSE_INTRO = 'AbsoluteUI is open source, Kasadara Technology Solutions Pvt Ltd\'s contribution to the open-source community. The source is on [GitHub](https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI). AbsoluteUI is licensed under the Apache License, Version 2.0. You may use, modify, and redistribute it, including in commercial products, under the conditions of the license: keep the copyright, license, and NOTICE texts, and state the changes you make. Versions 0.9.0 to 0.13.0 as first published to the package feed were offered under the AbsoluteUI Free Use License 1.0; the source in the public repository and every later release are licensed under the Apache License 2.0.';
const fence = '```';
write(join(generatedDir, 'license.md'), [
  `${LICENSE_INTRO}`,
  '## NOTICE',
  `${fence}text\n${readFileSync(join(root, 'NOTICE'), 'utf8').trim()}\n${fence}`,
  '## License text',
  `${fence}text\n${readFileSync(join(root, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim()}\n${fence}`,
].join('\n\n') + '\n');
// Links to the license point at /license/; references to the internal specification are dropped.
const security = dropTitle(readFileSync(join(root, 'SECURITY.md'), 'utf8'))
  .replace(/\]\(LICENSE\)/g, '](/license/)')
  .replace(/;?\s*see SPEC section [\d.]+/g, '')
  .replace(/\s*\(SPEC section[^)]*\)/g, '');
if (/SPEC section \d/.test(security)) errors.push('SECURITY.md: unhandled SPEC section reference');
write(join(generatedDir, 'security.md'), security);
// Privacy Policy and Terms of Use (shared by all three sites), company details, third-party
// notices, and security.txt, all from the repository root (legal.json, scripts/legal.mjs).
for (const name of ['PRIVACY', 'TERMS']) write(join(generatedDir, `${name.toLowerCase()}.md`), dropTitle(readFileSync(join(root, `${name}.md`), 'utf8')));
const legal = loadLegal();
write(join(generatedDir, 'legal.json'), JSON.stringify({ ...legal, notices: notices(legal) }, null, 2));
write(join(publicDir, '.well-known', 'security.txt'), securityTxt('marketing', new Date(), legal));

// Links: build values and dev values.
write(join(generatedDir, 'links.json'), JSON.stringify({ build: loadLinks(), dev: loadLinks({ dev: true }) }, null, 2));
const open = placeholders(loadLinks());
for (const p of open) console.warn(`prepare: placeholder link ${p}`);

const frames = await buildFrames();

if (errors.length) {
  console.error(`prepare: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`prepare: ${components.length} components (${missingPreviews.length} without preview), ${demos.length} demo(s), ${frames} frames, ${open.length} placeholder link(s)`);
if (missingPreviews.length) console.warn(`prepare: run npm run marketing:capture for previews of: ${missingPreviews.slice(0, 8).join(', ')}${missingPreviews.length > 8 ? ', ...' : ''}`);
