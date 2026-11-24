// Contact sheets for human review (R16-16, docs/PLAN-R16-ICONS.md section 3): every variant at 16, 20,
// 24, 32, and 48px on light, dark, and high-contrast themes; custom colors; compositions; mirroring;
// animation frames beside their reduced-motion static state. Writes .cache/icons/sheets/<name>.html and
// a PNG screenshot. Local only: a static server on 127.0.0.1, no network. Needs `npm run build` first.
//   node scripts/icons/contact-sheet.mjs [--name pilot] [--ids a,b,c] [--no-png] [--serve [--port 4370]]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const name = arg('name') ?? 'all';
if (!/^[a-z0-9-]{1,40}$/.test(name)) throw new Error('--name: lowercase letters, digits, and hyphens');
const ids = arg('ids')?.split(',').filter(Boolean);
const outDir = join(root, '.cache', 'icons', 'sheets');
for (const file of ['packages/icons/dist/index.js', 'packages/icons/dist/set/index.js', 'packages/theme/dist/absolute-default.css']) {
  if (!existsSync(join(root, file))) throw new Error(`${file} is missing: run npm run build first`);
}

// Demo compositions and animations for the sheet (only those whose icons and overlays exist are shown).
const COMPOSITIONS = [
  { icon: 'file', overlays: ['lock'] },
  { icon: 'user', overlays: ['check'] },
  { icon: 'folder', overlays: ['lock'] },
  { icon: 'bell', overlays: ['dot'], anchor: 'top-end' },
  { icon: 'user', container: 'circle' },
];

/** Import map for the built packages the icons module loads (core and its helpers). */
function importMap() {
  const imports = {};
  for (const pkg of ['core', 'helpers', 'utilities', 'icons']) {
    const json = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8'));
    for (const [key, value] of Object.entries(json.exports ?? {})) {
      const target = typeof value === 'string' ? value : value.default;
      if (typeof target !== 'string' || key.includes('*') || !target.endsWith('.js')) continue;
      imports[`@absoluteui/${pkg}${key.slice(1)}`] = `/packages/${pkg}/${target.slice(target.startsWith('./') ? 2 : 0)}`;
    }
  }
  return JSON.stringify({ imports });
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AbsoluteUI icons: ${name}</title>
<link rel="stylesheet" href="/packages/theme/dist/absolute-default.css">
<script type="importmap">${importMap()}</script>
<style>
  body { margin: 0; font-family: "Noto Sans", var(--aui-font-family-sans, system-ui), sans-serif; font-size: 12px; background: #fff; color: #111; }
  h1 { font-size: 18px; margin: 16px; } h2 { font-size: 14px; margin: 16px 16px 8px; }
  .themes { display: grid; grid-template-columns: repeat(3, max-content); gap: 0; }
  .panel { padding: 12px 16px; background: var(--aui-color-surface); color: var(--aui-color-text); }
  .panel > header { font-weight: 600; margin-bottom: 8px; }
  table { border-collapse: collapse; } td, th { padding: 4px 6px; text-align: center; vertical-align: middle; } th { font-weight: 600; }
  td.id { text-align: start; font-family: ui-monospace, monospace; white-space: nowrap; }
  .na { color: var(--aui-color-text-muted); }
  .row { display: flex; flex-wrap: wrap; gap: 24px; margin: 0 16px 16px; align-items: flex-end; }
  .cell { display: grid; justify-items: center; gap: 4px; }
  .grid-bg { background-image: linear-gradient(to right, rgba(127,127,127,.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(127,127,127,.25) 1px, transparent 1px); background-size: 4px 4px; }
</style>
</head>
<body>
<h1>AbsoluteUI icons: ${name}</h1>
<main id="sheet"></main>
<script type="module">
  import { renderIcon, animateIcon, setIconMotionPolicy } from '@absoluteui/icons';
  import * as set from '/packages/icons/dist/set/index.js';
  const wanted = ${JSON.stringify(ids ?? null)};
  const compositions = ${JSON.stringify(COMPOSITIONS)};
  const icons = Object.values(set).filter((d) => d.kind === 'vector' && (!wanted || wanted.includes(d.id))).sort((a, b) => a.id.localeCompare(b.id));
  const overlays = Object.fromEntries(Object.values(set).filter((d) => d.kind === 'overlay').map((d) => [d.id, d]));
  const VARIANTS = ['outline', 'solid', 'duotone', 'multicolor'];
  const SIZES = [16, 20, 24, 32, 48];
  const sheet = document.getElementById('sheet');
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
  const cell = (node, caption) => el('div', { class: 'cell' }, node, caption ?? '');

  // 1. Variants x sizes x themes.
  sheet.append(el('h2', {}, 'Variants and sizes'));
  const themes = el('div', { class: 'themes' });
  for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
    const table = el('table');
    const head = el('tr', {}, el('th', {}, 'icon'));
    for (const v of VARIANTS) head.append(el('th', { colspan: String(SIZES.length) }, v));
    table.append(head);
    for (const icon of icons) {
      const tr = el('tr', {}, el('td', { class: 'id' }, icon.id));
      for (const v of VARIANTS) for (const s of SIZES) {
        const td = el('td');
        if (icon.variants[v]) td.append(renderIcon(icon, { variant: v, size: s }));
        else if (s === 16) td.append(el('span', { class: 'na' }, '-'));
        tr.append(td);
      }
      table.append(tr);
    }
    themes.append(el('div', { class: 'panel', 'data-aui-theme': theme }, el('header', {}, theme), table));
  }
  sheet.append(themes);

  // 1b. Stroke width from the inherited custom property (R16-19).
  sheet.append(el('h2', {}, 'Stroke width from --aui-icon-stroke-width: 1.5, 2, 2.5 (24 and 48px)'));
  const strokes = el('div', { class: 'row' });
  for (const width of ['1.5', '2', '2.5']) {
    const group = el('div', { class: 'cell' });
    group.style.setProperty('--aui-icon-stroke-width', width);
    const line = el('span');
    for (const icon of icons.slice(0, 12)) line.append(renderIcon(icon, { size: 24 }), ' ');
    const big = el('span');
    for (const icon of icons.slice(0, 6)) big.append(renderIcon(icon, { size: 48 }), ' ');
    group.append(line, big, width);
    strokes.append(group);
  }
  sheet.append(strokes);

  // 2. Custom role colors and layer overrides.
  sheet.append(el('h2', {}, 'Custom colors (primary #7c3aed, secondary #0ea5e9, accent #f97316) and layer overrides'));
  const colors = el('div', { class: 'row' });
  for (const icon of icons) for (const v of ['duotone', 'multicolor']) if (icon.variants[v]) {
    colors.append(cell(renderIcon(icon, { variant: v, size: 48, colors: { primary: '#7c3aed', secondary: '#0ea5e9', accent: '#f97316' } }), icon.id + ' ' + v));
    if (v === 'duotone') colors.append(cell(renderIcon(icon, { variant: v, size: 48, layers: { secondary: { opacity: 0.6 } } }), 'secondary 0.6'));
  }
  sheet.append(colors);

  // 3. Compositions at 16, 24, and 48px.
  const byId = Object.fromEntries(icons.map((d) => [d.id, d]));
  // Every overlay on a file icon (from the full set, whatever the sheet's selection).
  const fileIcon = Object.values(set).find((d) => d.kind === 'vector' && d.id === 'file');
  if (fileIcon && Object.keys(overlays).length) {
    sheet.append(el('h2', {}, 'Overlays on file (16, 24, 48px)'));
    const row = el('div', { class: 'row' });
    for (const [id, ov] of Object.entries(overlays)) row.append(cell(el('span', {}, ...[16, 24, 48].flatMap((s) => [renderIcon(fileIcon, { size: s, overlays: [{ icon: ov }] }), ' '])), id));
    sheet.append(row);
  }
  const comps = compositions.filter((c) => byId[c.icon] && (c.overlays ?? []).every((o) => overlays[o]));
  if (comps.length) {
    sheet.append(el('h2', {}, 'Compositions'));
    const row = el('div', { class: 'row' });
    for (const c of comps) for (const s of [16, 24, 48]) {
      row.append(cell(renderIcon(byId[c.icon], { size: s, overlays: (c.overlays ?? []).map((o) => ({ icon: overlays[o], ...(c.anchor ? { anchor: c.anchor } : {}) })), ...(c.container ? { container: c.container } : {}) }), s === 48 ? c.icon + ' + ' + (c.overlays ?? [c.container]).join(' + ') : ''));
    }
    sheet.append(row);
  }

  // 4. Right-to-left mirroring.
  const mirrored = icons.filter((d) => d.mirror);
  if (mirrored.length) {
    sheet.append(el('h2', {}, 'Mirroring: left-to-right, then right-to-left'));
    const row = el('div', { class: 'row' });
    for (const icon of mirrored) row.append(cell(el('span', {}, renderIcon(icon, { size: 32 }), ' ', renderIcon(icon, { size: 32, dir: 'rtl' })), icon.id));
    sheet.append(row);
  }

  // 5. Live animations, repeating for review. A review sheet overrides a reduced-motion preference
  // (marked essential under the 'allow-essential' policy) and says so; applications never do this per instance.
  const animated = icons.filter((d) => d.animations?.length);
  if (animated.length) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) setIconMotionPolicy('allow-essential');
    sheet.append(el('h2', {}, 'Animations, live (repeating every 2 seconds)'));
    if (reduce) sheet.append(el('p', { class: 'row', role: 'note' }, 'Your system asks for reduced motion, so AbsoluteUI icons stay static in applications. This review sheet plays them anyway.'));
    const live = el('div', { class: 'row' });
    for (const icon of animated) for (const a of icon.animations) {
      const variant = a.target && !icon.variants.outline.some((l) => l.name === a.target) ? Object.keys(icon.variants).find((v) => icon.variants[v].some((l) => l.name === a.target)) : 'outline';
      const node = renderIcon(icon, { size: 48, variant });
      live.append(cell(node, icon.id + ' ' + a.preset + ' (' + a.trigger + ')'));
      try {
        const motion = animateIcon(node, { preset: a.preset, essential: true, ...(a.trigger === 'loading' ? {} : { trigger: 'manual' }) });
        if (a.trigger === 'loading') motion.setState('loading');
        else { motion.play(); setInterval(() => motion.restart(), 2000); }
      } catch (error) { live.append(el('span', { class: 'na' }, String(error.message ?? error))); }
    }
    sheet.append(live);
  }

  // 6. Animations frozen: the reduced-motion static state beside a frame at 50 percent.
  if (animated.length) {
    sheet.append(el('h2', {}, 'Animations frozen: static (reduced motion) and the frame at 50%'));
    const row = el('div', { class: 'row' });
    for (const icon of animated) for (const a of icon.animations) {
      const variant = a.target && !icon.variants.outline.some((l) => l.name === a.target) ? Object.keys(icon.variants).find((v) => icon.variants[v].some((l) => l.name === a.target)) : 'outline';
      const still = renderIcon(icon, { size: 48, variant });
      const moving = renderIcon(icon, { size: 48, variant });
      row.append(cell(el('span', {}, still, ' ', moving), icon.id + ' ' + a.preset + ' (' + a.trigger + ')'));
      try {
        const motion = animateIcon(moving, { preset: a.preset, ...(a.trigger === 'hover' || a.trigger === 'focus' || a.trigger === 'press' ? { trigger: 'manual' } : {}) });
        motion.play();
        for (const anim of moving.getAnimations({ subtree: true })) { anim.pause(); anim.currentTime = (anim.effect?.getTiming().duration ?? 0) / 2; }
        const css = moving.querySelector('[data-aui-motion-state="running"]');
        if (css) { css.removeAttribute('data-aui-motion-state'); css.style.transform = a.preset === 'spin' ? 'rotate(90deg)' : 'scale(1.08)'; }
      } catch (error) { row.append(el('span', { class: 'na' }, String(error.message ?? error))); }
    }
    sheet.append(row);
  }

  // 7. Pixel grid at 16px (each grid square is 4 CSS pixels at 4x zoom).
  sheet.append(el('h2', {}, 'Outline at 16px, zoomed 4x on a pixel grid'));
  const pixels = el('div', { class: 'row' });
  for (const icon of icons) {
    const holder = el('div', { class: 'grid-bg', style: 'zoom: 4; line-height: 0' }, renderIcon(icon, { size: 16 }));
    pixels.append(cell(holder, icon.id));
  }
  sheet.append(pixels);
  document.body.dataset.ready = 'true';
</script>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, `${name}.html`);
writeFileSync(htmlPath, page);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  if (path === '/') return void res.writeHead(302, { Location: `/.cache/icons/sheets/${name}.html` }).end();
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
});
const serve = process.argv.includes('--serve');
await new Promise((resolve) => server.listen(serve ? Number(arg('port') ?? 4370) : 0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const url = `http://127.0.0.1:${String(port)}/.cache/icons/sheets/${name}.html`;
if (serve) {
  console.log(`contact-sheet: serving ${url} (Ctrl+C to stop)`);
} else try {
  if (!process.argv.includes('--no-png')) {
    const browser = await chromium.launch();
    try {
      const pageHandle = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1600, height: 1000 } });
      const errors = [];
      pageHandle.on('pageerror', (e) => errors.push(e.message));
      pageHandle.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      // No network beyond the local server.
      await pageHandle.route('**/*', (route) => (route.request().url().startsWith(`http://127.0.0.1:${String(port)}/`) ? route.continue() : route.abort()));
      await pageHandle.goto(url);
      await pageHandle.waitForSelector('body[data-ready="true"]', { timeout: 15000 }).catch((error) => {
        throw new Error(`sheet did not finish: ${errors.join('; ') || String(error)}`);
      });
      if (errors.length) throw new Error(`sheet errors:\n${errors.join('\n')}`);
      await pageHandle.screenshot({ path: join(outDir, `${name}.png`), fullPage: true, animations: 'disabled' });
    } finally {
      await browser.close();
    }
    console.log(`contact-sheet: ${join('.cache', 'icons', 'sheets', `${name}.png`)}`);
  }
  console.log(`contact-sheet: ${join('.cache', 'icons', 'sheets', `${name}.html`)}`);
} finally {
  server.close();
}
