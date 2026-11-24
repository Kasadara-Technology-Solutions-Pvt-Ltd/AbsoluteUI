/* global window, document -- callbacks passed to page.evaluate run in the browser. */
// Browser sweep of the built site: every page and every live example loads without
// CSP violations, script errors, or failed requests, and every example renders.
// Serves apps/site/dist itself on SITE_PORT (default 4341), as static hosting would.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { BASE, siteDir } from './lib/shared.mjs';

const dist = join(siteDir, 'dist');
const port = Number(process.env.SITE_PORT ?? 4341);
const base = `http://127.0.0.1:${port}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.pf_meta': 'application/octet-stream' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', base).pathname);
  // The build is served under the docs base (docs/PLAN-ONE-SITE.md OS-3): /docs/x is dist/x.
  if (!path.startsWith(`${BASE}/`)) return void res.writeHead(404).end();
  let file = normalize(join(dist, path.slice(BASE.length)));
  if (!file.startsWith(dist)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
const SKIP = new Set(['examples', '_astro', 'pagefind']);

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      if (!SKIP.has(name)) pages(file, out);
    } else if (name === 'index.html') {
      const rel = relative(dist, dir).split(sep).join('/');
      out.push(rel ? `${BASE}/${rel}/` : `${BASE}/`);
    }
  }
  return out;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => {
  const log = [];
  Object.defineProperty(window, '__auiProblems', { value: log });
  document.addEventListener('securitypolicyviolation', (e) => log.push(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  window.addEventListener('error', (e) => log.push(`error ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => log.push(`rejection ${String(e.reason)}`));
});

const problems = [];
let frames = 0;
const list = pages(dist);
for (const path of list) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${path}: console ${m.text().slice(0, 160)}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`${path}: HTTP ${r.status()} ${r.url().replace(base, '')}`);
  });
  await page.goto(base + path, { waitUntil: 'load' });
  // Load every example now instead of on scroll.
  await page.evaluate(() => {
    for (const f of document.querySelectorAll('figure.aui-live iframe')) f.loading = 'eager';
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(300);
  for (const p of await page.evaluate(() => window.__auiProblems)) problems.push(`${path}: ${p}`);
  for (const frame of page.frames().slice(1)) {
    frames++;
    const url = frame.url().replace(base, '').replace(/\?.*$/, '');
    // Examples run module scripts: under load they can render after the first snapshot, so wait (bounded) for content.
    // Angular frames (R12) always hold <router-outlet> in <frame-root>; their content is the mounted example beside it.
    const rendered = () => {
      const host = document.querySelector('frame-root');
      const items = host ? [...host.children].filter((el) => el.localName !== 'router-outlet') : [...document.body.children];
      return items.some((el) => el.children.length > 0 || el.textContent.trim() !== '');
    };
    await frame.waitForFunction(rendered, undefined, { timeout: 5000 }).catch(() => undefined);
    const info = await Promise.all([frame.evaluate(rendered), frame.evaluate(() => window.__auiProblems ?? [])])
      .then(([shown, found]) => ({ rendered: shown, problems: found }))
      .catch((e) => ({ rendered: false, problems: [String(e).slice(0, 120)] }));
    if (!info.rendered) problems.push(`${url}: rendered nothing`);
    for (const p of info.problems) problems.push(`${url}: ${p}`);
    // Consistent look: every visible native control in an example is an AbsoluteUI control (its own
    // aui- class) or a native control styled by Form Field or Button Group. File inputs keep the
    // browser's file chooser.
    const unstyled = await frame
      .evaluate(() =>
        [...document.querySelectorAll('button, input:not([type="hidden"]):not([type="file"]), select, textarea')]
          .filter((el) => el.getClientRects().length > 0)
          .filter((el) => ![...el.classList].some((c) => c.startsWith('aui-')) && !el.closest('.aui-form-field, .aui-button-group'))
          .map((el) => `<${el.localName}> "${(el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || ''}"`),
      )
      .catch(() => []);
    for (const u of unstyled) problems.push(`${url}: unstyled native control ${u}`);
  }
  await page.close();
}
await browser.close();
server.close();

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(`check-live: ${unique.length} problem(s) on ${list.length} pages and ${frames} example frames`);
  for (const p of unique) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-live: ok (${list.length} pages, ${frames} example frames)`);
