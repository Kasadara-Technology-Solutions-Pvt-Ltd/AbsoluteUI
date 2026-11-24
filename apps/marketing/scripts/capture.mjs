// Capture the marketing site's screenshots and the demo recording (docs/PLAN-R4.md C7, C11).
// Output is committed under public/media/ and regenerated on demand:
//   components  one preview per component from the docs examples (apps/site/public/examples,
//               built by `npm run site:build` or `npm run generate -w apps/site`)
//   designer    three Theme Designer views (starts apps/theme-designer/serve.mjs)
//   demo        PeopleHub screens and a short recording (starts the built demo server; needs
//               PostgreSQL and apps/demo-hrms/.env; the demo password is read from that file)
//   blocks      one thumbnail per block from the built block frames (public/frames)
// Usage: node scripts/capture.mjs [--only=components,designer,demo,blocks]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { serve } from './lib/serve.mjs';
import { appDir, componentNames, metaDir, publicDir, readJson, root } from './lib/shared.mjs';

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]?.split(',') ?? ['components', 'designer', 'demo', 'blocks'];
const media = join(publicDir, 'media');
const browser = await chromium.launch();

/** Wait until a local server answers on `url`, or fail after `timeoutMs`. */
async function waitFor(url, timeoutMs = 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.status < 500) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`capture: ${url} did not start`);
}

function start(args, env = {}) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  child.on('exit', (code) => {
    if (code) console.error(`capture: ${args.join(' ')} exited with ${code}\n${stderr.slice(-2000)}`);
  });
  return child;
}

/** Per-component preview choices: a better example, a site-owned frame, or an action that opens an overlay. */
const PREVIEWS = {
  button: { frame: true },
  'button-group': { frame: true },
  'upload-queue': { frame: true },
  sidebar: { example: 'basic', width: 900 },
  // Featured (large) cards: a wider viewport, so the preview is not an enlarged crop.
  'data-table': { width: 900, height: 450 },
  // The docs example sizes its host inline; the marketing frame shows the grid at a useful size.
  'data-grid': { frameId: 'flag-grid', width: 900, height: 450 },
  'pivot-grid': { width: 900, height: 450 },
  kanban: { width: 900, height: 450 },
  gantt: { width: 900, height: 450 },
  'org-chart': { width: 900, height: 450 },
  scheduler: { width: 900, height: 450 },
  // Its docs example misses the Sparkline stylesheet (doc header omission); add it.
  'stat-card': { css: ['sparkline'] },
  skeleton: { frame: true },
  'bottom-sheet': { frame: true },
  'context-menu': { frame: true },
  'dashboard-grid': { width: 900 },
  layout: { example: 'toolbar' },
  sparkline: { example: 'bars' },
  menu: { action: 'click' },
  popover: { action: 'click' },
  'hover-card': { action: 'hover' },
  tooltip: { action: 'focus' },
  'session-warning-dialog': {},
};

async function components() {
  const examples = join(root, 'apps', 'site', 'public', 'examples');
  if (!existsSync(examples)) throw new Error('capture: no docs examples; run npm run generate -w apps/site first');
  const out = join(media, 'components');
  mkdirSync(out, { recursive: true });
  const docs = await serve(join(root, 'apps', 'site', 'public'));
  const site = await serve(publicDir);
  // Capture only: the injected layout style would be blocked by the example CSP.
  const context = await browser.newContext({ viewport: { width: 560, height: 350 }, deviceScaleFactor: 1280 / 560, bypassCSP: true, reducedMotion: 'reduce' });
  let done = 0;
  for (const name of componentNames()) {
    const ids = readJson(join(metaDir, name, 'examples.json'));
    const list = Array.isArray(ids) ? ids : ids.examples;
    const dir = join(examples, name);
    const choice = PREVIEWS[name] ?? {};
    const available = existsSync(dir) ? list.map((e) => e.id).filter((id) => existsSync(join(dir, `${id}.html`))) : [];
    const example = choice.example && available.includes(choice.example) ? choice.example : available[0];
    const frameId = choice.frameId ?? name;
    const url = choice.frame || choice.frameId || !example ? (existsSync(join(publicDir, 'frames', `${frameId}.html`)) ? `${site.url}/frames/${frameId}.html` : null) : `${docs.url}/examples/${name}/${example}.html`;
    if (!url) {
      console.warn(`capture: no live example for ${name}`);
      continue;
    }
    const page = await context.newPage();
    if (choice.width) await page.setViewportSize({ width: choice.width, height: choice.height ?? Math.round((choice.width * 350) / 560) });
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const css of choice.css ?? []) await page.addStyleTag({ url: `${docs.url}/examples/css/${css}.css` });
    await page.waitForTimeout(name === 'upload-queue' ? 2600 : 500);
    // Small content: centre it in a readable column and enlarge it slightly (not for the
    // wide featured previews, which should show the component at its natural width).
    if (!choice.width) await page.evaluate(() => {
      const kids = [...document.body.children].filter((e) => !(e instanceof HTMLScriptElement));
      const bottom = kids.reduce((b, e) => Math.max(b, e.getBoundingClientRect().bottom), 0);
      if (bottom < innerHeight * 0.6) {
        const s = document.body.style;
        s.setProperty('min-height', '100vh');
        s.setProperty('box-sizing', 'border-box');
        s.setProperty('align-content', 'center');
        s.setProperty('justify-content', 'center');
        s.setProperty('grid-template-columns', 'min(100%, 24rem)');
        s.setProperty('zoom', '1.2');
        s.setProperty('min-height', 'calc(100vh / 1.2)');
      }
    });
    // Overlays: open them, so the preview shows the surface rather than its trigger.
    const trigger = page.locator('body button, body a').first();
    if (choice.action === 'click') await trigger.click().catch(() => undefined);
    else if (choice.action === 'hover') await trigger.hover().catch(() => undefined);
    else if (choice.action === 'focus') await trigger.focus().catch(() => undefined);
    else if (choice.action === 'context') await page.locator('body li, body [role="row"], body p').first().click({ button: 'right' }).catch(() => undefined);
    if (choice.action) await page.waitForTimeout(700);
    // Wide featured previews: crop to the content, so short examples leave no empty band.
    let clip;
    if (choice.width) {
      const bottom = await page.evaluate(() => Math.max(...[...document.body.querySelectorAll('*')].map((e) => e.getBoundingClientRect().bottom), 0));
      const vp = page.viewportSize();
      if (vp) clip = { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, Math.max(200, Math.ceil(bottom) + 24)) };
    }
    await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 86, ...(clip ? { clip } : {}) });
    await page.close();
    done++;
  }
  await context.close();
  await docs.close();
  await site.close();
  console.log(`capture: ${done} component previews`);
}

/** One thumbnail per block (data/blocks.json), from the built block frames. */
async function blocks() {
  const out = join(media, 'blocks');
  mkdirSync(out, { recursive: true });
  const site = await serve(publicDir);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const { blocks: list } = readJson(join(appDir, 'data', 'blocks.json'));
  for (const b of list) {
    const page = await context.newPage();
    await page.goto(`${site.url}/frames/block-${b.id}.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `${b.id}.jpg`), type: 'jpeg', quality: 86 });
    await page.close();
  }
  await context.close();
  await site.close();
  console.log(`capture: ${list.length} block thumbnails`);
}

async function designer() {
  const out = join(media, 'designer');
  mkdirSync(out, { recursive: true });
  const port = 4331;
  const server = start(['apps/theme-designer/serve.mjs'], { DESIGNER_PORT: String(port) });
  try {
    await waitFor(`http://127.0.0.1:${port}/`, 120_000);
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.getByRole('tab', { name: 'Seeds' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, 'designer-colors.png') });
    await page.getByRole('tab', { name: 'Tokens' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, 'designer-compliance.png') });
    await page.getByRole('tab', { name: 'Files' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(out, 'designer-export.png') });
    await context.close();
    console.log('capture: 3 Theme Designer screenshots');
  } finally {
    server.kill();
  }
}

function envValue(key) {
  const file = join(root, 'apps', 'demo-hrms', '.env');
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1] === key) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

async function demo() {
  const id = 'peoplehub';
  const out = join(media, 'demos', id);
  mkdirSync(out, { recursive: true });
  const main = join(root, 'apps', 'demo-hrms', '.out', 'server', 'main.js');
  if (!existsSync(main)) throw new Error('capture: build the demo first (npm run build -w apps/demo-hrms)');
  const password = envValue('DEMO_SEED_PASSWORD');
  if (!password) throw new Error('capture: DEMO_SEED_PASSWORD missing in apps/demo-hrms/.env');
  const base = `http://127.0.0.1:${envValue('DEMO_PORT') ?? '4350'}`;
  const server = start([main]);
  try {
    await waitFor(`${base}/`);
    const videoDir = join(appDir, '.cache-video');
    rmSync(videoDir, { recursive: true, force: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, reducedMotion: 'reduce', recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } } });
    const page = await context.newPage();
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.locator('input[name="email"]').fill('hr@demo.test');
    await page.locator('input[name="password"]').fill(password);
    const login = page.waitForResponse((r) => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Continue' }).click();
    const body = await (await login).json();
    const code = body?.data?.demoCode ?? body?.demoCode;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw new Error('capture: the demo did not return a demo code (DEMO_OTP_MODE=clock is required)');
    // The code step focuses the OTP input; typing all six digits submits it.
    await page.waitForTimeout(600);
    await page.keyboard.type(code, { delay: 60 });
    await page.waitForURL(`${base}/`, { timeout: 20_000 }).catch(() => undefined);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    const shots = readJson(join(appDir, 'data', 'demos.json')).demos.find((d) => d.id === id).screens;
    const routes = { 'dashboard.png': '/', 'directory.png': '/employees', 'time.png': '/time', 'organization.png': '/organization' };
    for (const s of shots) {
      const path = routes[s.file];
      if (!path) continue;
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, s.file) });
    }
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await context.close();
    const video = readdirSync(videoDir).find((f) => f.endsWith('.webm'));
    if (video) renameSync(join(videoDir, video), join(out, 'recording.webm'));
    rmSync(videoDir, { recursive: true, force: true });
    console.log(`capture: ${shots.length} demo screens and a recording`);
  } finally {
    server.kill();
  }
}

try {
  if (only.includes('components')) await components();
  if (only.includes('designer')) await designer();
  if (only.includes('demo')) await demo();
  if (only.includes('blocks')) await blocks();
} finally {
  await browser.close();
}
