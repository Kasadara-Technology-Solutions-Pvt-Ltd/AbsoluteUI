/* global window -- callbacks passed to page.evaluate run in the browser. */
// Originality check (docs/icons/icon-design-spec-draft.md section 10): rasterizes every compiled icon
// (outline and solid, also mirrored) and every icon of the dev-only reference sets approved for tests
// (Lucide, Font Awesome free solid, Material Symbols outlined; R8 D8), and reports the closest match.
// The score is the lower of two similarities at 64px: the F1 of contour points within one pixel of
// each other, and the intersection over union of the filled pixels. Icons at or above the threshold must be redesigned, or listed in originality-exceptions.json with a
// reason (simple primitives such as a chevron are alike in every set). Local only; needs `npm run build`.
//   node scripts/icons/originality.mjs [--ids a,b] [--threshold 0.75] [--report]
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const threshold = Number(arg('threshold') ?? 0.75);
const ids = arg('ids')?.split(',').filter(Boolean);
const exceptions = existsSync(join(root, 'scripts', 'icons', 'originality-exceptions.json')) ? JSON.parse(readFileSync(join(root, 'scripts', 'icons', 'originality-exceptions.json'), 'utf8')) : {};

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const attrs = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${escape(v)}"`).join('');

// Reference sets (deduplicated by geometry), rendered at 64px.
async function references() {
  const out = [];
  const seen = new Set();
  const add = (lib, name, kind, svg) => {
    const key = `${kind}:${svg}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ref: `${lib}/${name}`, kind, svg });
  };
  const lucide = await import('lucide');
  for (const [name, nodes] of Object.entries(lucide)) {
    if (!Array.isArray(nodes) || !nodes.every((n) => Array.isArray(n) && typeof n[0] === 'string')) continue;
    add('lucide', name, 'outline', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${nodes.map(([tag, a]) => `<${tag}${attrs(a)}/>`).join('')}</svg>`);
  }
  const fa = await import('@fortawesome/free-solid-svg-icons');
  for (const def of Object.values(fa.fas)) {
    const [w, h, , , d] = def.icon;
    const paths = (Array.isArray(d) ? d : [d]).map((p) => `<path d="${escape(p)}"/>`).join('');
    add('fontawesome', def.iconName, 'solid', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="64" height="64" fill="black">${paths}</svg>`);
  }
  const material = join(root, 'node_modules', '@material-symbols', 'svg-400', 'outlined');
  for (const file of readdirSync(material).filter((f) => f.endsWith('.svg'))) {
    const svg = readFileSync(join(material, file), 'utf8').replace('<svg ', '<svg width="64" height="64" fill="black" ');
    add('material', file.slice(0, -4), file.endsWith('-fill.svg') ? 'solid' : 'outline', svg);
  }
  return out;
}

for (const file of ['packages/icons/dist/index.js', 'packages/icons/dist/set/index.js']) if (!existsSync(join(root, file))) throw new Error(`${file} is missing: run npm run build first`);
const refs = await references();

const importMap = () => {
  const imports = {};
  for (const pkg of ['core', 'helpers', 'utilities', 'icons']) {
    const json = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8'));
    for (const [key, value] of Object.entries(json.exports ?? {})) {
      const target = typeof value === 'string' ? value : value.default;
      if (typeof target === 'string' && !key.includes('*') && target.endsWith('.js')) imports[`@absoluteui/${pkg}${key.slice(1)}`] = `/packages/${pkg}/${target.slice(target.startsWith('./') ? 2 : 0)}`;
    }
  }
  return JSON.stringify({ imports });
};
mkdirSync(join(root, '.cache', 'icons'), { recursive: true });
writeFileSync(join(root, '.cache', 'icons', 'originality.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>originality</title><script type="importmap">${importMap()}</script></head><body><script type="module">
import { renderIcon } from '@absoluteui/icons';
import * as set from '/packages/icons/dist/set/index.js';
window.ours = Object.values(set).filter((d) => d.kind === 'vector').flatMap((d) => ['outline', 'solid'].filter((v) => d.variants[v]).flatMap((v) => [false, true].map((flip) => {
  const el = renderIcon(d, { variant: v, ...(flip ? { flip: 'horizontal' } : {}) });
  el.setAttribute('width', '64'); el.setAttribute('height', '64'); el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return { id: d.id, kind: v, flip, svg: new XMLSerializer().serializeToString(el) };
})));
const N = 64;
window.mask = async (svg) => {
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const canvas = new OffscreenCanvas(N, N);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, N, N);
  const data = ctx.getImageData(0, 0, N, N).data;
  const m = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) m[i] = data[i * 4 + 3] >= 96 ? 1 : 0;
  return m;
};
const dilate = (m) => {
  const d = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (m[y * N + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X >= 0 && Y >= 0 && X < N && Y < N) d[Y * N + X] = 1;
  }
  return d;
};
// Contours: filled pixels with an empty 4-neighbour. Comparing contours (not areas) keeps large filled
// silhouettes (a disc and a hexagon) from matching just because they cover the same pixels.
const edges = (m) => {
  const e = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (!m[i]) continue;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1 || !m[i - 1] || !m[i + 1] || !m[i - N] || !m[i + N]) e[i] = 1;
  }
  return e;
};
const count = (m) => m.reduce((a, b) => a + b, 0);
window.prepare = async () => {
  window.masks = [];
  for (const o of window.ours) { const m = await window.mask(o.svg); const e = edges(m); window.masks.push({ ...o, m, area: count(m), e, d: dilate(e), n: count(e), best: { score: 0, ref: '' } }); }
};
window.compare = async (chunk) => {
  for (const r of chunk) {
    let m;
    try { m = await window.mask(r.svg); } catch { continue; }
    const e = edges(m);
    const area = count(m);
    const d = dilate(e);
    const n = count(e);
    if (!n) continue;
    for (const o of window.masks) {
      if (o.kind !== r.kind || !o.n) continue;
      // F1 of contour points that lie within one pixel of the other contour (64px rendering).
      let ab = 0, ba = 0;
      for (let i = 0; i < N * N; i++) { if (o.e[i] && d[i]) ab++; if (e[i] && o.d[i]) ba++; }
      const precision = ab / o.n, recall = ba / n;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      // And the intersection over union of the filled pixels: a near copy scores high on both.
      let both = 0;
      for (let i = 0; i < N * N; i++) if (o.m[i] && m[i]) both++;
      const score = Math.min(f1, both / (o.area + area - both));
      if (score > o.best.score) o.best = { score, ref: r.ref };
    }
  }
};
window.result = () => window.masks.map(({ id, kind, flip, best }) => ({ id, kind, flip, ...best }));
document.body.dataset.ready = 'true';
</script></body></html>`);

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const server = createServer((req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)));
  if (!file.startsWith(root + sep) || !existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const browser = await chromium.launch();
let rows;
try {
  const page = await browser.newPage();
  await page.route('**/*', (route) => (route.request().url().startsWith(`http://127.0.0.1:${String(port)}/`) || route.request().url().startsWith('data:') ? route.continue() : route.abort()));
  await page.goto(`http://127.0.0.1:${String(port)}/.cache/icons/originality.html`);
  await page.waitForSelector('body[data-ready="true"]', { state: 'attached' });
  await page.evaluate(() => window.prepare());
  for (let k = 0; k < refs.length; k += 400) await page.evaluate((chunk) => window.compare(chunk), refs.slice(k, k + 400));
  rows = await page.evaluate(() => window.result());
} finally {
  await browser.close();
  server.close();
}

// Best match per icon and variant (mirrored or not).
const best = new Map();
for (const r of rows) {
  if (ids && !ids.includes(r.id)) continue;
  const key = `${r.id} ${r.kind}`;
  if (!best.has(key) || best.get(key).score < r.score) best.set(key, r);
}
const flagged = [];
const lines = [...best.values()].sort((a, b) => b.score - a.score).map((r) => {
  const exception = exceptions[r.id];
  const over = r.score >= threshold;
  if (over && !exception) flagged.push(r);
  return `${over ? (exception ? 'EXCEPTION' : 'FLAG     ') : 'ok       '} ${r.score.toFixed(3)}  ${r.id} (${r.kind}${r.flip ? ', mirrored' : ''}) ~ ${r.ref}${over && exception ? `  [${exception}]` : ''}`;
});
if (process.argv.includes('--report') || flagged.length) console.log(lines.join('\n'));
console.log(`originality: ${String(best.size)} icon variants against ${String(refs.length)} reference icons; threshold ${String(threshold)}; ${String(flagged.length)} flagged`);
if (flagged.length) process.exit(1);
